import { Prisma } from "@prisma/client";
import type { Task, TaskAssignment, User } from "@prisma/client";
import { prisma } from "../lib/prisma";

// M9 adds `task` to the include — accept needs the task's current deadline
// (for validating the recipient's scheduling choice) and the Inbox query
// needs the task's summary fields, both without a second round trip.
export type TaskAssignmentWithUsers = TaskAssignment & { fromUser: User; toUser: User; task: Task };

/** Thrown when the DB-level partial unique index rejects a second PENDING row for a task — see schema.prisma. */
export class DuplicatePendingAssignmentError extends Error {}

/** Thrown when an atomic conditional transition (accept) finds the row is no longer PENDING. */
export class AssignmentNotPendingError extends Error {}

const include = { fromUser: true, toUser: true, task: true } as const;

export function findById(id: string): Promise<TaskAssignmentWithUsers | null> {
  return prisma.taskAssignment.findUnique({ where: { id }, include });
}

export function findPendingByTaskId(taskId: string): Promise<TaskAssignmentWithUsers | null> {
  return prisma.taskAssignment.findFirst({ where: { taskId, status: "PENDING" }, include });
}

/** Inbox (FR-28): uses the existing @@index([toUserId, status]) directly. */
export function findInboxForRecipient(toUserId: string): Promise<TaskAssignmentWithUsers[]> {
  return prisma.taskAssignment.findMany({
    where: { toUserId, status: "PENDING" },
    include,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Sent (FR-29, M10): the sender's full history of requests, not just
 * PENDING ones — unlike Inbox, this is a historical record, not an
 * actionable queue, so every terminal status is included. `WHERE
 * fromUserId = ?` (no status filter) still uses the leading column of the
 * existing @@index([fromUserId, status]) composite index — a Postgres
 * btree index is usable by any prefix of its columns, so this doesn't need
 * a separate single-column index.
 */
export function findSentByUser(fromUserId: string): Promise<TaskAssignmentWithUsers[]> {
  return prisma.taskAssignment.findMany({
    where: { fromUserId },
    include,
    orderBy: { createdAt: "desc" },
  });
}

export async function create(data: {
  taskId: string;
  fromUserId: string;
  toUserId: string;
  message: string | null;
}): Promise<TaskAssignmentWithUsers> {
  try {
    return await prisma.taskAssignment.create({ data, include });
  } catch (error) {
    // P2002 = unique constraint violation. The only unique constraint this
    // insert can hit is the partial index enforcing "one PENDING per task"
    // (schema.prisma) — a concurrent request won the race between our
    // service-layer pre-check and this insert.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DuplicatePendingAssignmentError();
    }
    throw error;
  }
}

/**
 * Atomic conditional cancel: the WHERE clause includes `status: "PENDING"`
 * so this is a single compare-and-swap statement, not a
 * read-then-check-then-write — two concurrent cancel attempts (or a cancel
 * racing M9's accept/decline) can't both succeed, and there's no window
 * where a non-PENDING row could be overwritten. Returns null if the row
 * wasn't PENDING (already resolved) rather than throwing, so the service
 * can map that to the appropriate domain error.
 */
export async function cancelIfPending(id: string): Promise<TaskAssignmentWithUsers | null> {
  const result = await prisma.taskAssignment.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "CANCELLED", respondedAt: new Date() },
  });
  if (result.count === 0) {
    return null;
  }
  return prisma.taskAssignment.findUnique({ where: { id }, include });
}

/** Same atomic-conditional-update idiom as cancelIfPending, for decline (M9, FR-26/FR-27). */
export async function declineIfPending(id: string): Promise<TaskAssignmentWithUsers | null> {
  const result = await prisma.taskAssignment.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "DECLINED", respondedAt: new Date() },
  });
  if (result.count === 0) {
    return null;
  }
  return prisma.taskAssignment.findUnique({ where: { id }, include });
}

/**
 * The M9 acceptance transaction (FR-25, DATABASE.md §6): flips the
 * assignment PENDING -> ACCEPTED and the task's assigneeId/scheduledAt in
 * one Postgres transaction (`prisma.$transaction` with an interactive
 * callback — a real BEGIN/COMMIT/ROLLBACK, not `$transaction([...])`'s
 * batch form, since the second write's WHERE clause depends on knowing the
 * first one actually matched). If either conditional update affects zero
 * rows, this throws to trigger a rollback and returns null, so nothing
 * partial is ever committed.
 *
 * Both writes reuse the same atomic-conditional-update idiom as
 * cancelIfPending/declineIfPending/taskRepository.updateIfNotPending: each
 * is a single `updateMany` guarded by a WHERE clause tied to the exact
 * state being transitioned FROM, not a read-then-write. That guard on the
 * TaskAssignment row is also what resolves concurrency against a
 * concurrent cancel/decline/second-accept — see the M9 report's
 * concurrency section for the full row-locking argument: because cancel,
 * decline, and this all gate their first write on the identical
 * `WHERE id = ? AND status = 'PENDING'` condition against the identical
 * row, Postgres's ordinary row-level locking makes them mutually exclusive
 * automatically, with no additional application-level locking needed.
 *
 * The second write's `assigneeId: fromUserId` clause is defense in depth,
 * not the primary guard: structurally, assigneeId can only equal
 * fromUserId while this assignment is PENDING (the partial unique index
 * guarantees no sibling PENDING row could have already raced it to
 * ACCEPTED), but the transfer is still conditioned on it explicitly rather
 * than assumed, so a future bug elsewhere can't silently move
 * responsibility to the wrong user.
 */
export async function acceptPendingAssignment(params: {
  id: string;
  taskId: string;
  fromUserId: string;
  toUserId: string;
  scheduledAt: Date | null;
}): Promise<TaskAssignmentWithUsers | null> {
  const { id, taskId, fromUserId, toUserId, scheduledAt } = params;
  try {
    return await prisma.$transaction(async (tx) => {
      const assignmentUpdate = await tx.taskAssignment.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      });
      if (assignmentUpdate.count === 0) {
        throw new AssignmentNotPendingError();
      }

      const taskUpdate = await tx.task.updateMany({
        where: { id: taskId, assigneeId: fromUserId },
        data: { assigneeId: toUserId, scheduledAt },
      });
      if (taskUpdate.count === 0) {
        throw new AssignmentNotPendingError();
      }

      return tx.taskAssignment.findUniqueOrThrow({ where: { id }, include });
    });
  } catch (error) {
    if (error instanceof AssignmentNotPendingError) {
      return null;
    }
    throw error;
  }
}

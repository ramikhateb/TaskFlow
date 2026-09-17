import { Prisma } from "@prisma/client";
import type { TaskAssignment, User } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type TaskAssignmentWithUsers = TaskAssignment & { fromUser: User; toUser: User };

/** Thrown when the DB-level partial unique index rejects a second PENDING row for a task — see schema.prisma. */
export class DuplicatePendingAssignmentError extends Error {}

const include = { fromUser: true, toUser: true } as const;

export function findById(id: string): Promise<TaskAssignmentWithUsers | null> {
  return prisma.taskAssignment.findUnique({ where: { id }, include });
}

export function findPendingByTaskId(taskId: string): Promise<TaskAssignmentWithUsers | null> {
  return prisma.taskAssignment.findFirst({ where: { taskId, status: "PENDING" }, include });
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
 * racing a future M9 accept/decline) can't both succeed, and there's no
 * window where a non-PENDING row could be overwritten. Returns null if the
 * row wasn't PENDING (already resolved) rather than throwing, so the
 * service can map that to the appropriate domain error.
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

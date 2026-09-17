import type { User } from "@prisma/client";
import type {
  InboxAssignmentResponse,
  InboxTaskSummary,
  PublicUser,
  SentAssignmentResponse,
  TaskAssignmentResponse,
} from "@taskflow/shared";
import type { TaskAssignmentWithUsers } from "../repositories/taskAssignmentRepository";

// Pure mapping, no dependencies beyond Prisma/shared types — deliberately
// not a service method. taskService and assignmentService both need to turn
// a raw TaskAssignment (+ its two users) into the public API shape, and
// having each depend on this shared, dependency-free module (rather than
// one service importing the other) keeps them decoupled: neither service
// knows the other exists, only the same underlying repository shape. See
// the M8 follow-up report for the full "keep controllers thin" rationale.

// Plain `User` (not scoped to TaskAssignmentWithUsers's embedded shape) —
// M10's taskService also calls this directly for a task's assignee/creator,
// not just assignmentService for fromUser/toUser.
export function toPublicUser(user: User): PublicUser {
  return { id: user.id, name: user.name, username: user.username };
}

// Shared by Inbox (M9) and Sent (M10): both need the task as seen from
// *inside an assignment*, never the assignee's personal scheduledAt — see
// packages/shared/src/schemas/assignment.ts's inboxTaskSummarySchema
// comment for why. One mapping, so that rule can't drift between the two.
function toTaskSummary(task: TaskAssignmentWithUsers["task"]): InboxTaskSummary {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    category: task.category,
    deadline: task.deadline?.toISOString() ?? null,
    status: task.status,
  };
}

export function toAssignmentResponse(assignment: TaskAssignmentWithUsers): TaskAssignmentResponse {
  return {
    id: assignment.id,
    taskId: assignment.taskId,
    status: assignment.status,
    message: assignment.message,
    fromUser: toPublicUser(assignment.fromUser),
    toUser: toPublicUser(assignment.toUser),
    respondedAt: assignment.respondedAt?.toISOString() ?? null,
    createdAt: assignment.createdAt.toISOString(),
  };
}

// M9 Inbox — deliberately narrower than toAssignmentResponse's `task`-free
// shape extended with full task data: no `toUser` (always the caller, so
// redundant) and, critically, no `task.scheduledAt` — see
// packages/shared/src/schemas/assignment.ts's inboxTaskSummarySchema
// comment for why sender scheduledAt must never reach this response.
export function toInboxAssignmentResponse(
  assignment: TaskAssignmentWithUsers,
): InboxAssignmentResponse {
  return {
    id: assignment.id,
    status: assignment.status,
    message: assignment.message,
    createdAt: assignment.createdAt.toISOString(),
    fromUser: toPublicUser(assignment.fromUser),
    task: toTaskSummary(assignment.task),
  };
}

// M10 Sent — the mirror image of Inbox: no `fromUser` (always the caller),
// but includes `respondedAt` (Inbox omits it since everything there is
// still PENDING). Same `toTaskSummary` — no recipient scheduledAt here
// either, for the same reason as Inbox (see the M10 report).
export function toSentAssignmentResponse(
  assignment: TaskAssignmentWithUsers,
): SentAssignmentResponse {
  return {
    id: assignment.id,
    status: assignment.status,
    message: assignment.message,
    createdAt: assignment.createdAt.toISOString(),
    respondedAt: assignment.respondedAt?.toISOString() ?? null,
    toUser: toPublicUser(assignment.toUser),
    task: toTaskSummary(assignment.task),
  };
}

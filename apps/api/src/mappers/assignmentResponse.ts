import type { InboxAssignmentResponse, PublicUser, TaskAssignmentResponse } from "@taskflow/shared";
import type { TaskAssignmentWithUsers } from "../repositories/taskAssignmentRepository";

// Pure mapping, no dependencies beyond Prisma/shared types — deliberately
// not a service method. taskService and assignmentService both need to turn
// a raw TaskAssignment (+ its two users) into the public API shape, and
// having each depend on this shared, dependency-free module (rather than
// one service importing the other) keeps them decoupled: neither service
// knows the other exists, only the same underlying repository shape. See
// the M8 follow-up report for the full "keep controllers thin" rationale.

export function toPublicUser(user: TaskAssignmentWithUsers["fromUser"]): PublicUser {
  return { id: user.id, name: user.name, username: user.username };
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
    task: {
      id: assignment.task.id,
      title: assignment.task.title,
      description: assignment.task.description,
      priority: assignment.task.priority,
      category: assignment.task.category,
      deadline: assignment.task.deadline?.toISOString() ?? null,
      status: assignment.task.status,
    },
  };
}

import type { PublicUser, TaskAssignmentResponse } from "@taskflow/shared";
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

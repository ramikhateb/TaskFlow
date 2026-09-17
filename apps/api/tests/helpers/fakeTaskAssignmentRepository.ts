import { randomUUID } from "node:crypto";
import type { TaskAssignment, User } from "@prisma/client";
import { DuplicatePendingAssignmentError } from "../../src/repositories/taskAssignmentRepository";
import type { TaskAssignmentRepository } from "../../src/services/assignmentService";

type TaskAssignmentWithUsers = TaskAssignment & { fromUser: User; toUser: User };

/**
 * In-memory stand-in for the Prisma-backed assignment repository, matching
 * assignmentService's narrow interface exactly, so it can be unit tested
 * with no database. `create` enforces the same "one PENDING per task"
 * invariant the real partial unique index enforces, throwing the same
 * `DuplicatePendingAssignmentError` — so a unit test can simulate the
 * concurrent-request race (two `create` calls for the same task, no
 * `findPendingByTaskId` check in between) without a real database.
 */
export function createFakeTaskAssignmentRepository(users: Map<string, User>) {
  const assignments: TaskAssignmentWithUsers[] = [];

  function withUsers(assignment: TaskAssignment): TaskAssignmentWithUsers {
    const fromUser = users.get(assignment.fromUserId);
    const toUser = users.get(assignment.toUserId);
    if (!fromUser || !toUser) throw new Error("test setup error: unknown user id");
    return { ...assignment, fromUser, toUser };
  }

  const assignmentRepository: TaskAssignmentRepository = {
    async findById(id) {
      return assignments.find((a) => a.id === id) ?? null;
    },
    async findPendingByTaskId(taskId) {
      return assignments.find((a) => a.taskId === taskId && a.status === "PENDING") ?? null;
    },
    async create(data) {
      const alreadyPending = assignments.some(
        (a) => a.taskId === data.taskId && a.status === "PENDING",
      );
      if (alreadyPending) {
        throw new DuplicatePendingAssignmentError();
      }
      const assignment: TaskAssignment = {
        id: randomUUID(),
        status: "PENDING",
        message: data.message,
        taskId: data.taskId,
        fromUserId: data.fromUserId,
        toUserId: data.toUserId,
        createdAt: new Date(),
        respondedAt: null,
      };
      const withUsersRow = withUsers(assignment);
      assignments.push(withUsersRow);
      return withUsersRow;
    },
    async cancelIfPending(id) {
      const assignment = assignments.find((a) => a.id === id);
      if (!assignment || assignment.status !== "PENDING") {
        return null;
      }
      assignment.status = "CANCELLED";
      assignment.respondedAt = new Date();
      return assignment;
    },
  };

  return { assignments, assignmentRepository };
}

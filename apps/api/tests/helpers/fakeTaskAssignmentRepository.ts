import { randomUUID } from "node:crypto";
import type { Task, TaskAssignment, User } from "@prisma/client";
import { DuplicatePendingAssignmentError } from "../../src/repositories/taskAssignmentRepository";
import type { TaskAssignmentRepository } from "../../src/services/assignmentService";

type TaskAssignmentWithUsers = TaskAssignment & { fromUser: User; toUser: User; task: Task };

/**
 * In-memory stand-in for the Prisma-backed assignment repository, matching
 * assignmentService's narrow interface exactly, so it can be unit tested
 * with no database. `create` enforces the same "one PENDING per task"
 * invariant the real partial unique index enforces, throwing the same
 * `DuplicatePendingAssignmentError` — so a unit test can simulate the
 * concurrent-request race (two `create` calls for the same task, no
 * `findPendingByTaskId` check in between) without a real database.
 *
 * Takes the SAME `tasks` array `createFakeTaskRepository()` returns (not a
 * separate copy), because `acceptPendingAssignment` — like the real Prisma
 * transaction it stands in for — writes to both the assignment row and its
 * task's assigneeId/scheduledAt together. Without sharing the array, this
 * fake couldn't reproduce that half of the M9 accept contract at all.
 */
export function createFakeTaskAssignmentRepository(users: Map<string, User>, tasks: Task[]) {
  const assignments: TaskAssignmentWithUsers[] = [];

  function withRelations(assignment: TaskAssignment): TaskAssignmentWithUsers {
    const fromUser = users.get(assignment.fromUserId);
    const toUser = users.get(assignment.toUserId);
    const task = tasks.find((t) => t.id === assignment.taskId);
    if (!fromUser || !toUser || !task) throw new Error("test setup error: unknown user/task id");
    return { ...assignment, fromUser, toUser, task };
  }

  const assignmentRepository: TaskAssignmentRepository = {
    async findById(id) {
      const assignment = assignments.find((a) => a.id === id);
      return assignment ? withRelations(assignment) : null;
    },
    async findPendingByTaskId(taskId) {
      const assignment = assignments.find((a) => a.taskId === taskId && a.status === "PENDING");
      return assignment ? withRelations(assignment) : null;
    },
    async findInboxForRecipient(toUserId) {
      return assignments
        .filter((a) => a.toUserId === toUserId && a.status === "PENDING")
        .map(withRelations)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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
      const withRelationsRow = withRelations(assignment);
      assignments.push(withRelationsRow);
      return withRelationsRow;
    },
    async cancelIfPending(id) {
      const assignment = assignments.find((a) => a.id === id);
      if (!assignment || assignment.status !== "PENDING") {
        return null;
      }
      assignment.status = "CANCELLED";
      assignment.respondedAt = new Date();
      return withRelations(assignment);
    },
    async declineIfPending(id) {
      const assignment = assignments.find((a) => a.id === id);
      if (!assignment || assignment.status !== "PENDING") {
        return null;
      }
      assignment.status = "DECLINED";
      assignment.respondedAt = new Date();
      return withRelations(assignment);
    },
    async acceptPendingAssignment({ id, taskId, fromUserId, toUserId, scheduledAt }) {
      const assignment = assignments.find((a) => a.id === id);
      if (!assignment || assignment.status !== "PENDING") {
        return null;
      }
      const task = tasks.find((t) => t.id === taskId);
      if (!task || task.assigneeId !== fromUserId) {
        return null;
      }
      // Both writes together, synchronously — the same all-or-nothing
      // effect as the real Prisma `$transaction`, just without needing an
      // actual database to demonstrate it.
      assignment.status = "ACCEPTED";
      assignment.respondedAt = new Date();
      task.assigneeId = toUserId;
      task.scheduledAt = scheduledAt;
      task.updatedAt = new Date();
      return withRelations(assignment);
    },
  };

  return { assignments, assignmentRepository };
}

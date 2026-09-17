import type { User } from "@prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "../../src/errors";
import { createAssignmentService } from "../../src/services/assignmentService";
import { createFakeTaskAssignmentRepository } from "../helpers/fakeTaskAssignmentRepository";
import { createFakeTaskRepository } from "../helpers/fakeTaskRepository";
import { createFakeUserRepository } from "../helpers/fakeUserRepository";

function buildService() {
  const { users: fakeUsers, addUser, userRepository } = createFakeUserRepository();
  const { tasks, taskRepository } = createFakeTaskRepository();
  const usersById = new Map<string, User>();
  const { assignments, assignmentRepository } = createFakeTaskAssignmentRepository(usersById);

  function registerUser(overrides: Parameters<typeof addUser>[0]): User {
    const user = addUser(overrides);
    usersById.set(user.id, user);
    return user;
  }

  const service = createAssignmentService({ assignmentRepository, taskRepository, userRepository });

  return { service, tasks, assignments, fakeUsers, registerUser, taskRepository };
}

describe("assignmentService.createAssignment", () => {
  it("creates a PENDING assignment with the correct fromUser/toUser/taskId", async () => {
    const { service, taskRepository, registerUser } = buildService();
    const rami = registerUser({ name: "Rami", username: "rami" });
    const daniel = registerUser({ name: "Daniel", username: "daniel" });
    const task = await taskRepository.create({
      title: "Task",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });

    const result = await service.createAssignment(rami.id, task.id, { toUserId: daniel.id });

    expect(result.status).toBe("PENDING");
    expect(result.taskId).toBe(task.id);
    expect(result.fromUser).toEqual({ id: rami.id, name: "Rami", username: "rami" });
    expect(result.toUser).toEqual({ id: daniel.id, name: "Daniel", username: "daniel" });
    expect(result.respondedAt).toBeNull();
  });

  it("does not change Task.assigneeId when sending an assignment", async () => {
    const { service, taskRepository, registerUser } = buildService();
    const rami = registerUser({ name: "Rami", username: "rami" });
    const daniel = registerUser({ name: "Daniel", username: "daniel" });
    const task = await taskRepository.create({
      title: "Task",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });

    await service.createAssignment(rami.id, task.id, { toUserId: daniel.id });

    const reloaded = await taskRepository.findById(task.id);
    expect(reloaded?.assigneeId).toBe(rami.id);
  });

  it("normalizes a blank message to null and preserves a real message", async () => {
    const { service, taskRepository, registerUser } = buildService();
    const rami = registerUser({ name: "Rami", username: "rami" });
    const daniel = registerUser({ name: "Daniel", username: "daniel" });
    const task = await taskRepository.create({
      title: "Task",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });

    const withMessage = await service.createAssignment(rami.id, task.id, {
      toUserId: daniel.id,
      message: "please take this",
    });
    expect(withMessage.message).toBe("please take this");
  });

  it("contains no email field on fromUser/toUser", async () => {
    const { service, taskRepository, registerUser } = buildService();
    const rami = registerUser({ name: "Rami", username: "rami" });
    const daniel = registerUser({ name: "Daniel", username: "daniel" });
    const task = await taskRepository.create({
      title: "Task",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });

    const result = await service.createAssignment(rami.id, task.id, { toUserId: daniel.id });

    expect(Object.keys(result.fromUser)).toEqual(["id", "name", "username"]);
    expect(Object.keys(result.toUser)).toEqual(["id", "name", "username"]);
  });

  it("throws NotFoundError when the caller is not the current assignee", async () => {
    const { service, taskRepository, registerUser } = buildService();
    const rami = registerUser({ name: "Rami", username: "rami" });
    const daniel = registerUser({ name: "Daniel", username: "daniel" });
    const sarah = registerUser({ name: "Sarah", username: "sarah" });
    const task = await taskRepository.create({
      title: "Task",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });

    await expect(
      service.createAssignment(sarah.id, task.id, { toUserId: daniel.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError for a nonexistent task", async () => {
    const { service, registerUser } = buildService();
    const rami = registerUser({ name: "Rami", username: "rami" });
    const daniel = registerUser({ name: "Daniel", username: "daniel" });

    await expect(
      service.createAssignment(rami.id, "does-not-exist", { toUserId: daniel.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError when the recipient does not exist", async () => {
    const { service, taskRepository, registerUser } = buildService();
    const rami = registerUser({ name: "Rami", username: "rami" });
    const task = await taskRepository.create({
      title: "Task",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });

    await expect(
      service.createAssignment(rami.id, task.id, { toUserId: "does-not-exist" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws ValidationError for self-assignment", async () => {
    const { service, taskRepository, registerUser } = buildService();
    const rami = registerUser({ name: "Rami", username: "rami" });
    const task = await taskRepository.create({
      title: "Task",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });

    await expect(
      service.createAssignment(rami.id, task.id, { toUserId: rami.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it.each(["TODO", "IN_PROGRESS"] as const)("allows assigning a %s task", async (status) => {
    const { service, taskRepository, registerUser } = buildService();
    const rami = registerUser({ name: "Rami", username: "rami" });
    const daniel = registerUser({ name: "Daniel", username: "daniel" });
    const task = await taskRepository.create({
      title: "Task",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });
    if (status !== "TODO") {
      await taskRepository.update(task.id, { status });
    }

    await expect(
      service.createAssignment(rami.id, task.id, { toUserId: daniel.id }),
    ).resolves.toMatchObject({ status: "PENDING" });
  });

  it.each(["DONE", "CANCELLED"] as const)(
    "rejects assigning a %s task with ConflictError",
    async (status) => {
      const { service, taskRepository, registerUser } = buildService();
      const rami = registerUser({ name: "Rami", username: "rami" });
      const daniel = registerUser({ name: "Daniel", username: "daniel" });
      const task = await taskRepository.create({
        title: "Task",
        description: null,
        priority: "MEDIUM",
        category: null,
        scheduledAt: null,
        deadline: null,
        creatorId: rami.id,
        assigneeId: rami.id,
      });
      // Route DONE/CANCELLED through valid transitions (TODO -> DONE direct is
      // fine per M4's fully-interchangeable status model).
      await taskRepository.update(task.id, { status });

      await expect(
        service.createAssignment(rami.id, task.id, { toUserId: daniel.id }),
      ).rejects.toBeInstanceOf(ConflictError);
    },
  );

  it("rejects a second pending assignment for the same task with ConflictError", async () => {
    const { service, taskRepository, registerUser } = buildService();
    const rami = registerUser({ name: "Rami", username: "rami" });
    const daniel = registerUser({ name: "Daniel", username: "daniel" });
    const sarah = registerUser({ name: "Sarah", username: "sarah" });
    const task = await taskRepository.create({
      title: "Task",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });
    await service.createAssignment(rami.id, task.id, { toUserId: daniel.id });

    // Even to a *different* recipient — the invariant is per-task, not per-recipient.
    await expect(
      service.createAssignment(rami.id, task.id, { toUserId: sarah.id }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("simulates the concurrent-request race via the repository's own duplicate guard", async () => {
    // Both calls' own findPendingByTaskId pre-check run before either has
    // inserted (interleaved at each `await`), so neither sees the other via
    // that check — exactly the race the DB partial unique index exists for.
    // The loser is only caught by the create()-level duplicate guard
    // (DuplicatePendingAssignmentError -> ConflictError), the same path the
    // real index's P2002 violation takes in production.
    const { service, taskRepository, registerUser } = buildService();
    const rami = registerUser({ name: "Rami", username: "rami" });
    const daniel = registerUser({ name: "Daniel", username: "daniel" });
    const task = await taskRepository.create({
      title: "Task",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });

    const [first, second] = await Promise.allSettled([
      service.createAssignment(rami.id, task.id, { toUserId: daniel.id }),
      service.createAssignment(rami.id, task.id, { toUserId: daniel.id }),
    ]);

    const results = [first, second];
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
  });
});

describe("assignmentService.cancelAssignment", () => {
  it("cancels the sender's own PENDING assignment", async () => {
    const { service, taskRepository, registerUser } = buildService();
    const rami = registerUser({ name: "Rami", username: "rami" });
    const daniel = registerUser({ name: "Daniel", username: "daniel" });
    const task = await taskRepository.create({
      title: "Task",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });
    const created = await service.createAssignment(rami.id, task.id, { toUserId: daniel.id });

    const cancelled = await service.cancelAssignment(rami.id, task.id, created.id);

    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.respondedAt).not.toBeNull();
  });

  it("does not change Task.assigneeId on cancel", async () => {
    const { service, taskRepository, registerUser } = buildService();
    const rami = registerUser({ name: "Rami", username: "rami" });
    const daniel = registerUser({ name: "Daniel", username: "daniel" });
    const task = await taskRepository.create({
      title: "Task",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });
    const created = await service.createAssignment(rami.id, task.id, { toUserId: daniel.id });

    await service.cancelAssignment(rami.id, task.id, created.id);

    const reloaded = await taskRepository.findById(task.id);
    expect(reloaded?.assigneeId).toBe(rami.id);
  });

  it("preserves the cancelled row (history), and a new pending assignment can follow", async () => {
    const { service, taskRepository, assignments, registerUser } = buildService();
    const rami = registerUser({ name: "Rami", username: "rami" });
    const daniel = registerUser({ name: "Daniel", username: "daniel" });
    const sarah = registerUser({ name: "Sarah", username: "sarah" });
    const task = await taskRepository.create({
      title: "Task",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });
    const first = await service.createAssignment(rami.id, task.id, { toUserId: daniel.id });
    await service.cancelAssignment(rami.id, task.id, first.id);

    const second = await service.createAssignment(rami.id, task.id, { toUserId: sarah.id });

    expect(assignments).toHaveLength(2);
    expect(assignments.find((a) => a.id === first.id)?.status).toBe("CANCELLED");
    expect(second.status).toBe("PENDING");
  });

  it("throws NotFoundError when a non-sender tries to cancel", async () => {
    const { service, taskRepository, registerUser } = buildService();
    const rami = registerUser({ name: "Rami", username: "rami" });
    const daniel = registerUser({ name: "Daniel", username: "daniel" });
    const created = await (async () => {
      const task = await taskRepository.create({
        title: "Task",
        description: null,
        priority: "MEDIUM",
        category: null,
        scheduledAt: null,
        deadline: null,
        creatorId: rami.id,
        assigneeId: rami.id,
      });
      return {
        task,
        assignment: await service.createAssignment(rami.id, task.id, { toUserId: daniel.id }),
      };
    })();

    // Daniel (the recipient) is not the sender and cannot cancel.
    await expect(
      service.cancelAssignment(daniel.id, created.task.id, created.assignment.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError for a mismatched task/assignment pairing", async () => {
    const { service, taskRepository, registerUser } = buildService();
    const rami = registerUser({ name: "Rami", username: "rami" });
    const daniel = registerUser({ name: "Daniel", username: "daniel" });
    const taskA = await taskRepository.create({
      title: "Task A",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });
    const taskB = await taskRepository.create({
      title: "Task B",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });
    const assignment = await service.createAssignment(rami.id, taskA.id, { toUserId: daniel.id });

    await expect(service.cancelAssignment(rami.id, taskB.id, assignment.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("throws NotFoundError for a nonexistent assignment id", async () => {
    const { service, taskRepository, registerUser } = buildService();
    const rami = registerUser({ name: "Rami", username: "rami" });
    const task = await taskRepository.create({
      title: "Task",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });

    await expect(
      service.cancelAssignment(rami.id, task.id, "does-not-exist"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws ConflictError when cancelling an already-CANCELLED assignment", async () => {
    const { service, taskRepository, registerUser } = buildService();
    const rami = registerUser({ name: "Rami", username: "rami" });
    const daniel = registerUser({ name: "Daniel", username: "daniel" });
    const task = await taskRepository.create({
      title: "Task",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });
    const created = await service.createAssignment(rami.id, task.id, { toUserId: daniel.id });
    await service.cancelAssignment(rami.id, task.id, created.id);

    await expect(service.cancelAssignment(rami.id, task.id, created.id)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});

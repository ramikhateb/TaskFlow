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
  const { assignments, assignmentRepository } = createFakeTaskAssignmentRepository(
    usersById,
    tasks,
  );

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

/** Shared setup for the M9 decline/accept suites below: a fresh task and a PENDING assignment on it. */
async function setupPendingAssignment(deadline: Date | null = null) {
  const built = buildService();
  const { service, taskRepository, registerUser } = built;
  const rami = registerUser({ name: "Rami", username: "rami" });
  const daniel = registerUser({ name: "Daniel", username: "daniel" });
  const task = await taskRepository.create({
    title: "Task",
    description: null,
    priority: "MEDIUM",
    category: null,
    scheduledAt: new Date("2026-09-25T10:00:00.000Z"),
    deadline,
    creatorId: rami.id,
    assigneeId: rami.id,
  });
  const assignment = await service.createAssignment(rami.id, task.id, { toUserId: daniel.id });
  return { ...built, rami, daniel, task, assignment };
}

describe("assignmentService.declineAssignment (M9, FR-26/FR-27)", () => {
  it("lets the recipient decline a PENDING assignment", async () => {
    const { service, daniel, assignment } = await setupPendingAssignment();

    const declined = await service.declineAssignment(daniel.id, assignment.id);

    expect(declined.status).toBe("DECLINED");
    expect(declined.respondedAt).not.toBeNull();
  });

  it("leaves Task.assigneeId and creatorId unchanged on decline", async () => {
    const { service, taskRepository, rami, daniel, task, assignment } =
      await setupPendingAssignment();

    await service.declineAssignment(daniel.id, assignment.id);

    // The recipient never becomes assigneeId on decline.
    const reloaded = await taskRepository.findById(task.id);
    expect(reloaded?.assigneeId).toBe(rami.id);
    expect(reloaded?.creatorId).toBe(rami.id);
  });

  it("rejects decline from the sender (not the recipient) with NotFoundError", async () => {
    const { service, rami, assignment } = await setupPendingAssignment();

    await expect(service.declineAssignment(rami.id, assignment.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("rejects decline from an unrelated third user with NotFoundError", async () => {
    const { service, registerUser, assignment } = await setupPendingAssignment();
    const carol = registerUser({ name: "Carol", username: "carol" });

    await expect(service.declineAssignment(carol.id, assignment.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("rejects declining a nonexistent assignment with NotFoundError", async () => {
    const { service, daniel } = await setupPendingAssignment();

    await expect(service.declineAssignment(daniel.id, "does-not-exist")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("rejects declining an already-CANCELLED assignment with ConflictError", async () => {
    const { service, rami, daniel, task, assignment } = await setupPendingAssignment();
    await service.cancelAssignment(rami.id, task.id, assignment.id);

    await expect(service.declineAssignment(daniel.id, assignment.id)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("rejects declining an already-ACCEPTED assignment with ConflictError", async () => {
    const { service, daniel, assignment } = await setupPendingAssignment();
    await service.acceptAssignment(daniel.id, assignment.id, { scheduledAt: null });

    await expect(service.declineAssignment(daniel.id, assignment.id)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("rejects declining an already-DECLINED assignment with ConflictError", async () => {
    const { service, daniel, assignment } = await setupPendingAssignment();
    await service.declineAssignment(daniel.id, assignment.id);

    await expect(service.declineAssignment(daniel.id, assignment.id)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("after decline, the sender's task is no longer frozen (no PENDING assignment remains)", async () => {
    const { taskRepository, service, daniel, task, assignment } = await setupPendingAssignment();
    await service.declineAssignment(daniel.id, assignment.id);

    await expect(taskRepository.findById(task.id)).resolves.not.toBeNull();
    // taskService's own freeze check (a separate unit suite) reads exactly
    // this repository method; declineIfPending having actually flipped the
    // row to DECLINED is what makes that check pass again.
  });
});

describe("assignmentService.acceptAssignment (M9, FR-25/FR-30)", () => {
  it("lets the recipient accept a PENDING assignment", async () => {
    const { service, daniel, assignment } = await setupPendingAssignment();

    const accepted = await service.acceptAssignment(daniel.id, assignment.id, {
      scheduledAt: null,
    });

    expect(accepted.status).toBe("ACCEPTED");
    expect(accepted.respondedAt).not.toBeNull();
  });

  it("transfers Task.assigneeId to the recipient, leaving creatorId unchanged", async () => {
    const { service, taskRepository, rami, daniel, task, assignment } =
      await setupPendingAssignment();

    await service.acceptAssignment(daniel.id, assignment.id, { scheduledAt: null });

    const reloaded = await taskRepository.findById(task.id);
    expect(reloaded?.assigneeId).toBe(daniel.id);
    expect(reloaded?.creatorId).toBe(rami.id);
  });

  it("rejects accept from the sender (not the recipient) with NotFoundError", async () => {
    const { service, rami, assignment } = await setupPendingAssignment();

    await expect(
      service.acceptAssignment(rami.id, assignment.id, { scheduledAt: null }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects accept from an unrelated third user with NotFoundError", async () => {
    const { service, registerUser, assignment } = await setupPendingAssignment();
    const carol = registerUser({ name: "Carol", username: "carol" });

    await expect(
      service.acceptAssignment(carol.id, assignment.id, { scheduledAt: null }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects accepting a nonexistent assignment with NotFoundError", async () => {
    const { service, daniel } = await setupPendingAssignment();

    await expect(
      service.acceptAssignment(daniel.id, "does-not-exist", { scheduledAt: null }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each(["cancel", "decline"] as const)(
    "rejects accepting an already-resolved (%s) assignment with ConflictError",
    async (how) => {
      const { service, rami, daniel, task, assignment } = await setupPendingAssignment();
      if (how === "cancel") {
        await service.cancelAssignment(rami.id, task.id, assignment.id);
      } else {
        await service.declineAssignment(daniel.id, assignment.id);
      }

      await expect(
        service.acceptAssignment(daniel.id, assignment.id, { scheduledAt: null }),
      ).rejects.toBeInstanceOf(ConflictError);
    },
  );

  it("rejects accepting an already-ACCEPTED assignment with ConflictError", async () => {
    const { service, daniel, assignment } = await setupPendingAssignment();
    await service.acceptAssignment(daniel.id, assignment.id, { scheduledAt: null });

    await expect(
      service.acceptAssignment(daniel.id, assignment.id, { scheduledAt: null }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  describe("scheduling (FR-30/EC-13)", () => {
    it("stores the recipient-selected scheduledAt, replacing the sender's previous one", async () => {
      const { service, taskRepository, daniel, task, assignment } = await setupPendingAssignment();
      // Sanity: the sender's original scheduledAt (set in setupPendingAssignment).
      const before = await taskRepository.findById(task.id);
      expect(before?.scheduledAt?.toISOString()).toBe("2026-09-25T10:00:00.000Z");

      await service.acceptAssignment(daniel.id, assignment.id, {
        scheduledAt: "2026-09-26T14:00:00.000Z",
      });

      const after = await taskRepository.findById(task.id);
      expect(after?.scheduledAt?.toISOString()).toBe("2026-09-26T14:00:00.000Z");
    });

    it('"Schedule later" (scheduledAt: null) clears the sender\'s previous scheduledAt', async () => {
      const { service, taskRepository, daniel, task, assignment } = await setupPendingAssignment();

      await service.acceptAssignment(daniel.id, assignment.id, { scheduledAt: null });

      const after = await taskRepository.findById(task.id);
      expect(after?.scheduledAt).toBeNull();
    });

    it("accepts a scheduledAt before the deadline", async () => {
      const { service, taskRepository, daniel, task, assignment } = await setupPendingAssignment(
        new Date("2026-09-27T17:00:00.000Z"),
      );

      const accepted = await service.acceptAssignment(daniel.id, assignment.id, {
        scheduledAt: "2026-09-26T14:00:00.000Z",
      });

      expect(accepted.status).toBe("ACCEPTED");
      const after = await taskRepository.findById(task.id);
      expect(after?.scheduledAt?.toISOString()).toBe("2026-09-26T14:00:00.000Z");
      expect(after?.deadline?.toISOString()).toBe("2026-09-27T17:00:00.000Z");
    });

    it("rejects a scheduledAt after the deadline with ConflictError, leaving the task untouched", async () => {
      const { service, taskRepository, task, daniel, assignment } = await setupPendingAssignment(
        new Date("2026-09-27T17:00:00.000Z"),
      );

      await expect(
        service.acceptAssignment(daniel.id, assignment.id, {
          scheduledAt: "2026-09-28T09:00:00.000Z",
        }),
      ).rejects.toBeInstanceOf(ConflictError);

      const after = await taskRepository.findById(task.id);
      expect(after?.assigneeId).not.toBe(daniel.id);
      expect(after?.scheduledAt?.toISOString()).toBe("2026-09-25T10:00:00.000Z"); // unchanged
    });

    it('"Schedule later" is valid even when a deadline exists', async () => {
      const { service, daniel, assignment } = await setupPendingAssignment(
        new Date("2026-09-27T17:00:00.000Z"),
      );

      await expect(
        service.acceptAssignment(daniel.id, assignment.id, { scheduledAt: null }),
      ).resolves.toMatchObject({ status: "ACCEPTED" });
    });

    it("deadline itself is unchanged by acceptance", async () => {
      const { service, taskRepository, daniel, task, assignment } = await setupPendingAssignment(
        new Date("2026-09-27T17:00:00.000Z"),
      );

      await service.acceptAssignment(daniel.id, assignment.id, {
        scheduledAt: "2026-09-26T14:00:00.000Z",
      });

      const after = await taskRepository.findById(task.id);
      expect(after?.deadline?.toISOString()).toBe("2026-09-27T17:00:00.000Z");
    });
  });

  describe("concurrency", () => {
    it("double accept: exactly one of two concurrent accept calls succeeds", async () => {
      // Same interleaving argument as the create-assignment race above: both
      // calls' own pre-check (findById + status check) run against a
      // snapshot taken before either has committed, so neither sees the
      // other there. The loser is only caught when acceptPendingAssignment
      // re-reads live state at the moment of its own conditional write —
      // the repository-level guarantee the M9 report describes as "one
      // coherent state machine" with cancel/decline.
      const { service, taskRepository, daniel, task, assignment } = await setupPendingAssignment();

      const [first, second] = await Promise.allSettled([
        service.acceptAssignment(daniel.id, assignment.id, { scheduledAt: null }),
        service.acceptAssignment(daniel.id, assignment.id, { scheduledAt: null }),
      ]);

      const results = [first, second];
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.filter((r) => r.status === "rejected");
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);

      const reloaded = await taskRepository.findById(task.id);
      expect(reloaded?.assigneeId).toBe(daniel.id);
    });
  });
});

describe("assignmentService.getInbox (M9, FR-28)", () => {
  it("returns an empty list when there are no pending requests", async () => {
    const { service, registerUser } = buildService();
    const soloUser = registerUser({ name: "Solo", username: "solo" });

    await expect(service.getInbox(soloUser.id)).resolves.toEqual({ data: [] });
  });

  it("returns the recipient's PENDING assignments, newest first", async () => {
    const { service, taskRepository, registerUser } = buildService();
    const daniel = registerUser({ name: "Daniel", username: "daniel" });
    const rami = registerUser({ name: "Rami", username: "rami" });
    const taskA = await taskRepository.create({
      title: "First",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });
    const taskB = await taskRepository.create({
      title: "Second",
      description: null,
      priority: "HIGH",
      category: "Work",
      scheduledAt: null,
      deadline: new Date("2026-09-27T17:00:00.000Z"),
      creatorId: rami.id,
      assigneeId: rami.id,
    });
    const first = await service.createAssignment(rami.id, taskA.id, {
      toUserId: daniel.id,
      message: "please take this",
    });
    // Force distinct createdAt ordering deterministically, since both rows
    // can otherwise land in the same millisecond in a fast in-memory test.
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await service.createAssignment(rami.id, taskB.id, { toUserId: daniel.id });

    const inbox = await service.getInbox(daniel.id);

    expect(inbox.data.map((row) => row.id)).toEqual([second.id, first.id]);
    expect(inbox.data[1]).toMatchObject({
      message: "please take this",
      fromUser: { id: rami.id, name: "Rami", username: "rami" },
      task: { id: taskA.id, title: "First", priority: "MEDIUM" },
    });
    expect(inbox.data[0]).toMatchObject({
      task: { id: taskB.id, title: "Second", priority: "HIGH", category: "Work" },
    });
  });

  it("excludes another user's incoming assignments", async () => {
    const { service, taskRepository, registerUser } = buildService();
    const daniel = registerUser({ name: "Daniel", username: "daniel" });
    const rami = registerUser({ name: "Rami", username: "rami" });
    const carol = registerUser({ name: "Carol", username: "carol" });
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

    await expect(service.getInbox(carol.id)).resolves.toEqual({ data: [] });
  });

  it("excludes CANCELLED/DECLINED/ACCEPTED assignments", async () => {
    const { service, taskRepository, registerUser } = buildService();
    const daniel = registerUser({ name: "Daniel", username: "daniel" });
    const rami = registerUser({ name: "Rami", username: "rami" });
    const cancelledTask = await taskRepository.create({
      title: "Cancelled",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });
    const declinedTask = await taskRepository.create({
      title: "Declined",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });
    const acceptedTask = await taskRepository.create({
      title: "Accepted",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: null,
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });
    const cancelled = await service.createAssignment(rami.id, cancelledTask.id, {
      toUserId: daniel.id,
    });
    await service.cancelAssignment(rami.id, cancelledTask.id, cancelled.id);
    const declined = await service.createAssignment(rami.id, declinedTask.id, {
      toUserId: daniel.id,
    });
    await service.declineAssignment(daniel.id, declined.id);
    const accepted = await service.createAssignment(rami.id, acceptedTask.id, {
      toUserId: daniel.id,
    });
    await service.acceptAssignment(daniel.id, accepted.id, { scheduledAt: null });

    await expect(service.getInbox(daniel.id)).resolves.toEqual({ data: [] });
  });

  it("never includes sender scheduledAt in the task summary", async () => {
    const { service, taskRepository, registerUser } = buildService();
    const daniel = registerUser({ name: "Daniel", username: "daniel" });
    const rami = registerUser({ name: "Rami", username: "rami" });
    const task = await taskRepository.create({
      title: "Task",
      description: null,
      priority: "MEDIUM",
      category: null,
      scheduledAt: new Date("2026-09-25T10:00:00.000Z"),
      deadline: null,
      creatorId: rami.id,
      assigneeId: rami.id,
    });
    await service.createAssignment(rami.id, task.id, { toUserId: daniel.id });

    const inbox = await service.getInbox(daniel.id);

    expect(inbox.data[0]).not.toHaveProperty("task.scheduledAt");
    expect(Object.keys(inbox.data[0]!.task)).toEqual([
      "id",
      "title",
      "description",
      "priority",
      "category",
      "deadline",
      "status",
    ]);
  });

  it("never includes sender email or other security fields", async () => {
    const { service, taskRepository, registerUser } = buildService();
    const daniel = registerUser({ name: "Daniel", username: "daniel" });
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
    await service.createAssignment(rami.id, task.id, { toUserId: daniel.id });

    const inbox = await service.getInbox(daniel.id);

    expect(inbox.data[0]!.fromUser).not.toHaveProperty("email");
    expect(Object.keys(inbox.data[0]!.fromUser)).toEqual(["id", "name", "username"]);
  });
});

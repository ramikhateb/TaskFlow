import { ConflictError, NotFoundError } from "../../src/errors";
import {
  createTaskService,
  isScheduleValid,
  isValidStatusTransition,
} from "../../src/services/taskService";
import { createFakeTaskRepository } from "../helpers/fakeTaskRepository";

const USER_A = "user-a";
const USER_B = "user-b";

function buildService() {
  const { tasks, taskRepository } = createFakeTaskRepository();
  const service = createTaskService({ taskRepository });
  return { service, tasks, taskRepository };
}

describe("isValidStatusTransition (product decision 2026-09-15)", () => {
  it.each([
    // TODO, IN_PROGRESS, DONE are fully interchangeable.
    ["TODO", "IN_PROGRESS", true],
    ["TODO", "DONE", true],
    ["IN_PROGRESS", "TODO", true],
    ["IN_PROGRESS", "DONE", true],
    ["DONE", "TODO", true],
    ["DONE", "IN_PROGRESS", true],
    // Any of them -> CANCELLED.
    ["TODO", "CANCELLED", true],
    ["IN_PROGRESS", "CANCELLED", true],
    ["DONE", "CANCELLED", true],
    // No-op.
    ["TODO", "TODO", true],
    // CANCELLED is terminal.
    ["CANCELLED", "TODO", false],
    ["CANCELLED", "IN_PROGRESS", false],
    ["CANCELLED", "DONE", false],
  ] as const)("%s -> %s is %s", (from, to, expected) => {
    expect(isValidStatusTransition(from, to)).toBe(expected);
  });
});

describe("isScheduleValid (EC-13)", () => {
  it("is valid when scheduledAt is before deadline", () => {
    expect(
      isScheduleValid(new Date("2026-03-01T00:00:00Z"), new Date("2026-03-05T00:00:00Z")),
    ).toBe(true);
  });

  it("is valid when scheduledAt equals deadline", () => {
    const date = new Date("2026-03-01T00:00:00Z");
    expect(isScheduleValid(date, new Date(date))).toBe(true);
  });

  it("is invalid when scheduledAt is after deadline", () => {
    expect(
      isScheduleValid(new Date("2026-03-05T00:00:00Z"), new Date("2026-03-01T00:00:00Z")),
    ).toBe(false);
  });

  it("is valid when only scheduledAt is set", () => {
    expect(isScheduleValid(new Date("2026-03-01T00:00:00Z"), null)).toBe(true);
  });

  it("is valid when only deadline is set", () => {
    expect(isScheduleValid(null, new Date("2026-03-01T00:00:00Z"))).toBe(true);
  });

  it("is valid when neither is set", () => {
    expect(isScheduleValid(null, null)).toBe(true);
  });
});

describe("taskService.createTask", () => {
  it("sets creatorId and assigneeId to the authenticated user, ignoring any other input", async () => {
    const { service, tasks } = buildService();

    const result = await service.createTask(USER_A, { title: "Write report" });

    expect(result.creatorId).toBe(USER_A);
    expect(result.assigneeId).toBe(USER_A);
    expect(result.status).toBe("TODO");
    expect(tasks).toHaveLength(1);
  });

  it("stores an omitted description as null", async () => {
    const { service } = buildService();
    const result = await service.createTask(USER_A, { title: "No description" });
    expect(result.description).toBeNull();
  });

  it("defaults priority to MEDIUM when omitted", async () => {
    const { service } = buildService();
    const result = await service.createTask(USER_A, { title: "Task" });
    expect(result.priority).toBe("MEDIUM");
  });

  it.each(["LOW", "MEDIUM", "HIGH"] as const)("accepts priority %s", async (priority) => {
    const { service } = buildService();
    const result = await service.createTask(USER_A, { title: "Task", priority });
    expect(result.priority).toBe(priority);
  });

  it("stores an omitted category/scheduledAt/deadline as null", async () => {
    const { service } = buildService();
    const result = await service.createTask(USER_A, { title: "Task" });
    expect(result.category).toBeNull();
    expect(result.scheduledAt).toBeNull();
    expect(result.deadline).toBeNull();
  });

  it("persists category, scheduledAt, and deadline when provided", async () => {
    const { service } = buildService();
    const result = await service.createTask(USER_A, {
      title: "Plan launch",
      category: "Work",
      scheduledAt: "2026-03-01T09:00:00.000Z",
      deadline: "2026-03-05T17:00:00.000Z",
    });

    expect(result.category).toBe("Work");
    expect(result.scheduledAt).toBe("2026-03-01T09:00:00.000Z");
    expect(result.deadline).toBe("2026-03-05T17:00:00.000Z");
  });

  it("keeps scheduledAt and deadline independent of one another", async () => {
    const { service } = buildService();
    const scheduledOnly = await service.createTask(USER_A, {
      title: "Scheduled only",
      scheduledAt: "2026-03-01T09:00:00.000Z",
    });
    const deadlineOnly = await service.createTask(USER_A, {
      title: "Deadline only",
      deadline: "2026-03-05T17:00:00.000Z",
    });

    expect(scheduledOnly.deadline).toBeNull();
    expect(deadlineOnly.scheduledAt).toBeNull();
  });

  it("accepts scheduledAt equal to deadline", async () => {
    const { service } = buildService();
    const result = await service.createTask(USER_A, {
      title: "Same instant",
      scheduledAt: "2026-03-01T09:00:00.000Z",
      deadline: "2026-03-01T09:00:00.000Z",
    });

    expect(result.scheduledAt).toBe("2026-03-01T09:00:00.000Z");
    expect(result.deadline).toBe("2026-03-01T09:00:00.000Z");
  });

  it("rejects scheduledAt after deadline with ConflictError", async () => {
    const { service } = buildService();

    await expect(
      service.createTask(USER_A, {
        title: "Backwards",
        scheduledAt: "2026-03-05T00:00:00.000Z",
        deadline: "2026-03-01T00:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("taskService.listOwnTasks", () => {
  it("returns only the caller's own tasks", async () => {
    const { service } = buildService();
    await service.createTask(USER_A, { title: "A's task" });
    await service.createTask(USER_B, { title: "B's task" });

    const result = await service.listOwnTasks(USER_A);

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("A's task");
  });

  it("returns an empty list for a user with no tasks", async () => {
    const { service } = buildService();
    await expect(service.listOwnTasks(USER_A)).resolves.toEqual([]);
  });
});

describe("taskService.getTask", () => {
  it("returns the task when the caller is the assignee", async () => {
    const { service } = buildService();
    const created = await service.createTask(USER_A, { title: "Mine" });

    const result = await service.getTask(USER_A, created.id);
    expect(result.id).toBe(created.id);
  });

  it("throws NotFoundError for another user's task (no enumeration)", async () => {
    const { service } = buildService();
    const created = await service.createTask(USER_A, { title: "A's task" });

    await expect(service.getTask(USER_B, created.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError for a nonexistent task", async () => {
    const { service } = buildService();
    await expect(service.getTask(USER_A, "does-not-exist")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("taskService.updateTask", () => {
  it("updates title and description for the owner", async () => {
    const { service } = buildService();
    const created = await service.createTask(USER_A, { title: "Old title" });

    const result = await service.updateTask(USER_A, created.id, {
      title: "New title",
      description: "New description",
    });

    expect(result.title).toBe("New title");
    expect(result.description).toBe("New description");
  });

  it("completes a fresh TODO task directly, in one step, and sets completedAt", async () => {
    const { service } = buildService();
    const created = await service.createTask(USER_A, { title: "Task" });

    const result = await service.updateTask(USER_A, created.id, { status: "DONE" });

    expect(result.status).toBe("DONE");
    expect(result.completedAt).not.toBeNull();
  });

  it("reopens a DONE task directly back to TODO, in one step, clearing completedAt", async () => {
    const { service } = buildService();
    const created = await service.createTask(USER_A, { title: "Task" });
    await service.updateTask(USER_A, created.id, { status: "DONE" });

    const result = await service.updateTask(USER_A, created.id, { status: "TODO" });

    expect(result.status).toBe("TODO");
    expect(result.completedAt).toBeNull();
  });

  it("clears completedAt when leaving DONE (uncomplete) via IN_PROGRESS", async () => {
    const { service } = buildService();
    const created = await service.createTask(USER_A, { title: "Task" });
    await service.updateTask(USER_A, created.id, { status: "DONE" });

    const result = await service.updateTask(USER_A, created.id, { status: "IN_PROGRESS" });

    expect(result.status).toBe("IN_PROGRESS");
    expect(result.completedAt).toBeNull();
  });

  it("clears completedAt when cancelling a DONE task", async () => {
    const { service } = buildService();
    const created = await service.createTask(USER_A, { title: "Task" });
    const done = await service.updateTask(USER_A, created.id, { status: "DONE" });
    expect(done.completedAt).not.toBeNull();

    const result = await service.updateTask(USER_A, created.id, { status: "CANCELLED" });

    expect(result.status).toBe("CANCELLED");
    expect(result.completedAt).toBeNull();
  });

  it("rejects an invalid status transition with ConflictError (CANCELLED is terminal)", async () => {
    const { service } = buildService();
    const created = await service.createTask(USER_A, { title: "Task" });
    await service.updateTask(USER_A, created.id, { status: "CANCELLED" });

    await expect(service.updateTask(USER_A, created.id, { status: "TODO" })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("throws NotFoundError when another user tries to update the task", async () => {
    const { service } = buildService();
    const created = await service.createTask(USER_A, { title: "A's task" });

    await expect(
      service.updateTask(USER_B, created.id, { title: "Hijacked" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updates priority", async () => {
    const { service } = buildService();
    const created = await service.createTask(USER_A, { title: "Task" });

    const result = await service.updateTask(USER_A, created.id, { priority: "HIGH" });

    expect(result.priority).toBe("HIGH");
  });

  it("updates category, scheduledAt, and deadline independently", async () => {
    const { service } = buildService();
    const created = await service.createTask(USER_A, { title: "Task" });

    const result = await service.updateTask(USER_A, created.id, {
      category: "Personal",
      scheduledAt: "2026-04-01T08:00:00.000Z",
      deadline: "2026-04-10T23:59:00.000Z",
    });

    expect(result.category).toBe("Personal");
    expect(result.scheduledAt).toBe("2026-04-01T08:00:00.000Z");
    expect(result.deadline).toBe("2026-04-10T23:59:00.000Z");
  });

  it("clears category, scheduledAt, and deadline when explicitly set to null", async () => {
    const { service } = buildService();
    const created = await service.createTask(USER_A, {
      title: "Task",
      category: "Work",
      scheduledAt: "2026-04-01T08:00:00.000Z",
      deadline: "2026-04-10T23:59:00.000Z",
    });

    const result = await service.updateTask(USER_A, created.id, {
      category: null,
      scheduledAt: null,
      deadline: null,
    });

    expect(result.category).toBeNull();
    expect(result.scheduledAt).toBeNull();
    expect(result.deadline).toBeNull();
  });

  it("leaves category/scheduledAt/deadline untouched when omitted from the update", async () => {
    const { service } = buildService();
    const created = await service.createTask(USER_A, {
      title: "Task",
      category: "Work",
      scheduledAt: "2026-04-01T08:00:00.000Z",
    });

    const result = await service.updateTask(USER_A, created.id, { title: "Renamed" });

    expect(result.title).toBe("Renamed");
    expect(result.category).toBe("Work");
    expect(result.scheduledAt).toBe("2026-04-01T08:00:00.000Z");
  });

  it("rejects a PATCH to scheduledAt that conflicts with the existing deadline (EC-13)", async () => {
    const { service } = buildService();
    const created = await service.createTask(USER_A, {
      title: "Task",
      deadline: "2026-04-01T00:00:00.000Z",
    });

    await expect(
      service.updateTask(USER_A, created.id, { scheduledAt: "2026-04-05T00:00:00.000Z" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects a PATCH to deadline that conflicts with the existing scheduledAt (EC-13)", async () => {
    const { service } = buildService();
    const created = await service.createTask(USER_A, {
      title: "Task",
      scheduledAt: "2026-04-05T00:00:00.000Z",
    });

    await expect(
      service.updateTask(USER_A, created.id, { deadline: "2026-04-01T00:00:00.000Z" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows a PATCH that keeps the resulting state valid relative to the other stored field", async () => {
    const { service } = buildService();
    const created = await service.createTask(USER_A, {
      title: "Task",
      deadline: "2026-04-10T00:00:00.000Z",
    });

    const result = await service.updateTask(USER_A, created.id, {
      scheduledAt: "2026-04-05T00:00:00.000Z",
    });

    expect(result.scheduledAt).toBe("2026-04-05T00:00:00.000Z");
    expect(result.deadline).toBe("2026-04-10T00:00:00.000Z");
  });
});

describe("taskService.deleteTask", () => {
  it("deletes the task for its owner", async () => {
    const { service, tasks } = buildService();
    const created = await service.createTask(USER_A, { title: "Task" });

    await service.deleteTask(USER_A, created.id);

    expect(tasks).toHaveLength(0);
  });

  it("throws NotFoundError when another user tries to delete the task", async () => {
    const { service, tasks } = buildService();
    const created = await service.createTask(USER_A, { title: "A's task" });

    await expect(service.deleteTask(USER_B, created.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(tasks).toHaveLength(1);
  });

  it("throws NotFoundError for a nonexistent task", async () => {
    const { service } = buildService();
    await expect(service.deleteTask(USER_A, "does-not-exist")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

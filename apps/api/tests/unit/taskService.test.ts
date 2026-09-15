import { ConflictError, NotFoundError } from "../../src/errors";
import { createTaskService, isValidStatusTransition } from "../../src/services/taskService";
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

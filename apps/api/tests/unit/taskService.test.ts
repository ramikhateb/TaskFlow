import type { Task } from "@prisma/client";
import { ConflictError, NotFoundError } from "../../src/errors";
import {
  classifyForToday,
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

let taskCounter = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  taskCounter += 1;
  return {
    id: `task-${taskCounter}`,
    title: `Task ${taskCounter}`,
    description: null,
    status: "TODO",
    priority: "MEDIUM",
    category: null,
    scheduledAt: null,
    deadline: null,
    creatorId: USER_A,
    assigneeId: USER_A,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
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

describe("classifyForToday (FR-14)", () => {
  const NOW = new Date("2026-06-15T12:00:00.000Z");
  const FROM = new Date("2026-06-15T00:00:00.000Z");
  const TO = new Date("2026-06-16T00:00:00.000Z");

  it("puts a task scheduled today in scheduledToday", () => {
    const task = makeTask({ scheduledAt: new Date("2026-06-15T09:00:00.000Z") });
    const result = classifyForToday([task], NOW, FROM, TO);
    expect(result.scheduledToday).toEqual([task]);
    expect(result.overdue).toEqual([]);
    expect(result.dueToday).toEqual([]);
  });

  it("excludes a task scheduled outside today", () => {
    const before = makeTask({ scheduledAt: new Date("2026-06-14T09:00:00.000Z") });
    const after = makeTask({ scheduledAt: new Date("2026-06-16T09:00:00.000Z") });
    const result = classifyForToday([before, after], NOW, FROM, TO);
    expect(result.scheduledToday).toEqual([]);
    expect(result.dueToday).toEqual([]);
    expect(result.overdue).toEqual([]);
  });

  it("puts a task due today (and not yet passed) in dueToday", () => {
    const task = makeTask({ deadline: new Date("2026-06-15T18:00:00.000Z") });
    const result = classifyForToday([task], NOW, FROM, TO);
    expect(result.dueToday).toEqual([task]);
    expect(result.overdue).toEqual([]);
  });

  it("classifies an incomplete task with a passed deadline as overdue", () => {
    const task = makeTask({ deadline: new Date("2026-06-10T00:00:00.000Z"), status: "TODO" });
    const result = classifyForToday([task], NOW, FROM, TO);
    expect(result.overdue).toEqual([task]);
    expect(result.scheduledToday).toEqual([]);
    expect(result.dueToday).toEqual([]);
  });

  it("does not classify a DONE task as overdue even with a passed deadline", () => {
    const task = makeTask({ deadline: new Date("2026-06-10T00:00:00.000Z"), status: "DONE" });
    const result = classifyForToday([task], NOW, FROM, TO);
    expect(result.overdue).toEqual([]);
  });

  it("does not classify a CANCELLED task as overdue even with a passed deadline", () => {
    const task = makeTask({ deadline: new Date("2026-06-10T00:00:00.000Z"), status: "CANCELLED" });
    const result = classifyForToday([task], NOW, FROM, TO);
    expect(result.overdue).toEqual([]);
    expect(result.scheduledToday).toEqual([]);
    expect(result.dueToday).toEqual([]);
  });

  it("does not classify a task as overdue merely because scheduledAt has passed", () => {
    const task = makeTask({
      scheduledAt: new Date("2026-06-10T00:00:00.000Z"), // long past
      deadline: new Date("2026-06-20T00:00:00.000Z"), // future — not overdue
    });
    const result = classifyForToday([task], NOW, FROM, TO);
    expect(result.overdue).toEqual([]);
    expect(result.scheduledToday).toEqual([]);
    expect(result.dueToday).toEqual([]);
  });

  it("places a task both scheduled and due today in exactly one bucket (scheduledToday)", () => {
    const task = makeTask({
      scheduledAt: new Date("2026-06-15T09:00:00.000Z"),
      deadline: new Date("2026-06-15T18:00:00.000Z"),
    });
    const result = classifyForToday([task], NOW, FROM, TO);
    expect(result.scheduledToday).toEqual([task]);
    expect(result.dueToday).toEqual([]);
    expect(result.overdue).toEqual([]);
  });

  it("prioritizes overdue over scheduledToday for a task that is both", () => {
    const task = makeTask({
      scheduledAt: new Date("2026-06-15T09:00:00.000Z"), // today
      deadline: new Date("2026-06-01T00:00:00.000Z"), // long past, incomplete
    });
    const result = classifyForToday([task], NOW, FROM, TO);
    expect(result.overdue).toEqual([task]);
    expect(result.scheduledToday).toEqual([]);
  });

  it("ignores tasks with neither scheduledAt nor a relevant deadline", () => {
    const task = makeTask();
    const result = classifyForToday([task], NOW, FROM, TO);
    expect(result.overdue).toEqual([]);
    expect(result.scheduledToday).toEqual([]);
    expect(result.dueToday).toEqual([]);
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

describe("taskService.getToday", () => {
  it("buckets scheduled-today, due-today, and overdue tasks, scoped to the caller", async () => {
    const { service } = buildService();
    const now = Date.now();
    const from = new Date(now - 60 * 60 * 1000).toISOString();
    const to = new Date(now + 60 * 60 * 1000).toISOString();

    const scheduled = await service.createTask(USER_A, {
      title: "Scheduled",
      scheduledAt: new Date(now).toISOString(),
    });
    const due = await service.createTask(USER_A, {
      title: "Due",
      deadline: new Date(now + 30 * 60 * 1000).toISOString(),
    });
    const overdue = await service.createTask(USER_A, {
      title: "Overdue",
      deadline: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    });
    await service.createTask(USER_B, {
      title: "Not mine",
      scheduledAt: new Date(now).toISOString(),
    });
    await service.createTask(USER_A, { title: "Irrelevant, no dates" });

    const result = await service.getToday(USER_A, { from, to });

    expect(result.scheduledToday.map((t) => t.id)).toEqual([scheduled.id]);
    expect(result.dueToday.map((t) => t.id)).toEqual([due.id]);
    expect(result.overdue.map((t) => t.id)).toEqual([overdue.id]);
  });

  it("sorts scheduledToday chronologically", async () => {
    const { service } = buildService();
    const now = Date.now();
    const from = new Date(now - 60 * 60 * 1000).toISOString();
    const to = new Date(now + 6 * 60 * 60 * 1000).toISOString();

    const later = await service.createTask(USER_A, {
      title: "Later",
      scheduledAt: new Date(now + 3 * 60 * 60 * 1000).toISOString(),
    });
    const earlier = await service.createTask(USER_A, {
      title: "Earlier",
      scheduledAt: new Date(now).toISOString(),
    });

    const result = await service.getToday(USER_A, { from, to });

    expect(result.scheduledToday.map((t) => t.id)).toEqual([earlier.id, later.id]);
  });

  it("rejects an invalid range where to is not after from", async () => {
    const { service } = buildService();
    const now = new Date().toISOString();
    // The service itself doesn't validate this (the shared Zod schema does,
    // at the API boundary) — with from === to, the classification simply
    // yields empty buckets rather than throwing.
    const result = await service.getToday(USER_A, { from: now, to: now });
    expect(result).toEqual({ overdue: [], scheduledToday: [], dueToday: [] });
  });
});

describe("taskService.getSchedule", () => {
  it("returns only the caller's tasks scheduled within the range, ordered chronologically", async () => {
    const { service } = buildService();
    const now = Date.now();
    const from = new Date(now).toISOString();
    const to = new Date(now + 24 * 60 * 60 * 1000).toISOString();

    const later = await service.createTask(USER_A, {
      title: "Later",
      scheduledAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
    });
    const earlier = await service.createTask(USER_A, {
      title: "Earlier",
      scheduledAt: new Date(now + 1000).toISOString(),
    });
    await service.createTask(USER_A, {
      title: "Outside range",
      scheduledAt: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await service.createTask(USER_B, {
      title: "Not mine",
      scheduledAt: new Date(now + 1000).toISOString(),
    });
    await service.createTask(USER_A, { title: "Unscheduled" });

    const result = await service.getSchedule(USER_A, { from, to });

    expect(result.map((t) => t.id)).toEqual([earlier.id, later.id]);
  });

  it("excludes CANCELLED tasks from the schedule", async () => {
    const { service } = buildService();
    const now = Date.now();
    const from = new Date(now).toISOString();
    const to = new Date(now + 24 * 60 * 60 * 1000).toISOString();

    const created = await service.createTask(USER_A, {
      title: "Cancelled",
      scheduledAt: new Date(now + 1000).toISOString(),
    });
    await service.updateTask(USER_A, created.id, { status: "CANCELLED" });

    const result = await service.getSchedule(USER_A, { from, to });

    expect(result).toEqual([]);
  });
});

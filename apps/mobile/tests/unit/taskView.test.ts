import type { TaskResponse, TaskStatus } from "@taskflow/shared";
import { filterTasksByView } from "../../src/features/tasks/taskView";

const NOW = new Date("2026-06-15T12:00:00.000Z");

function makeTask(id: string, status: TaskStatus, deadline: string | null = null): TaskResponse {
  return {
    id,
    title: id,
    description: null,
    status,
    priority: "MEDIUM",
    category: null,
    scheduledAt: null,
    deadline,
    creatorId: "user-1",
    assigneeId: "user-1",
    completedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const tasks: TaskResponse[] = [
  makeTask("todo-no-deadline", "TODO"),
  makeTask("todo-future-deadline", "TODO", "2026-06-16T00:00:00.000Z"),
  makeTask("todo-overdue", "TODO", "2026-06-14T00:00:00.000Z"),
  makeTask("in-progress-overdue", "IN_PROGRESS", "2026-06-01T00:00:00.000Z"),
  makeTask("done", "DONE"),
  makeTask("cancelled", "CANCELLED"),
];

describe("filterTasksByView", () => {
  it("returns every task for 'all', including overdue and cancelled ones", () => {
    expect(filterTasksByView(tasks, "all", NOW).map((t) => t.id)).toEqual([
      "todo-no-deadline",
      "todo-future-deadline",
      "todo-overdue",
      "in-progress-overdue",
      "done",
      "cancelled",
    ]);
  });

  it("returns TODO/IN_PROGRESS tasks that aren't overdue for 'active'", () => {
    expect(filterTasksByView(tasks, "active", NOW).map((t) => t.id)).toEqual([
      "todo-no-deadline",
      "todo-future-deadline",
    ]);
  });

  it("excludes a task whose deadline is exactly now from 'active'", () => {
    const dueRightNow = makeTask("due-now", "TODO", NOW.toISOString());
    expect(filterTasksByView([dueRightNow], "active", NOW)).toEqual([dueRightNow]);

    const oneMsOverdue = makeTask(
      "just-overdue",
      "TODO",
      new Date(NOW.getTime() - 1).toISOString(),
    );
    expect(filterTasksByView([oneMsOverdue], "active", NOW)).toEqual([]);
  });

  it("returns only DONE for 'completed'", () => {
    expect(filterTasksByView(tasks, "completed", NOW).map((t) => t.id)).toEqual(["done"]);
  });
});

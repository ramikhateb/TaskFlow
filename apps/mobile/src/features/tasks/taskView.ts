import type { TaskResponse } from "@taskflow/shared";

export type TaskView = "all" | "active" | "completed";

export const TASK_VIEW_OPTIONS: { label: string; value: TaskView }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
];

/**
 * The Tasks screen's three top-level categories. "Active" is TODO or
 * IN_PROGRESS whose deadline (if any) hasn't passed yet — an overdue task
 * needs attention now, not a spot in the same bucket as everything with
 * plenty of time left, so it only shows under "All". "Completed" is DONE
 * only. CANCELLED tasks also only show up under "All". There's no single
 * server-side status filter that expresses "TODO or IN_PROGRESS" in one
 * request, so this filters client-side over whatever the server already
 * returned for the active priority/category/search filters.
 */
export function filterTasksByView(
  tasks: TaskResponse[],
  view: TaskView,
  now: Date = new Date(),
): TaskResponse[] {
  switch (view) {
    case "all":
      return tasks;
    case "active":
      return tasks.filter(
        (task) =>
          (task.status === "TODO" || task.status === "IN_PROGRESS") &&
          (task.deadline === null || new Date(task.deadline).getTime() >= now.getTime()),
      );
    case "completed":
      return tasks.filter((task) => task.status === "DONE");
  }
}

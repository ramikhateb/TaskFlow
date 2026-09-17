import type { TaskResponse } from "@taskflow/shared";

// Only an active task can be handed to someone else (FR-21) — mirrors the
// server's ASSIGNABLE_STATUSES check in apps/api/src/services/assignmentService.ts
// exactly, so the mobile "Assign to someone" entry point never invites a
// request the API would reject anyway.
const ASSIGNABLE_STATUSES: ReadonlySet<TaskResponse["status"]> = new Set(["TODO", "IN_PROGRESS"]);

export function canAssignTask(status: TaskResponse["status"]): boolean {
  return ASSIGNABLE_STATUSES.has(status);
}

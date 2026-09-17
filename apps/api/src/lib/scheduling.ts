// FR-8/EC-13: scheduledAt and deadline are independent — either, both, or
// neither may be set — but when both are present, deadline must be on or
// after scheduledAt. Pulled out of taskService.ts (rather than left there
// and imported service-to-service) because assignmentService.acceptAssignment
// (M9) needs the exact same rule to validate the recipient's scheduling
// choice against the task's existing deadline, and services never import
// each other in this architecture (see ARCHITECTURE.md §3) — both services
// depend on this dependency-free pure function instead.
export function isScheduleValid(scheduledAt: Date | null, deadline: Date | null): boolean {
  if (scheduledAt === null || deadline === null) return true;
  return deadline.getTime() >= scheduledAt.getTime();
}

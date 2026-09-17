// Fast client-side feedback only (M9 spec: "validate obvious deadline
// conflicts in UI for fast feedback, server remains authoritative") —
// mirrors apps/api/src/lib/scheduling.ts's isScheduleValid exactly. The
// server re-validates this unconditionally on accept; a bug here can only
// produce a confusing error message, never an incorrect accept.
export function isAcceptScheduleValid(scheduledAt: Date | null, deadline: Date | null): boolean {
  if (scheduledAt === null || deadline === null) return true;
  return deadline.getTime() >= scheduledAt.getTime();
}

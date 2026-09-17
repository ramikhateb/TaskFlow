/**
 * The server has no notion of the caller's timezone (ARCHITECTURE.md §3,
 * REQUIREMENTS.md FR-17/EC-8) — it's the client's job to compute what "today"
 * means locally and hand the server plain UTC instant boundaries. This uses
 * the device's local timezone (via Date's local getters/setters) to find
 * local midnight for the given date, then the following local midnight, and
 * converts both to UTC ISO strings. Deliberately not a hardcoded 24h offset:
 * `setDate` correctly crosses DST transitions, which can make a local day
 * 23 or 25 hours long — the boundaries reflect that when it happens.
 */
export function getLocalDayBoundaries(date: Date): { from: string; to: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

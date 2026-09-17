import { getLocalDayBoundaries } from "../../src/features/tasks/dateBoundaries";

describe("getLocalDayBoundaries", () => {
  it("returns a 24-hour window from local midnight to the next local midnight", () => {
    const date = new Date(2026, 5, 15, 14, 30, 0); // June 15, 2026, 2:30pm local
    const { from, to } = getLocalDayBoundaries(date);

    const fromDate = new Date(from);
    const toDate = new Date(to);

    expect(fromDate.getHours()).toBe(0);
    expect(fromDate.getMinutes()).toBe(0);
    expect(fromDate.getDate()).toBe(15);

    expect(toDate.getTime() - fromDate.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("produces boundaries as valid ISO 8601 UTC strings", () => {
    const { from, to } = getLocalDayBoundaries(new Date(2026, 0, 1));
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("gives a different window for two different calendar days", () => {
    const day1 = getLocalDayBoundaries(new Date(2026, 5, 15));
    const day2 = getLocalDayBoundaries(new Date(2026, 5, 16));

    expect(day1.from).not.toBe(day2.from);
    expect(day1.to).toBe(day2.from); // consecutive days are back-to-back
  });

  it("is independent of the time-of-day component of the input date", () => {
    const morning = getLocalDayBoundaries(new Date(2026, 5, 15, 6, 0, 0));
    const night = getLocalDayBoundaries(new Date(2026, 5, 15, 23, 59, 59));

    expect(morning).toEqual(night);
  });
});

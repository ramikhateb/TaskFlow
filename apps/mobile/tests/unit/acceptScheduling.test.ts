import { isAcceptScheduleValid } from "../../src/features/inbox/acceptScheduling";

describe("isAcceptScheduleValid", () => {
  it("is valid when scheduledAt is before the deadline", () => {
    expect(
      isAcceptScheduleValid(
        new Date("2026-09-26T14:00:00.000Z"),
        new Date("2026-09-27T17:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("is valid when scheduledAt equals the deadline", () => {
    const date = new Date("2026-09-27T17:00:00.000Z");
    expect(isAcceptScheduleValid(date, new Date(date))).toBe(true);
  });

  it("is invalid when scheduledAt is after the deadline", () => {
    expect(
      isAcceptScheduleValid(
        new Date("2026-09-28T09:00:00.000Z"),
        new Date("2026-09-27T17:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it('"Schedule later" (null) is always valid, even with a deadline', () => {
    expect(isAcceptScheduleValid(null, new Date("2026-09-27T17:00:00.000Z"))).toBe(true);
  });

  it("is valid when there is no deadline at all", () => {
    expect(isAcceptScheduleValid(new Date("2026-09-26T14:00:00.000Z"), null)).toBe(true);
  });

  it("is valid when neither is set", () => {
    expect(isAcceptScheduleValid(null, null)).toBe(true);
  });
});

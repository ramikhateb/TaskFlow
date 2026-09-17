import { SENT_STATUS_COLORS, sentStatusLabel } from "../../src/features/inbox/sentStatus";

describe("sentStatusLabel", () => {
  it.each([
    ["PENDING", "Pending"],
    ["ACCEPTED", "Accepted"],
    ["DECLINED", "Declined"],
    ["CANCELLED", "Cancelled"],
  ] as const)("labels %s as %s", (status, label) => {
    expect(sentStatusLabel(status)).toBe(label);
  });
});

describe("SENT_STATUS_COLORS", () => {
  it("defines a distinct color for every status", () => {
    const colors = Object.values(SENT_STATUS_COLORS);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("has an entry for every AssignmentStatus value", () => {
    expect(Object.keys(SENT_STATUS_COLORS).sort()).toEqual(
      ["ACCEPTED", "CANCELLED", "DECLINED", "PENDING"].sort(),
    );
  });
});

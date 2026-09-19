import { sentStatusLabel } from "../../src/features/inbox/sentStatus";
import { statusColors } from "../../src/ui/theme";

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

describe("statusColors", () => {
  it("defines a distinct foreground color for every status", () => {
    const foregrounds = Object.values(statusColors).map((c) => c.fg);
    expect(new Set(foregrounds).size).toBe(foregrounds.length);
  });

  it("has an entry for every AssignmentStatus value", () => {
    expect(Object.keys(statusColors).sort()).toEqual(
      ["ACCEPTED", "CANCELLED", "DECLINED", "PENDING"].sort(),
    );
  });
});

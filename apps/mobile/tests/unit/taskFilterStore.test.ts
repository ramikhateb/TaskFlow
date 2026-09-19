import { hasActiveTaskFilters } from "../../src/stores/taskFilterStore";

const EMPTY = { priority: null, category: null, q: "" };

describe("hasActiveTaskFilters", () => {
  it("is false when nothing is set", () => {
    expect(hasActiveTaskFilters(EMPTY)).toBe(false);
  });

  it("is true when priority is set", () => {
    expect(hasActiveTaskFilters({ ...EMPTY, priority: "HIGH" })).toBe(true);
  });

  it("is true when category is set", () => {
    expect(hasActiveTaskFilters({ ...EMPTY, category: "Work" })).toBe(true);
  });

  it("is true when q is a non-empty string", () => {
    expect(hasActiveTaskFilters({ ...EMPTY, q: "report" })).toBe(true);
  });

  it("is false when q is an empty string", () => {
    expect(hasActiveTaskFilters({ ...EMPTY, q: "" })).toBe(false);
  });

  it("is true when multiple filters are combined", () => {
    expect(hasActiveTaskFilters({ priority: "HIGH", category: "Work", q: "report" })).toBe(true);
  });
});

import {
  isSearchQueryTooShort,
  normalizeSearchQuery,
} from "../../src/features/users/normalizeSearchQuery";

describe("normalizeSearchQuery", () => {
  it("trims whitespace", () => {
    expect(normalizeSearchQuery("  rami  ")).toBe("rami");
  });

  it("strips a single leading @", () => {
    expect(normalizeSearchQuery("@rami")).toBe("rami");
  });

  it("lowercases", () => {
    expect(normalizeSearchQuery("RamiKhateb")).toBe("ramikhateb");
  });

  it("combines trim, @-strip, and lowercase", () => {
    expect(normalizeSearchQuery("  @RamiKhateb  ")).toBe("ramikhateb");
  });

  it("treats a bare @ as an empty query", () => {
    expect(normalizeSearchQuery("@")).toBe("");
  });
});

describe("isSearchQueryTooShort", () => {
  it("is false for an empty query (initial state, not an error)", () => {
    expect(isSearchQueryTooShort("")).toBe(false);
  });

  it("is true for a single character", () => {
    expect(isSearchQueryTooShort("r")).toBe(true);
  });

  it("is true for a single character after stripping @", () => {
    expect(isSearchQueryTooShort("@r")).toBe(true);
  });

  it("is false once the minimum length is reached", () => {
    expect(isSearchQueryTooShort("ra")).toBe(false);
  });
});

import { usernameSchema } from "@taskflow/shared";

// The registration screen relies entirely on this shared schema for
// validation feedback — exercising it here confirms the mobile app is
// validating usernames the same way the API will, before a request is ever
// sent (ARCHITECTURE.md: shared Zod schemas prevent contract drift).
describe("usernameSchema (as used by the registration screen)", () => {
  it("normalizes and accepts a valid username", () => {
    const result = usernameSchema.safeParse("  @RamiKhateb  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("ramikhateb");
    }
  });

  it("rejects a username that is too short", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false);
  });

  it("rejects a username that is too long", () => {
    expect(usernameSchema.safeParse("a".repeat(21)).success).toBe(false);
  });

  it("rejects invalid characters", () => {
    expect(usernameSchema.safeParse("rami khateb!").success).toBe(false);
  });

  it("rejects a username starting with an underscore or period", () => {
    expect(usernameSchema.safeParse("_rami").success).toBe(false);
    expect(usernameSchema.safeParse(".rami").success).toBe(false);
  });

  it("accepts underscore and period elsewhere in the username", () => {
    expect(usernameSchema.safeParse("rami_khateb.dev").success).toBe(true);
  });
});

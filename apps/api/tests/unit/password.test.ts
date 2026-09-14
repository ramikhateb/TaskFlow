import { hashPassword, verifyPassword } from "../../src/lib/password";

describe("password hashing", () => {
  it("never stores the plaintext password in the hash", async () => {
    const hash = await hashPassword("correct-horse-1");
    expect(hash).not.toBe("correct-horse-1");
    expect(hash).not.toContain("correct-horse-1");
  });

  it("produces a different hash for the same password each time (salted)", async () => {
    const [hashA, hashB] = await Promise.all([
      hashPassword("correct-horse-1"),
      hashPassword("correct-horse-1"),
    ]);
    expect(hashA).not.toBe(hashB);
  });

  it("verifies the correct password against its hash", async () => {
    const hash = await hashPassword("correct-horse-1");
    await expect(verifyPassword("correct-horse-1", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-horse-1");
    await expect(verifyPassword("wrong-password-1", hash)).resolves.toBe(false);
  });
});

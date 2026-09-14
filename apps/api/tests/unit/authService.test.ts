import { ConflictError, UnauthenticatedError } from "../../src/errors";
import { hashRefreshToken } from "../../src/lib/tokens";
import { createAuthService } from "../../src/services/authService";
import { createFakeRepositories } from "../helpers/fakeAuthRepositories";

const env = {
  JWT_ACCESS_SECRET: "unit-test-secret-at-least-32-chars-long",
  JWT_ACCESS_TTL_SECONDS: 900,
  REFRESH_TOKEN_TTL_DAYS: 30,
};

function buildService() {
  const repos = createFakeRepositories();
  const service = createAuthService({ ...repos, env });
  return { service, ...repos };
}

describe("authService.register", () => {
  it("creates a user with a hashed password and returns tokens + profile", async () => {
    const { service, users } = buildService();

    const result = await service.register({
      email: "a@example.com",
      password: "password1",
      name: "Alice",
    });

    expect(result.user).toEqual({ id: expect.any(String), email: "a@example.com", name: "Alice" });
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(users).toHaveLength(1);
    expect(users[0]?.passwordHash).not.toBe("password1");
  });

  it("rejects a duplicate email with ConflictError", async () => {
    const { service } = buildService();
    await service.register({ email: "a@example.com", password: "password1", name: "Alice" });

    await expect(
      service.register({ email: "a@example.com", password: "password2", name: "Alice 2" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("authService.login", () => {
  it("succeeds with correct credentials", async () => {
    const { service } = buildService();
    await service.register({ email: "a@example.com", password: "password1", name: "Alice" });

    const result = await service.login({ email: "a@example.com", password: "password1" });
    expect(result.user.email).toBe("a@example.com");
  });

  it("rejects an unknown email with a generic message (no enumeration)", async () => {
    const { service } = buildService();
    await expect(
      service.login({ email: "ghost@example.com", password: "password1" }),
    ).rejects.toMatchObject({
      message: "Invalid email or password",
    });
  });

  it("rejects a wrong password with the same generic message as an unknown email", async () => {
    const { service } = buildService();
    await service.register({ email: "a@example.com", password: "password1", name: "Alice" });

    await expect(
      service.login({ email: "a@example.com", password: "wrong" }),
    ).rejects.toMatchObject({
      message: "Invalid email or password",
    });
  });

  it("throws UnauthenticatedError for both failure cases", async () => {
    const { service } = buildService();
    await expect(
      service.login({ email: "ghost@example.com", password: "x" }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe("authService.refresh", () => {
  it("rotates the refresh token and revokes the old one", async () => {
    const { service, tokens } = buildService();
    const { refreshToken: original } = await service.register({
      email: "a@example.com",
      password: "password1",
      name: "Alice",
    });

    const rotated = await service.refresh(original);

    expect(rotated.refreshToken).not.toBe(original);
    expect(tokens).toHaveLength(2);
    expect(tokens[0]?.revokedAt).not.toBeNull();
    expect(tokens[1]?.revokedAt).toBeNull();
    expect(tokens[0]?.familyId).toBe(tokens[1]?.familyId);
  });

  it("detects reuse of a rotated-out token and revokes the whole family", async () => {
    const { service, tokens } = buildService();
    const { refreshToken: original } = await service.register({
      email: "a@example.com",
      password: "password1",
      name: "Alice",
    });

    await service.refresh(original); // rotates once, retiring `original`

    await expect(service.refresh(original)).rejects.toBeInstanceOf(ConflictError);
    // Every token in the family — including the one just minted above — is now dead.
    expect(tokens.every((t) => t.revokedAt !== null)).toBe(true);
  });

  it("rejects an unknown refresh token", async () => {
    const { service } = buildService();
    await expect(service.refresh("not-a-real-token")).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("rejects an expired refresh token", async () => {
    const { service, refreshTokenRepository } = buildService();
    const { refreshToken } = await service.register({
      email: "a@example.com",
      password: "password1",
      name: "Alice",
    });
    const record = await refreshTokenRepository.findByTokenHash(hashRefreshToken(refreshToken));
    record!.expiresAt = new Date(Date.now() - 1000);

    await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe("authService.logout", () => {
  it("revokes the given refresh token", async () => {
    const { service, tokens } = buildService();
    const { refreshToken } = await service.register({
      email: "a@example.com",
      password: "password1",
      name: "Alice",
    });

    await service.logout(refreshToken);

    expect(tokens[0]?.revokedAt).not.toBeNull();
  });

  it("is idempotent for an unknown token", async () => {
    const { service } = buildService();
    await expect(service.logout("not-a-real-token")).resolves.toBeUndefined();
  });

  it("is idempotent for an already-revoked token", async () => {
    const { service } = buildService();
    const { refreshToken } = await service.register({
      email: "a@example.com",
      password: "password1",
      name: "Alice",
    });

    await service.logout(refreshToken);
    await expect(service.logout(refreshToken)).resolves.toBeUndefined();
  });
});

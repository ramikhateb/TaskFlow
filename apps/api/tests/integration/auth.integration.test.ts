import jwt from "jsonwebtoken";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../src/app";
import { loadEnv } from "../../src/env";
import { prisma } from "../../src/lib/prisma";
import { hashRefreshToken } from "../../src/lib/tokens";

let app: Express;
const env = loadEnv();

beforeAll(() => {
  app = createApp(env);
});

beforeEach(async () => {
  // Full cleanup, not just the tables this file's own tests touch: multiple
  // integration test files share one test database, and Jest's file
  // execution order isn't guaranteed alphabetical/stable — a file that runs
  // first and leaves Task/TaskAssignment rows behind would otherwise break
  // this file's very first beforeEach via a FK constraint on User.
  await prisma.taskAssignment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const validRegistration = {
  email: "alice@example.com",
  password: "password1",
  name: "Alice",
  username: "alice",
};

describe("POST /auth/register", () => {
  it("creates an account and returns tokens + profile", async () => {
    const res = await request(app).post("/auth/register").send(validRegistration);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      user: { email: "alice@example.com", name: "Alice", username: "alice" },
    });
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: "alice@example.com" } });
    expect(stored.passwordHash).not.toBe("password1");
  });

  // M11 (Phase 12): the response's `user` object is the auth-scoped
  // `UserProfile` shape (id/email/name/username — email is intentional
  // here, this IS the account's own auth response), but it must never leak
  // the password hash itself, and the shape must be exactly what's
  // documented, not "happens to also include extra fields today."
  it("never includes passwordHash anywhere in the response", async () => {
    const res = await request(app).post("/auth/register").send(validRegistration);

    expect(res.body).not.toHaveProperty("passwordHash");
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(Object.keys(res.body.user)).toEqual(["id", "email", "name", "username", "bio"]);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("rejects a duplicate email with 409 CONFLICT", async () => {
    await request(app).post("/auth/register").send(validRegistration);
    const res = await request(app).post("/auth/register").send(validRegistration);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("rejects an invalid email with 400 VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ ...validRegistration, email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a weak password with 400 VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ ...validRegistration, password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /auth/register — username (M7, FR-1a)", () => {
  it("normalizes username: trims, strips a leading @, lowercases", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ ...validRegistration, username: "  @RamiKhateb  " });

    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe("ramikhateb");
  });

  it("rejects a duplicate username with 409 CONFLICT", async () => {
    await request(app).post("/auth/register").send(validRegistration);

    const res = await request(app)
      .post("/auth/register")
      .send({ ...validRegistration, email: "someone-else@example.com" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("rejects a case-insensitive duplicate username with 409 CONFLICT", async () => {
    await request(app).post("/auth/register").send(validRegistration);

    const res = await request(app)
      .post("/auth/register")
      .send({ ...validRegistration, email: "someone-else@example.com", username: "ALICE" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("rejects a duplicate email even when the username differs (both checked)", async () => {
    await request(app).post("/auth/register").send(validRegistration);

    const res = await request(app)
      .post("/auth/register")
      .send({ ...validRegistration, username: "someoneelse" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("rejects invalid characters with 400 VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ ...validRegistration, username: "alice smith!" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a too-short username with 400 VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ ...validRegistration, username: "ab" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a too-long username with 400 VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ ...validRegistration, username: "a".repeat(21) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("accepts a username at the minimum and maximum length", async () => {
    const min = await request(app)
      .post("/auth/register")
      .send({ ...validRegistration, username: "abc" });
    expect(min.status).toBe(201);

    const max = await request(app)
      .post("/auth/register")
      .send({ ...validRegistration, email: "other@example.com", username: "a".repeat(20) });
    expect(max.status).toBe(201);
  });

  it("rejects a username starting with an underscore or period", async () => {
    const underscore = await request(app)
      .post("/auth/register")
      .send({ ...validRegistration, username: "_alice" });
    expect(underscore.status).toBe(400);

    const period = await request(app)
      .post("/auth/register")
      .send({ ...validRegistration, email: "other@example.com", username: ".alice" });
    expect(period.status).toBe(400);
  });
});

describe("POST /auth/login", () => {
  beforeEach(async () => {
    await request(app).post("/auth/register").send(validRegistration);
  });

  it("succeeds with correct credentials", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: validRegistration.email, password: validRegistration.password });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(validRegistration.email);
  });

  it("never includes passwordHash, tokenHash, or familyId anywhere in the response (M11, Phase 12)", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: validRegistration.email, password: validRegistration.password });

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain("passwordHash");
    expect(serialized).not.toContain("tokenHash");
    expect(serialized).not.toContain("familyId");
    expect(Object.keys(res.body.user)).toEqual(["id", "email", "name", "username", "bio"]);
  });

  it("rejects a wrong password with a generic 401 message", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: validRegistration.email, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid email or password");
  });

  it("rejects an unknown email with the exact same generic 401 message", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "ghost@example.com", password: "whatever1" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid email or password");
  });
});

describe("GET /auth/me", () => {
  it("returns the caller's profile with a valid access token", async () => {
    const { body } = await request(app).post("/auth/register").send(validRegistration);

    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: body.user.id,
      email: validRegistration.email,
      name: "Alice",
      username: "alice",
      bio: null,
    });
  });

  it("rejects a missing Authorization header with 401", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects a malformed/invalid access token with 401", async () => {
    const res = await request(app).get("/auth/me").set("Authorization", "Bearer not-a-real-jwt");
    expect(res.status).toBe(401);
  });

  // M11 (Phase 11): an expired token is structurally valid (correct
  // signature, correct payload shape) but must still be rejected —
  // distinct from "malformed" above, which never had a valid signature to
  // begin with. Signed directly with the same secret/library the app uses,
  // just with a already-elapsed TTL — not a production hook, the exact
  // same code path `signAccessToken` uses.
  it("rejects an expired access token with 401", async () => {
    const { body } = await request(app).post("/auth/register").send(validRegistration);
    const expiredToken = jwt.sign({ sub: body.user.id }, env.JWT_ACCESS_SECRET, {
      expiresIn: -10,
    });

    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it.each([
    ["no Bearer prefix at all", "sometoken"],
    ["lowercase bearer", "bearer sometoken"],
    ["Bearer with no token", "Bearer "],
    ["Bearer with only whitespace", "Bearer    "],
  ])(
    "rejects a malformed Authorization header (%s) with 401, not a crash",
    async (_label, header) => {
      const res = await request(app).get("/auth/me").set("Authorization", header);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    },
  );
});

describe("PATCH /auth/me", () => {
  async function registerAndGetToken() {
    const { body } = await request(app).post("/auth/register").send(validRegistration);
    return { accessToken: body.accessToken as string, userId: body.user.id as string };
  }

  it("updates the caller's name", async () => {
    const { accessToken } = await registerAndGetToken();

    const res = await request(app)
      .patch("/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Alice Cooper" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Alice Cooper");
    expect(res.body.username).toBe("alice");
    expect(res.body.bio).toBeNull();
  });

  it("sets and then clears the bio", async () => {
    const { accessToken } = await registerAndGetToken();

    const setRes = await request(app)
      .patch("/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ bio: "CS graduate | Building products" });
    expect(setRes.status).toBe(200);
    expect(setRes.body.bio).toBe("CS graduate | Building products");

    // Omitting name here must leave it untouched — PATCH semantics, not PUT.
    expect(setRes.body.name).toBe("Alice");

    const clearRes = await request(app)
      .patch("/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ bio: null });
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.bio).toBeNull();
  });

  it("persists across a subsequent GET /auth/me", async () => {
    const { accessToken } = await registerAndGetToken();

    await request(app)
      .patch("/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Ally", bio: "Always learning" });

    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${accessToken}`);

    expect(res.body.name).toBe("Ally");
    expect(res.body.bio).toBe("Always learning");
  });

  it("rejects an empty name with 400", async () => {
    const { accessToken } = await registerAndGetToken();

    const res = await request(app)
      .patch("/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a bio longer than 160 characters with 400", async () => {
    const { accessToken } = await registerAndGetToken();

    const res = await request(app)
      .patch("/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ bio: "x".repeat(161) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an empty body with 400 (at least one field required)", async () => {
    const { accessToken } = await registerAndGetToken();

    const res = await request(app)
      .patch("/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).patch("/auth/me").send({ name: "Nope" });
    expect(res.status).toBe(401);
  });

  it("silently strips unknown/protected fields rather than applying them", async () => {
    const { accessToken, userId } = await registerAndGetToken();

    const res = await request(app)
      .patch("/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Alice B", username: "hacker", email: "new@example.com", id: "other-id" });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(userId);
    expect(res.body.username).toBe("alice");
    expect(res.body.email).toBe(validRegistration.email);
    expect(res.body.passwordHash).toBeUndefined();
  });
});

describe("POST /auth/refresh", () => {
  it("rotates the refresh token and issues a new access token", async () => {
    const { body: registered } = await request(app).post("/auth/register").send(validRegistration);

    const res = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: registered.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).not.toBe(registered.refreshToken);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it("rejects reuse of a rotated-out refresh token and revokes the family (EC-9)", async () => {
    const { body: registered } = await request(app).post("/auth/register").send(validRegistration);

    const rotated = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: registered.refreshToken });
    expect(rotated.status).toBe(200);

    // Reusing the original (now rotated-out) token is rejected...
    const reuse = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: registered.refreshToken });
    expect(reuse.status).toBe(409);
    expect(reuse.body.error.code).toBe("CONFLICT");

    // ...and the whole family is dead, including the token minted by the rotation above.
    const afterReuse = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: rotated.body.refreshToken });
    expect(afterReuse.status).toBe(409);
  });

  it("rejects an unknown refresh token with 401", async () => {
    const res = await request(app).post("/auth/refresh").send({ refreshToken: "unknown-token" });
    expect(res.status).toBe(401);
  });

  // M11 (Phase 11): distinct from "unknown" (never existed) and "reused"
  // (EC-9, already revoked) — a token that's real, still unrevoked, but
  // past its own expiresAt. `authService.refresh` has this exact branch;
  // it had no test until now. TTL is normally 30 days (REFRESH_TOKEN_TTL_DAYS),
  // so this manipulates the stored row's expiresAt directly (the only way
  // to reach this branch deterministically without literally waiting) —
  // the token itself was minted through the real registration flow.
  it("rejects an expired (but otherwise valid, unrevoked) refresh token with 401", async () => {
    const { body } = await request(app).post("/auth/register").send(validRegistration);
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(body.refreshToken) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app).post("/auth/refresh").send({ refreshToken: body.refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");

    // Confirm it wasn't rotated/consumed by this rejected attempt.
    const stored = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(body.refreshToken) },
    });
    expect(stored.revokedAt).toBeNull();
  });
});

describe("POST /auth/logout", () => {
  it("revokes the supplied refresh token", async () => {
    const { body: registered } = await request(app).post("/auth/register").send(validRegistration);

    const res = await request(app)
      .post("/auth/logout")
      .send({ refreshToken: registered.refreshToken });
    expect(res.status).toBe(204);

    // The revoked token can no longer be used to refresh.
    const attempt = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: registered.refreshToken });
    expect(attempt.status).toBe(409);
  });

  it("is idempotent for an unknown token", async () => {
    const res = await request(app).post("/auth/logout").send({ refreshToken: "unknown-token" });
    expect(res.status).toBe(204);
  });
});

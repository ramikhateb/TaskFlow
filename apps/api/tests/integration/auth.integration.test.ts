import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../src/app";
import { loadEnv } from "../../src/env";
import { prisma } from "../../src/lib/prisma";

let app: Express;

beforeAll(() => {
  app = createApp(loadEnv());
});

beforeEach(async () => {
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const validRegistration = { email: "alice@example.com", password: "password1", name: "Alice" };

describe("POST /auth/register", () => {
  it("creates an account and returns tokens + profile", async () => {
    const res = await request(app).post("/auth/register").send(validRegistration);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      user: { email: "alice@example.com", name: "Alice" },
    });
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: "alice@example.com" } });
    expect(stored.passwordHash).not.toBe("password1");
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
    expect(res.body).toEqual({ id: body.user.id, email: validRegistration.email, name: "Alice" });
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

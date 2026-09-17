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
  // Full cleanup, not just the tables this file's own tests touch — see the
  // identical comment in auth.integration.test.ts.
  await prisma.taskAssignment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function registerUser(email: string, name: string, username: string) {
  const res = await request(app)
    .post("/auth/register")
    .send({ email, password: "password1", name, username });
  return { accessToken: res.body.accessToken as string, userId: res.body.user.id as string };
}

describe("GET /users/search", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get("/users/search?q=rami");
    expect(res.status).toBe(401);
  });

  it("finds a user by exact username match", async () => {
    const alice = await registerUser("alice@example.com", "Alice", "alice");
    await registerUser("bob@example.com", "Bob Builder", "bobbuilder");

    const res = await request(app)
      .get("/users/search?q=bobbuilder")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ username: "bobbuilder", name: "Bob Builder" });
  });

  it("finds a user by username prefix/substring match", async () => {
    const alice = await registerUser("alice@example.com", "Alice", "alice");
    await registerUser("bob@example.com", "Bob Builder", "bobbuilder");

    const res = await request(app)
      .get("/users/search?q=bob")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.body.data.map((u: { username: string }) => u.username)).toContain("bobbuilder");
  });

  it("handles a query with a leading @ the same as without", async () => {
    const alice = await registerUser("alice@example.com", "Alice", "alice");
    await registerUser("bob@example.com", "Bob Builder", "bobbuilder");

    const withAt = await request(app)
      .get("/users/search?q=%40bobbuilder")
      .set("Authorization", `Bearer ${alice.accessToken}`);
    const withoutAt = await request(app)
      .get("/users/search?q=bobbuilder")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(withAt.body.data.map((u: { id: string }) => u.id)).toEqual(
      withoutAt.body.data.map((u: { id: string }) => u.id),
    );
    expect(withAt.body.data).toHaveLength(1);
  });

  it("finds a user by display name substring", async () => {
    const alice = await registerUser("alice@example.com", "Alice", "alice");
    await registerUser("bob@example.com", "Bob Builder", "unrelated_handle");

    const res = await request(app)
      .get("/users/search?q=builder")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.body.data.map((u: { username: string }) => u.username)).toContain(
      "unrelated_handle",
    );
  });

  it("matches case-insensitively", async () => {
    const alice = await registerUser("alice@example.com", "Alice", "alice");
    await registerUser("bob@example.com", "Bob Builder", "bobbuilder");

    const res = await request(app)
      .get("/users/search?q=BOBBUILDER")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.body.data.map((u: { username: string }) => u.username)).toContain("bobbuilder");
  });

  it("trims the query", async () => {
    const alice = await registerUser("alice@example.com", "Alice", "alice");
    await registerUser("bob@example.com", "Bob Builder", "bobbuilder");

    const res = await request(app)
      .get("/users/search?q=%20%20bobbuilder%20%20")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.body.data.map((u: { username: string }) => u.username)).toContain("bobbuilder");
  });

  it("rejects a query shorter than the minimum length with 400 VALIDATION_ERROR", async () => {
    const alice = await registerUser("alice@example.com", "Alice", "alice");

    const res = await request(app)
      .get("/users/search?q=a")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a missing/empty query with 400 VALIDATION_ERROR", async () => {
    const alice = await registerUser("alice@example.com", "Alice", "alice");

    const missing = await request(app)
      .get("/users/search")
      .set("Authorization", `Bearer ${alice.accessToken}`);
    expect(missing.status).toBe(400);

    const empty = await request(app)
      .get("/users/search?q=")
      .set("Authorization", `Bearer ${alice.accessToken}`);
    expect(empty.status).toBe(400);
  });

  it("rejects a query longer than the maximum length with 400 VALIDATION_ERROR", async () => {
    const alice = await registerUser("alice@example.com", "Alice", "alice");

    const res = await request(app)
      .get(`/users/search?q=${"a".repeat(51)}`)
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns an empty array when nothing matches", async () => {
    const alice = await registerUser("alice@example.com", "Alice", "alice");

    const res = await request(app)
      .get("/users/search?q=nonexistentzzz")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("excludes the authenticated caller from their own search results", async () => {
    const alice = await registerUser("alice@example.com", "Alice", "alice");

    const res = await request(app)
      .get("/users/search?q=alice")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.body.data).toEqual([]);
  });

  it("orders exact match, then prefix, then other-substring, then name matches", async () => {
    const caller = await registerUser("caller@example.com", "Caller", "caller");
    await registerUser("e1@example.com", "Zzz", "rami"); // exact
    await registerUser("e2@example.com", "Zzz", "ramikhateb"); // prefix
    await registerUser("e3@example.com", "Zzz", "the_rami_fan"); // other substring
    await registerUser("e4@example.com", "Rami Khateb", "unrelated_zzz"); // name only

    const res = await request(app)
      .get("/users/search?q=rami")
      .set("Authorization", `Bearer ${caller.accessToken}`);

    expect(res.body.data.map((u: { username: string }) => u.username)).toEqual([
      "rami",
      "ramikhateb",
      "the_rami_fan",
      "unrelated_zzz",
    ]);
  });

  it("limits the number of results returned", async () => {
    const caller = await registerUser("caller@example.com", "Caller", "caller");
    for (let i = 0; i < 25; i += 1) {
      await registerUser(`match${i}@example.com`, `Match ${i}`, `matchuser${i}`);
    }

    const res = await request(app)
      .get("/users/search?q=matchuser")
      .set("Authorization", `Bearer ${caller.accessToken}`);

    expect(res.body.data.length).toBeLessThanOrEqual(20);
  }, 20000);

  it("never exposes email or passwordHash in results", async () => {
    const alice = await registerUser("alice@example.com", "Alice", "alice");
    await registerUser("bob@example.com", "Bob Builder", "bobbuilder");

    const res = await request(app)
      .get("/users/search?q=bob")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.body.data[0]).not.toHaveProperty("email");
    expect(res.body.data[0]).not.toHaveProperty("passwordHash");
    expect(Object.keys(res.body.data[0])).toEqual(["id", "name", "username"]);
  });

  it("does not match by email substring", async () => {
    const alice = await registerUser("alice@example.com", "Alice", "alice");
    await registerUser("uniqueemailtoken@example.com", "Bob Builder", "bobbuilder");

    const res = await request(app)
      .get("/users/search?q=uniqueemailtoken")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.body.data).toEqual([]);
  });

  it("does not return unrelated users outside the match", async () => {
    const alice = await registerUser("alice@example.com", "Alice", "alice");
    await registerUser("bob@example.com", "Bob Builder", "bobbuilder");
    await registerUser("carol@example.com", "Carol Danvers", "carold");

    const res = await request(app)
      .get("/users/search?q=bobbuilder")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.body.data.map((u: { username: string }) => u.username)).toEqual(["bobbuilder"]);
  });
});

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
  await prisma.task.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function registerUser(email: string, name: string) {
  const res = await request(app)
    .post("/auth/register")
    .send({ email, password: "password1", name });
  return { accessToken: res.body.accessToken as string, userId: res.body.user.id as string };
}

describe("POST /tasks", () => {
  it("creates a task owned by the authenticated user", async () => {
    const alice = await registerUser("alice@example.com", "Alice");

    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Write report", description: "Q3 summary" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: "Write report",
      description: "Q3 summary",
      status: "TODO",
      creatorId: alice.userId,
      assigneeId: alice.userId,
      completedAt: null,
    });
  });

  it("ignores a client-supplied creatorId/assigneeId", async () => {
    const alice = await registerUser("alice@example.com", "Alice");

    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Task", creatorId: "someone-else", assigneeId: "someone-else" });

    expect(res.status).toBe(201);
    expect(res.body.creatorId).toBe(alice.userId);
    expect(res.body.assigneeId).toBe(alice.userId);
  });

  it("rejects an empty title with 400 VALIDATION_ERROR", async () => {
    const alice = await registerUser("alice@example.com", "Alice");

    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "   " });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).post("/tasks").send({ title: "Task" });
    expect(res.status).toBe(401);
  });
});

describe("GET /tasks", () => {
  it("returns only the caller's own tasks", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const bob = await registerUser("bob@example.com", "Bob");

    await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Alice's task" });
    await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${bob.accessToken}`)
      .send({ title: "Bob's task" });

    const res = await request(app)
      .get("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("Alice's task");
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get("/tasks");
    expect(res.status).toBe(401);
  });
});

describe("GET /tasks/:id", () => {
  it("returns the task to its owner", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const created = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Task" });

    const res = await request(app)
      .get(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it("returns 404 when another user requests it (cannot be found by guessing the id)", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const bob = await registerUser("bob@example.com", "Bob");
    const created = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Alice's private task" });

    const res = await request(app)
      .get(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${bob.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("returns 404 for a nonexistent task id", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const res = await request(app)
      .get("/tasks/does-not-exist")
      .set("Authorization", `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /tasks/:id", () => {
  it("lets the owner update title, description, and status", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const created = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Task" });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Updated", status: "IN_PROGRESS" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Updated");
    expect(res.body.status).toBe("IN_PROGRESS");
  });

  it("completes a fresh TODO task directly via PATCH status=DONE and sets completedAt", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const created = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Task" });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ status: "DONE" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("DONE");
    expect(res.body.completedAt).not.toBeNull();
  });

  it("reopens a DONE task directly back to TODO and clears completedAt", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const created = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Task" });
    await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ status: "DONE" });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ status: "TODO" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("TODO");
    expect(res.body.completedAt).toBeNull();
  });

  it("clears completedAt when a DONE task is cancelled", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const created = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Task" });
    await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ status: "DONE" });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ status: "CANCELLED" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CANCELLED");
    expect(res.body.completedAt).toBeNull();
  });

  it("rejects a transition out of CANCELLED (terminal) with 409", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const created = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Task" });
    await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ status: "CANCELLED" });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ status: "TODO" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("returns 404 when another user tries to update it", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const bob = await registerUser("bob@example.com", "Bob");
    const created = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Alice's task" });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${bob.accessToken}`)
      .send({ title: "Hijacked" });

    expect(res.status).toBe(404);

    const stillAlices = await request(app)
      .get(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`);
    expect(stillAlices.body.title).toBe("Alice's task");
  });

  it("returns 404 for a nonexistent task id", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const res = await request(app)
      .patch("/tasks/does-not-exist")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "x" });
    expect(res.status).toBe(404);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).patch("/tasks/some-id").send({ title: "x" });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /tasks/:id", () => {
  it("lets the owner delete their task", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const created = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Task" });

    const res = await request(app)
      .delete(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(204);

    const getRes = await request(app)
      .get(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`);
    expect(getRes.status).toBe(404);
  });

  it("returns 404 when another user tries to delete it, and the task survives", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const bob = await registerUser("bob@example.com", "Bob");
    const created = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Alice's task" });

    const res = await request(app)
      .delete(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${bob.accessToken}`);
    expect(res.status).toBe(404);

    const getRes = await request(app)
      .get(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`);
    expect(getRes.status).toBe(200);
  });

  it("returns 404 for a nonexistent task id", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const res = await request(app)
      .delete("/tasks/does-not-exist")
      .set("Authorization", `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(404);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).delete("/tasks/some-id");
    expect(res.status).toBe(401);
  });
});

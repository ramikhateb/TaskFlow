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

describe("POST /tasks — extended attributes (M4)", () => {
  it("defaults priority to MEDIUM and leaves category/scheduledAt/deadline null when omitted", async () => {
    const alice = await registerUser("alice@example.com", "Alice");

    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Task" });

    expect(res.status).toBe(201);
    expect(res.body.priority).toBe("MEDIUM");
    expect(res.body.category).toBeNull();
    expect(res.body.scheduledAt).toBeNull();
    expect(res.body.deadline).toBeNull();
  });

  it.each(["LOW", "MEDIUM", "HIGH"])("accepts priority %s", async (priority) => {
    const alice = await registerUser("alice@example.com", "Alice");

    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Task", priority });

    expect(res.status).toBe(201);
    expect(res.body.priority).toBe(priority);
  });

  it("rejects an invalid priority value with 400 VALIDATION_ERROR", async () => {
    const alice = await registerUser("alice@example.com", "Alice");

    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Task", priority: "URGENT" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("persists category, scheduledAt, and deadline as ISO 8601 UTC strings", async () => {
    const alice = await registerUser("alice@example.com", "Alice");

    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({
        title: "Plan launch",
        category: "Work",
        scheduledAt: "2026-03-01T09:00:00.000Z",
        deadline: "2026-03-05T17:00:00.000Z",
      });

    expect(res.status).toBe(201);
    expect(res.body.category).toBe("Work");
    expect(res.body.scheduledAt).toBe("2026-03-01T09:00:00.000Z");
    expect(res.body.deadline).toBe("2026-03-05T17:00:00.000Z");
  });

  it("trims category and rejects one over the max length with 400", async () => {
    const alice = await registerUser("alice@example.com", "Alice");

    const trimmed = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Task", category: "  Work  " });
    expect(trimmed.body.category).toBe("Work");

    const tooLong = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Task", category: "x".repeat(101) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe("VALIDATION_ERROR");
  });

  it.each(["scheduledAt", "deadline"])(
    "rejects a malformed %s with 400 VALIDATION_ERROR",
    async (field) => {
      const alice = await registerUser("alice@example.com", "Alice");

      const res = await request(app)
        .post("/tasks")
        .set("Authorization", `Bearer ${alice.accessToken}`)
        .send({ title: "Task", [field]: "not-a-date" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    },
  );

  it("keeps scheduledAt and deadline independent", async () => {
    const alice = await registerUser("alice@example.com", "Alice");

    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Task", scheduledAt: "2026-03-01T09:00:00.000Z" });

    expect(res.body.scheduledAt).toBe("2026-03-01T09:00:00.000Z");
    expect(res.body.deadline).toBeNull();
  });

  it("accepts scheduledAt equal to deadline (EC-13)", async () => {
    const alice = await registerUser("alice@example.com", "Alice");

    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({
        title: "Task",
        scheduledAt: "2026-03-01T09:00:00.000Z",
        deadline: "2026-03-01T09:00:00.000Z",
      });

    expect(res.status).toBe(201);
    expect(res.body.scheduledAt).toBe(res.body.deadline);
  });

  it("rejects scheduledAt after deadline with 409 CONFLICT (EC-13)", async () => {
    const alice = await registerUser("alice@example.com", "Alice");

    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({
        title: "Task",
        scheduledAt: "2026-03-05T00:00:00.000Z",
        deadline: "2026-03-01T00:00:00.000Z",
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
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

describe("GET /tasks — search and filters (M6, FR-16)", () => {
  async function seed(token: string) {
    const create = (body: Record<string, unknown>) =>
      request(app).post("/tasks").set("Authorization", `Bearer ${token}`).send(body);

    const report = await create({
      title: "Write quarterly report",
      priority: "HIGH",
      category: "Work",
    });
    await create({ title: "Buy groceries", priority: "LOW", category: "Home" });
    const descMatch = await create({
      title: "Untitled",
      description: "Includes a report reference",
      priority: "MEDIUM",
      category: "Work",
    });
    const done = await create({ title: "Old report archive", category: "Work" });
    await request(app)
      .patch(`/tasks/${done.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "DONE" });

    return { report: report.body, descMatch: descMatch.body, done: done.body };
  }

  it("searches by title (case-insensitive, trimmed)", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const { report } = await seed(alice.accessToken);

    const res = await request(app)
      .get("/tasks?q=  REPORT  ")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((t: { id: string }) => t.id);
    expect(ids).toContain(report.id);
  });

  it("searches by description", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const { descMatch } = await seed(alice.accessToken);

    const res = await request(app)
      .get("/tasks?q=report")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.body.data.map((t: { id: string }) => t.id)).toContain(descMatch.id);
  });

  it("treats an empty/whitespace-only q as no search", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    await seed(alice.accessToken);

    const res = await request(app)
      .get("/tasks?q=%20%20")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(4);
  });

  it("filters by status", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const { done } = await seed(alice.accessToken);

    const res = await request(app)
      .get("/tasks?status=DONE")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.body.data.map((t: { id: string }) => t.id)).toEqual([done.id]);
  });

  it("rejects an invalid status with 400 VALIDATION_ERROR", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const res = await request(app)
      .get("/tasks?status=NOT_A_STATUS")
      .set("Authorization", `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("filters by priority", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const { report } = await seed(alice.accessToken);

    const res = await request(app)
      .get("/tasks?priority=HIGH")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.body.data.map((t: { id: string }) => t.id)).toEqual([report.id]);
  });

  it("rejects an invalid priority with 400 VALIDATION_ERROR", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const res = await request(app)
      .get("/tasks?priority=URGENT")
      .set("Authorization", `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("filters by category", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    await seed(alice.accessToken);

    const res = await request(app)
      .get("/tasks?category=Work")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.body.data.every((t: { category: string }) => t.category === "Work")).toBe(true);
    expect(res.body.data.length).toBe(3);
  });

  it("combines status + category with AND semantics", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const { done } = await seed(alice.accessToken);

    const res = await request(app)
      .get("/tasks?status=DONE&category=Work")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.body.data.map((t: { id: string }) => t.id)).toEqual([done.id]);
  });

  it("combines status + priority + category + q with AND semantics", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const { report } = await seed(alice.accessToken);

    const res = await request(app)
      .get("/tasks?status=TODO&priority=HIGH&category=Work&q=report")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.body.data.map((t: { id: string }) => t.id)).toEqual([report.id]);
  });

  it("combines q + priority together", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const { report } = await seed(alice.accessToken);

    const res = await request(app)
      .get("/tasks?q=report&priority=HIGH")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.body.data.map((t: { id: string }) => t.id)).toEqual([report.id]);
  });

  it("returns an empty array when no task matches", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    await seed(alice.accessToken);

    const res = await request(app)
      .get("/tasks?q=nonexistent-term-xyz")
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("never returns another user's tasks through search, category, status, priority, or combinations", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const bob = await registerUser("bob@example.com", "Bob");
    const { report } = await seed(bob.accessToken); // all of Bob's data

    const searches = [
      "/tasks?q=report",
      "/tasks?category=Work",
      "/tasks?status=TODO",
      "/tasks?priority=HIGH",
      "/tasks?status=TODO&priority=HIGH&category=Work&q=report",
    ];

    for (const path of searches) {
      const res = await request(app).get(path).set("Authorization", `Bearer ${alice.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.data.map((t: { id: string }) => t.id)).not.toContain(report.id);
    }
  });

  it("clearing one filter preserves the effect of the others", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const create = (body: Record<string, unknown>) =>
      request(app).post("/tasks").set("Authorization", `Bearer ${alice.accessToken}`).send(body);

    const reportTask = await create({ title: "Write report", category: "Work" });
    const otherWorkTask = await create({ title: "Unrelated work item", category: "Work" });
    await create({ title: "Write report", category: "Home" }); // wrong category
    await create({ title: "Unrelated home item", category: "Home" }); // matches neither

    // status=TODO & category=Work & q=report -> only reportTask.
    const narrow = await request(app)
      .get("/tasks?status=TODO&category=Work&q=report")
      .set("Authorization", `Bearer ${alice.accessToken}`);
    expect(narrow.body.data.map((t: { id: string }) => t.id)).toEqual([reportTask.body.id]);

    // Drop q — status=TODO & category=Work now also includes otherWorkTask.
    const widened = await request(app)
      .get("/tasks?status=TODO&category=Work")
      .set("Authorization", `Bearer ${alice.accessToken}`);
    const widenedIds = widened.body.data.map((t: { id: string }) => t.id);
    expect(widenedIds).toContain(reportTask.body.id);
    expect(widenedIds).toContain(otherWorkTask.body.id);
  });

  it("clearing all filters restores the full unfiltered list", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    await seed(alice.accessToken);

    const filtered = await request(app)
      .get("/tasks?status=DONE")
      .set("Authorization", `Bearer ${alice.accessToken}`);
    expect(filtered.body.data).toHaveLength(1);

    const all = await request(app)
      .get("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`);
    expect(all.body.data).toHaveLength(4);
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

describe("PATCH /tasks/:id — extended attributes (M4)", () => {
  it("updates priority, category, scheduledAt, and deadline", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const created = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Task" });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({
        priority: "HIGH",
        category: "Personal",
        scheduledAt: "2026-04-01T08:00:00.000Z",
        deadline: "2026-04-10T23:59:00.000Z",
      });

    expect(res.status).toBe(200);
    expect(res.body.priority).toBe("HIGH");
    expect(res.body.category).toBe("Personal");
    expect(res.body.scheduledAt).toBe("2026-04-01T08:00:00.000Z");
    expect(res.body.deadline).toBe("2026-04-10T23:59:00.000Z");
  });

  it("clears category, scheduledAt, and deadline when explicitly set to null", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const created = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({
        title: "Task",
        category: "Work",
        scheduledAt: "2026-04-01T08:00:00.000Z",
        deadline: "2026-04-10T23:59:00.000Z",
      });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ category: null, scheduledAt: null, deadline: null });

    expect(res.status).toBe(200);
    expect(res.body.category).toBeNull();
    expect(res.body.scheduledAt).toBeNull();
    expect(res.body.deadline).toBeNull();
  });

  it("leaves extended attributes untouched when omitted from the PATCH body", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const created = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Task", category: "Work", priority: "HIGH" });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Renamed" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Renamed");
    expect(res.body.category).toBe("Work");
    expect(res.body.priority).toBe("HIGH");
  });

  it("rejects an invalid priority value with 400 VALIDATION_ERROR", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const created = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Task" });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ priority: "URGENT" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a malformed deadline with 400 VALIDATION_ERROR", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const created = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Task" });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ deadline: "not-a-date" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a PATCH to scheduledAt that conflicts with the existing deadline (EC-13)", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const created = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Task", deadline: "2026-04-01T00:00:00.000Z" });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ scheduledAt: "2026-04-05T00:00:00.000Z" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("rejects a PATCH to deadline that conflicts with the existing scheduledAt (EC-13)", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const created = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Task", scheduledAt: "2026-04-05T00:00:00.000Z" });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ deadline: "2026-04-01T00:00:00.000Z" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("returns 404 when another user tries to change extended attributes", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const bob = await registerUser("bob@example.com", "Bob");
    const created = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Alice's task" });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${bob.accessToken}`)
      .send({ priority: "HIGH" });

    expect(res.status).toBe(404);
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

describe("GET /tasks/today", () => {
  it("returns scheduled-today, due-today, and overdue tasks scoped to the caller", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const bob = await registerUser("bob@example.com", "Bob");
    const now = Date.now();
    const from = new Date(now - 60 * 60 * 1000).toISOString();
    const to = new Date(now + 60 * 60 * 1000).toISOString();

    const scheduled = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Scheduled", scheduledAt: new Date(now).toISOString() });
    const due = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Due", deadline: new Date(now + 30 * 60 * 1000).toISOString() });
    const overdue = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Overdue", deadline: new Date(now - 24 * 60 * 60 * 1000).toISOString() });
    await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${bob.accessToken}`)
      .send({ title: "Not mine", scheduledAt: new Date(now).toISOString() });

    const res = await request(app)
      .get(`/tasks/today?from=${from}&to=${to}`)
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.scheduledToday.map((t: { id: string }) => t.id)).toEqual([scheduled.body.id]);
    expect(res.body.dueToday.map((t: { id: string }) => t.id)).toEqual([due.body.id]);
    expect(res.body.overdue.map((t: { id: string }) => t.id)).toEqual([overdue.body.id]);
  });

  it("does not classify a DONE task as overdue, and excludes CANCELLED entirely", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const now = Date.now();
    const from = new Date(now - 60 * 60 * 1000).toISOString();
    const to = new Date(now + 60 * 60 * 1000).toISOString();
    const pastDeadline = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    const done = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Done", deadline: pastDeadline });
    await request(app)
      .patch(`/tasks/${done.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ status: "DONE" });

    const cancelled = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Cancelled", deadline: pastDeadline });
    await request(app)
      .patch(`/tasks/${cancelled.body.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ status: "CANCELLED" });

    const res = await request(app)
      .get(`/tasks/today?from=${from}&to=${to}`)
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.overdue).toEqual([]);
    // The DONE task is still deadline-relevant (deadline is in the past, before `to`)
    // but must not appear as overdue; it's simply not returned in any bucket here
    // since its deadline isn't within [from, to).
    const allIds = [...res.body.overdue, ...res.body.scheduledToday, ...res.body.dueToday].map(
      (t: { id: string }) => t.id,
    );
    expect(allIds).not.toContain(cancelled.body.id);
  });

  it("handles a task both scheduled and due today as a single item, not duplicated", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const now = Date.now();
    const from = new Date(now - 60 * 60 * 1000).toISOString();
    const to = new Date(now + 60 * 60 * 1000).toISOString();

    const created = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({
        title: "Both",
        scheduledAt: new Date(now).toISOString(),
        deadline: new Date(now + 30 * 60 * 1000).toISOString(),
      });

    const res = await request(app)
      .get(`/tasks/today?from=${from}&to=${to}`)
      .set("Authorization", `Bearer ${alice.accessToken}`);

    const allIds = [...res.body.overdue, ...res.body.scheduledToday, ...res.body.dueToday].map(
      (t: { id: string }) => t.id,
    );
    expect(allIds.filter((id: string) => id === created.body.id)).toHaveLength(1);
    expect(res.body.scheduledToday.map((t: { id: string }) => t.id)).toContain(created.body.id);
  });

  it("rejects a missing from/to with 400 VALIDATION_ERROR", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const res = await request(app)
      .get("/tasks/today")
      .set("Authorization", `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects to <= from with 400 VALIDATION_ERROR", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const now = new Date().toISOString();
    const res = await request(app)
      .get(`/tasks/today?from=${now}&to=${now}`)
      .set("Authorization", `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a malformed date parameter with 400 VALIDATION_ERROR", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const res = await request(app)
      .get("/tasks/today?from=not-a-date&to=also-not-a-date")
      .set("Authorization", `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get(
      "/tasks/today?from=2026-01-01T00:00:00.000Z&to=2026-01-02T00:00:00.000Z",
    );
    expect(res.status).toBe(401);
  });

  it("honors client-supplied local-day boundaries even when the UTC calendar date differs (EC-8)", async () => {
    // A UTC-5 user's "June 15" local day runs 2026-06-15T05:00:00Z through
    // 2026-06-16T05:00:00Z. A task at 2026-06-16T02:00:00Z is *UTC* June 16,
    // but 21:00 local on June 15 — it must count as "today" for this user.
    // A task one hour past the local boundary (2026-06-16T06:00:00Z) has the
    // same UTC calendar date but belongs to the *next* local day and must
    // NOT be included. If the server naively compared UTC date strings
    // instead of the supplied instants, both would incorrectly get the same
    // (wrong) treatment.
    const alice = await registerUser("alice@example.com", "Alice");
    const from = "2026-06-15T05:00:00.000Z";
    const to = "2026-06-16T05:00:00.000Z";

    const withinLocalDay = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Late local evening", scheduledAt: "2026-06-16T02:00:00.000Z" });
    const nextLocalDay = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Next local day", scheduledAt: "2026-06-16T06:00:00.000Z" });

    const res = await request(app)
      .get(`/tasks/today?from=${from}&to=${to}`)
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.status).toBe(200);
    const scheduledIds = res.body.scheduledToday.map((t: { id: string }) => t.id);
    expect(scheduledIds).toContain(withinLocalDay.body.id);
    expect(scheduledIds).not.toContain(nextLocalDay.body.id);
  });
});

describe("GET /tasks/schedule", () => {
  it("returns only the caller's tasks scheduled within the range, ordered chronologically", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const bob = await registerUser("bob@example.com", "Bob");
    const now = Date.now();
    const from = new Date(now).toISOString();
    const to = new Date(now + 24 * 60 * 60 * 1000).toISOString();

    const later = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Later", scheduledAt: new Date(now + 12 * 60 * 60 * 1000).toISOString() });
    const earlier = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ title: "Earlier", scheduledAt: new Date(now + 1000).toISOString() });
    await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({
        title: "Outside range",
        scheduledAt: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(),
      });
    await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${bob.accessToken}`)
      .send({ title: "Not mine", scheduledAt: new Date(now + 1000).toISOString() });

    const res = await request(app)
      .get(`/tasks/schedule?from=${from}&to=${to}`)
      .set("Authorization", `Bearer ${alice.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { id: string }) => t.id)).toEqual([
      earlier.body.id,
      later.body.id,
    ]);
  });

  it("rejects an invalid range (to <= from) with 400 VALIDATION_ERROR", async () => {
    const alice = await registerUser("alice@example.com", "Alice");
    const now = new Date().toISOString();
    const res = await request(app)
      .get(`/tasks/schedule?from=${now}&to=${now}`)
      .set("Authorization", `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get(
      "/tasks/schedule?from=2026-01-01T00:00:00.000Z&to=2026-01-02T00:00:00.000Z",
    );
    expect(res.status).toBe(401);
  });
});

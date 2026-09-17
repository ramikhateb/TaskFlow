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
  // Full cleanup in FK-dependency order — see the identical comment in
  // auth.integration.test.ts for why every file does all four, not just the
  // tables its own tests directly create.
  await prisma.taskAssignment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function registerUser(email: string, name: string) {
  const username = email
    .split("@")[0]!
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, "");
  const res = await request(app)
    .post("/auth/register")
    .send({ email, password: "password1", name, username });
  return {
    accessToken: res.body.accessToken as string,
    userId: res.body.user.id as string,
    username: res.body.user.username as string,
    name: res.body.user.name as string,
  };
}

async function createTask(token: string, body: Record<string, unknown> = { title: "Task" }) {
  const res = await request(app).post("/tasks").set("Authorization", `Bearer ${token}`).send(body);
  return res.body;
}

describe("POST /tasks/:taskId/assignments", () => {
  it("creates a PENDING assignment with correct fromUser/toUser/taskId", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);

    const res = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId, message: "please take this" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      taskId: task.id,
      status: "PENDING",
      message: "please take this",
      fromUser: { id: rami.userId, name: "Rami", username: rami.username },
      toUser: { id: daniel.userId, name: "Daniel", username: daniel.username },
      respondedAt: null,
    });
  });

  it("normalizes a blank/whitespace message to null", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);

    const res = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId, message: "   " });

    expect(res.status).toBe(201);
    expect(res.body.message).toBeNull();
  });

  it("omitting the message is allowed and stored as null", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);

    const res = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });

    expect(res.status).toBe(201);
    expect(res.body.message).toBeNull();
  });

  it("never exposes email on fromUser/toUser", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);

    const res = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });

    expect(res.body.fromUser).not.toHaveProperty("email");
    expect(res.body.toUser).not.toHaveProperty("email");
    expect(Object.keys(res.body.fromUser)).toEqual(["id", "name", "username"]);
    expect(Object.keys(res.body.toUser)).toEqual(["id", "name", "username"]);
  });

  it("does NOT change Task.assigneeId after sending", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);

    await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });

    const reloaded = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(reloaded.assigneeId).toBe(rami.userId);
    expect(reloaded.creatorId).toBe(rami.userId);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);

    const res = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .send({ toUserId: daniel.userId });

    expect(res.status).toBe(401);
  });

  it("returns 404 when the caller is not the task's current assignee", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const sarah = await registerUser("sarah@example.com", "Sarah");
    const task = await createTask(rami.accessToken);

    const res = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${sarah.accessToken}`)
      .send({ toUserId: daniel.userId });

    expect(res.status).toBe(404);
  });

  it("returns 404 for a nonexistent task id", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");

    const res = await request(app)
      .post("/tasks/does-not-exist/assignments")
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });

    expect(res.status).toBe(404);
  });

  it("returns 404 when the recipient does not exist", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const task = await createTask(rami.accessToken);

    const res = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: "does-not-exist" });

    expect(res.status).toBe(404);
  });

  it("rejects self-assignment with 400 VALIDATION_ERROR", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const task = await createTask(rami.accessToken);

    const res = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: rami.userId });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it.each(["TODO", "IN_PROGRESS"])("allows assigning a %s task", async (status) => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    if (status !== "TODO") {
      await request(app)
        .patch(`/tasks/${task.id}`)
        .set("Authorization", `Bearer ${rami.accessToken}`)
        .send({ status });
    }

    const res = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });

    expect(res.status).toBe(201);
  });

  it.each(["DONE", "CANCELLED"])(
    "rejects assigning a %s task with 409 CONFLICT",
    async (status) => {
      const rami = await registerUser("rami@example.com", "Rami");
      const daniel = await registerUser("daniel@example.com", "Daniel");
      const task = await createTask(rami.accessToken);
      await request(app)
        .patch(`/tasks/${task.id}`)
        .set("Authorization", `Bearer ${rami.accessToken}`)
        .send({ status });

      const res = await request(app)
        .post(`/tasks/${task.id}/assignments`)
        .set("Authorization", `Bearer ${rami.accessToken}`)
        .send({ toUserId: daniel.userId });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
    },
  );

  it("rejects a second pending assignment for the same task with 409", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });

    const res = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("rejects a second pending assignment to a different recipient with 409", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const sarah = await registerUser("sarah@example.com", "Sarah");
    const task = await createTask(rami.accessToken);
    await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });

    const res = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: sarah.userId });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("under real concurrent requests, exactly one succeeds and the rest 409", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);

    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post(`/tasks/${task.id}/assignments`)
          .set("Authorization", `Bearer ${rami.accessToken}`)
          .send({ toUserId: daniel.userId }),
      ),
    );

    const succeeded = attempts.filter((r) => r.status === 201);
    const conflicted = attempts.filter((r) => r.status === 409);
    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(4);

    const pendingRows = await prisma.taskAssignment.findMany({
      where: { taskId: task.id, status: "PENDING" },
    });
    expect(pendingRows).toHaveLength(1);
  });
});

describe("GET /tasks/:id — pendingAssignment", () => {
  it("is null when there is no pending assignment", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const task = await createTask(rami.accessToken);

    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.body.pendingAssignment).toBeNull();
  });

  it("reflects the current pending assignment", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });

    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.body.pendingAssignment).toMatchObject({ id: created.body.id, status: "PENDING" });
    expect(res.body.assigneeId).toBe(rami.userId);
  });

  it("returns to null after the assignment is cancelled", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });
    await request(app)
      .post(`/tasks/${task.id}/assignments/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.body.pendingAssignment).toBeNull();
  });
});

describe("POST /tasks/:taskId/assignments/:assignmentId/cancel", () => {
  it("cancels the sender's own PENDING assignment", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });

    const res = await request(app)
      .post(`/tasks/${task.id}/assignments/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CANCELLED");
    expect(res.body.respondedAt).not.toBeNull();
  });

  it("does NOT change Task.assigneeId on cancel", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });

    await request(app)
      .post(`/tasks/${task.id}/assignments/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    const reloaded = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(reloaded.assigneeId).toBe(rami.userId);
  });

  it("preserves the cancelled row rather than deleting it", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });

    await request(app)
      .post(`/tasks/${task.id}/assignments/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    const row = await prisma.taskAssignment.findUnique({ where: { id: created.body.id } });
    expect(row).not.toBeNull();
    expect(row?.status).toBe("CANCELLED");
  });

  it("rejects cancellation by a non-sender (e.g. the recipient) with 404", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });

    const res = await request(app)
      .post(`/tasks/${task.id}/assignments/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.status).toBe(404);

    const row = await prisma.taskAssignment.findUnique({ where: { id: created.body.id } });
    expect(row?.status).toBe("PENDING");
  });

  it("rejects a mismatched task/assignment pairing with 404", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const taskA = await createTask(rami.accessToken, { title: "A" });
    const taskB = await createTask(rami.accessToken, { title: "B" });
    const created = await request(app)
      .post(`/tasks/${taskA.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });

    const res = await request(app)
      .post(`/tasks/${taskB.id}/assignments/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("returns 404 for a nonexistent assignment id", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const task = await createTask(rami.accessToken);

    const res = await request(app)
      .post(`/tasks/${task.id}/assignments/does-not-exist/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("rejects cancelling an already-CANCELLED assignment with 409", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });
    await request(app)
      .post(`/tasks/${task.id}/assignments/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    const res = await request(app)
      .post(`/tasks/${task.id}/assignments/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("rejects cancelling an ACCEPTED assignment with 409 (M9 state, not reachable via M8 API)", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });
    await prisma.taskAssignment.update({
      where: { id: created.body.id },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });

    const res = await request(app)
      .post(`/tasks/${task.id}/assignments/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.status).toBe(409);
  });

  it("rejects cancelling a DECLINED assignment with 409 (M9 state, not reachable via M8 API)", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });
    await prisma.taskAssignment.update({
      where: { id: created.body.id },
      data: { status: "DECLINED", respondedAt: new Date() },
    });

    const res = await request(app)
      .post(`/tasks/${task.id}/assignments/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.status).toBe(409);
  });

  it("rejects an unauthenticated cancel request with 401", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });

    const res = await request(app).post(`/tasks/${task.id}/assignments/${created.body.id}/cancel`);

    expect(res.status).toBe(401);
  });
});

describe("Assignment history", () => {
  it("allows a new PENDING assignment after the old one is CANCELLED, preserving the old row", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const sarah = await registerUser("sarah@example.com", "Sarah");
    const task = await createTask(rami.accessToken);

    const first = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });
    await request(app)
      .post(`/tasks/${task.id}/assignments/${first.body.id}/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    const second = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: sarah.userId });

    expect(second.status).toBe(201);
    expect(second.body.status).toBe("PENDING");

    const allRows = await prisma.taskAssignment.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: "asc" },
    });
    expect(allRows).toHaveLength(2);
    expect(allRows[0]?.id).toBe(first.body.id);
    expect(allRows[0]?.status).toBe("CANCELLED");
    expect(allRows[1]?.id).toBe(second.body.id);
    expect(allRows[1]?.status).toBe("PENDING");
  });
});

// M8 follow-up (FR-13/EC-5): while a task has a PENDING assignment, the
// sender still owns it — read access and Tasks/Today/Schedule visibility
// are untouched — but every mutation is frozen until the assignment is
// resolved (cancelled, here — accept/decline are M9).
describe("Pending assignment freezes task mutations (FR-13/EC-5)", () => {
  async function createPendingAssignment(
    rami: { accessToken: string },
    daniel: { userId: string },
  ) {
    const task = await createTask(rami.accessToken);
    const created = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });
    return { task, assignment: created.body };
  }

  it("blocks a field edit (PATCH) while pending", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const { task } = await createPendingAssignment(rami, daniel);

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ title: "Edited while pending" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.title).toBe(task.title);
  });

  it("blocks a status change / completion while pending", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const { task } = await createPendingAssignment(rami, daniel);

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ status: "DONE" });

    expect(res.status).toBe(409);
    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.status).toBe("TODO");
  });

  it("blocks cancelling the task itself (status -> CANCELLED) while pending", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const { task } = await createPendingAssignment(rami, daniel);

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ status: "CANCELLED" });

    expect(res.status).toBe(409);
  });

  it("blocks DELETE while pending", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const { task } = await createPendingAssignment(rami, daniel);

    const res = await request(app)
      .delete(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.status).toBe(409);
    await expect(prisma.task.findUniqueOrThrow({ where: { id: task.id } })).resolves.toBeDefined();
  });

  it("read access (GET /tasks/:id) still works while pending, and shows the pending assignment", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const { task, assignment } = await createPendingAssignment(rami, daniel);

    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pendingAssignment).toMatchObject({ id: assignment.id, status: "PENDING" });
    expect(res.body.assigneeId).toBe(rami.userId);
  });

  it("the task remains visible in GET /tasks (list) while pending", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const { task } = await createPendingAssignment(rami, daniel);

    const res = await request(app).get("/tasks").set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.body.data.map((t: { id: string }) => t.id)).toContain(task.id);
  });

  it("the task remains visible in GET /tasks/today while pending, when otherwise eligible", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const now = Date.now();
    const task = await createTask(rami.accessToken, {
      title: "Due today",
      deadline: new Date(now + 30 * 60 * 1000).toISOString(),
    });
    await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });
    const from = new Date(now - 60 * 60 * 1000).toISOString();
    const to = new Date(now + 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .get(`/tasks/today?from=${from}&to=${to}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.body.dueToday.map((t: { id: string }) => t.id)).toContain(task.id);
  });

  it("the task remains visible in GET /tasks/schedule while pending, when otherwise eligible", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const now = Date.now();
    const task = await createTask(rami.accessToken, {
      title: "Scheduled",
      scheduledAt: new Date(now).toISOString(),
    });
    await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });
    const from = new Date(now - 60 * 60 * 1000).toISOString();
    const to = new Date(now + 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .get(`/tasks/schedule?from=${from}&to=${to}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.body.data.map((t: { id: string }) => t.id)).toContain(task.id);
  });

  it("cancelling the assignment restores editing", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const { task, assignment } = await createPendingAssignment(rami, daniel);
    await request(app)
      .post(`/tasks/${task.id}/assignments/${assignment.id}/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ title: "Edited after cancel" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Edited after cancel");
    expect(res.body.assigneeId).toBe(rami.userId);
  });

  it("cancelling restores completion/status changes", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const { task, assignment } = await createPendingAssignment(rami, daniel);
    await request(app)
      .post(`/tasks/${task.id}/assignments/${assignment.id}/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ status: "DONE" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("DONE");
  });

  it("cancelling restores deletion (and cascades the now-history assignment row)", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const { task, assignment } = await createPendingAssignment(rami, daniel);
    await request(app)
      .post(`/tasks/${task.id}/assignments/${assignment.id}/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    const res = await request(app)
      .delete(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.status).toBe(204);
    await expect(prisma.task.findUnique({ where: { id: task.id } })).resolves.toBeNull();
    // The CANCELLED assignment row is history that no longer has anywhere
    // to live once its task is gone — cascaded, not orphaned or blocking.
    await expect(
      prisma.taskAssignment.findUnique({ where: { id: assignment.id } }),
    ).resolves.toBeNull();
  });

  it("assigneeId never changes across create, blocked attempts, cancel, and post-cancel mutation", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const { task, assignment } = await createPendingAssignment(rami, daniel);
    await expect(prisma.task.findUniqueOrThrow({ where: { id: task.id } })).resolves.toMatchObject({
      assigneeId: rami.userId,
    });

    await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ title: "Blocked attempt" });
    await expect(prisma.task.findUniqueOrThrow({ where: { id: task.id } })).resolves.toMatchObject({
      assigneeId: rami.userId,
    });

    await request(app)
      .post(`/tasks/${task.id}/assignments/${assignment.id}/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);
    await expect(prisma.task.findUniqueOrThrow({ where: { id: task.id } })).resolves.toMatchObject({
      assigneeId: rami.userId,
    });

    await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ title: "Allowed after cancel" });
    await expect(prisma.task.findUniqueOrThrow({ where: { id: task.id } })).resolves.toMatchObject({
      assigneeId: rami.userId,
    });
  });

  it("concurrency: every simultaneous PATCH against an already-PENDING task is rejected", async () => {
    // Deterministic (unlike create-vs-patch below): the assignment is fully
    // committed before any of these fire, so there is no ambiguity about
    // ordering — every one of them must see it and be rejected. This proves
    // the block isn't a first-request-wins TOCTOU check, but a real
    // per-statement guard (taskRepository.updateIfNotPending's atomic
    // conditional UPDATE) that every concurrent attempt hits independently.
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const { task } = await createPendingAssignment(rami, daniel);

    const attempts = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request(app)
          .patch(`/tasks/${task.id}`)
          .set("Authorization", `Bearer ${rami.accessToken}`)
          .send({ title: `Attempt ${i}` }),
      ),
    );

    expect(attempts.every((r) => r.status === 409)).toBe(true);
    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.title).toBe(task.title);
  });

  it("concurrency: a task PATCH racing an assignment create never leaves an inconsistent result", async () => {
    // Unlike the test above, this interleaving's *winner* is genuinely
    // non-deterministic (see the M8 follow-up report's concurrency
    // analysis for why a sub-statement race window is only closable with
    // explicit row locking, not attempted here). What must hold regardless
    // of who wins: assigneeId never moves, exactly one assignment row
    // exists, and the task's stored title matches whichever outcome the
    // PATCH actually got.
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);

    const [createRes, patchRes] = await Promise.all([
      request(app)
        .post(`/tasks/${task.id}/assignments`)
        .set("Authorization", `Bearer ${rami.accessToken}`)
        .send({ toUserId: daniel.userId }),
      request(app)
        .patch(`/tasks/${task.id}`)
        .set("Authorization", `Bearer ${rami.accessToken}`)
        .send({ title: "Racing edit" }),
    ]);

    expect(createRes.status).toBe(201);
    expect([200, 409]).toContain(patchRes.status);

    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.assigneeId).toBe(rami.userId);
    expect(stored.title).toBe(patchRes.status === 200 ? "Racing edit" : task.title);

    const pendingRows = await prisma.taskAssignment.findMany({
      where: { taskId: task.id, status: "PENDING" },
    });
    expect(pendingRows).toHaveLength(1);
  });
});

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

async function sendAssignment(
  senderToken: string,
  taskId: string,
  toUserId: string,
  message?: string,
) {
  const res = await request(app)
    .post(`/tasks/${taskId}/assignments`)
    .set("Authorization", `Bearer ${senderToken}`)
    .send(message === undefined ? { toUserId } : { toUserId, message });
  return res.body;
}

describe("GET /assignments/inbox", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get("/assignments/inbox");
    expect(res.status).toBe(401);
  });

  it("returns the recipient's PENDING assignments", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken, { title: "Prepare presentation" });
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId, "please help");

    const res = await request(app)
      .get("/assignments/inbox")
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: created.id,
      status: "PENDING",
      message: "please help",
      fromUser: { id: rami.userId, name: "Rami", username: rami.username },
      task: { id: task.id, title: "Prepare presentation" },
    });
  });

  it("does not show the sender their own sent assignment as incoming", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .get("/assignments/inbox")
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.body.data).toEqual([]);
  });

  it("does not show an unrelated third user's incoming assignment", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const carol = await registerUser("carol@example.com", "Carol");
    const task = await createTask(rami.accessToken);
    await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .get("/assignments/inbox")
      .set("Authorization", `Bearer ${carol.accessToken}`);

    expect(res.body.data).toEqual([]);
  });

  it("ignores any userId query parameter — identity comes only from the JWT", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .get(`/assignments/inbox?userId=${rami.userId}`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    // Still Daniel's own inbox (1 item), not Rami's (0 incoming) — the
    // query param is simply never read.
    expect(res.body.data).toHaveLength(1);
  });

  it("excludes a CANCELLED assignment", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/tasks/${task.id}/assignments/${created.id}/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    const res = await request(app)
      .get("/assignments/inbox")
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.body.data).toEqual([]);
  });

  it("excludes a DECLINED assignment", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/decline`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    const res = await request(app)
      .get("/assignments/inbox")
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.body.data).toEqual([]);
  });

  it("excludes an ACCEPTED assignment", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    const res = await request(app)
      .get("/assignments/inbox")
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.body.data).toEqual([]);
  });

  it("orders results newest-first", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const taskA = await createTask(rami.accessToken, { title: "First" });
    const first = await sendAssignment(rami.accessToken, taskA.id, daniel.userId);
    const taskB = await createTask(rami.accessToken, { title: "Second" });
    const second = await sendAssignment(rami.accessToken, taskB.id, daniel.userId);

    const res = await request(app)
      .get("/assignments/inbox")
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.body.data.map((row: { id: string }) => row.id)).toEqual([second.id, first.id]);
  });

  it("returns sender as a PublicUser and never exposes email or passwordHash", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .get("/assignments/inbox")
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(Object.keys(res.body.data[0].fromUser)).toEqual(["id", "name", "username"]);
    expect(res.body.data[0].fromUser).not.toHaveProperty("email");
    expect(res.body.data[0].fromUser).not.toHaveProperty("passwordHash");
  });

  it("returns the relevant task fields the recipient needs to decide", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken, {
      title: "Prepare presentation",
      description: "Slides for Monday",
      priority: "HIGH",
      category: "Work",
      deadline: "2026-09-27T17:00:00.000Z",
    });
    await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .get("/assignments/inbox")
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.body.data[0].task).toMatchObject({
      id: task.id,
      title: "Prepare presentation",
      description: "Slides for Monday",
      priority: "HIGH",
      category: "Work",
      deadline: "2026-09-27T17:00:00.000Z",
      status: "TODO",
    });
  });

  it("never presents the sender's scheduledAt as part of the request", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken, {
      title: "Task",
      scheduledAt: "2026-09-25T10:00:00.000Z",
    });
    await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .get("/assignments/inbox")
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.body.data[0].task).not.toHaveProperty("scheduledAt");
    expect(Object.keys(res.body.data[0].task)).toEqual([
      "id",
      "title",
      "description",
      "priority",
      "category",
      "deadline",
      "status",
    ]);
  });
});

describe("POST /assignments/:assignmentId/decline", () => {
  it("lets the recipient decline a PENDING assignment", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .post(`/assignments/${created.id}/decline`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("DECLINED");
    expect(res.body.respondedAt).not.toBeNull();
  });

  it("leaves assigneeId and creatorId unchanged", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    await request(app)
      .post(`/assignments/${created.id}/decline`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.assigneeId).toBe(rami.userId);
    expect(stored.creatorId).toBe(rami.userId);
  });

  it("restores the sender's task mutation control after decline", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    // Frozen while pending (M8 behavior, still true).
    const blocked = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ title: "Blocked" });
    expect(blocked.status).toBe(409);

    await request(app)
      .post(`/assignments/${created.id}/decline`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ title: "Editable again" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Editable again");
  });

  it("rejects decline from the sender (not the recipient) with 404", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .post(`/assignments/${created.id}/decline`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("rejects decline from an unrelated third user with 404", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const carol = await registerUser("carol@example.com", "Carol");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .post(`/assignments/${created.id}/decline`)
      .set("Authorization", `Bearer ${carol.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("rejects declining a nonexistent assignment with 404", async () => {
    const daniel = await registerUser("daniel@example.com", "Daniel");

    const res = await request(app)
      .post("/assignments/does-not-exist/decline")
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("rejects declining an already-CANCELLED assignment with 409", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/tasks/${task.id}/assignments/${created.id}/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    const res = await request(app)
      .post(`/assignments/${created.id}/decline`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.status).toBe(409);
  });

  it("rejects declining an already-ACCEPTED assignment with 409", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    const res = await request(app)
      .post(`/assignments/${created.id}/decline`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.status).toBe(409);
  });

  it("rejects declining an already-DECLINED assignment with 409", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/decline`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    const res = await request(app)
      .post(`/assignments/${created.id}/decline`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.status).toBe(409);
  });
});

describe("POST /assignments/:assignmentId/accept", () => {
  it("lets the recipient accept a PENDING assignment", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ACCEPTED");
    expect(res.body.respondedAt).not.toBeNull();
  });

  it("transfers assigneeId to the recipient and leaves creatorId unchanged", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.assigneeId).toBe(daniel.userId);
    expect(stored.creatorId).toBe(rami.userId);
  });

  it("rejects accept from the sender (not the recipient) with 404", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ scheduledAt: null });

    expect(res.status).toBe(404);
  });

  it("rejects accept from an unrelated third user with 404", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const carol = await registerUser("carol@example.com", "Carol");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${carol.accessToken}`)
      .send({ scheduledAt: null });

    expect(res.status).toBe(404);
  });

  it("rejects accepting a nonexistent assignment with 404", async () => {
    const daniel = await registerUser("daniel@example.com", "Daniel");

    const res = await request(app)
      .post("/assignments/does-not-exist/accept")
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    expect(res.status).toBe(404);
  });

  it("rejects accepting an already-CANCELLED assignment with 409", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/tasks/${task.id}/assignments/${created.id}/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    const res = await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    expect(res.status).toBe(409);
  });

  it("rejects accepting an already-DECLINED assignment with 409", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/decline`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    const res = await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    expect(res.status).toBe(409);
  });

  it("rejects accepting an already-ACCEPTED assignment with 409", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    const res = await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    expect(res.status).toBe(409);
  });

  it("rejects a malformed body (missing scheduledAt) with 400 VALIDATION_ERROR", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("Accept — assignee-scoped access transfer", () => {
  it("the sender loses assignee-scoped read access after acceptance", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    // FR-32 (creator read-only visibility) is explicitly M10 — until then,
    // a non-assignee (even the original creator/sender) gets a plain 404,
    // matching every other task-ownership check in this API.
    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);
    expect(res.status).toBe(404);
  });

  it("the recipient gains assignee-scoped read/write access after acceptance", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    const getRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);
    expect(getRes.status).toBe(200);

    const patchRes = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ title: "Now mine" });
    expect(patchRes.status).toBe(200);
  });

  it("the transferred task no longer appears in the sender's GET /tasks", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    const res = await request(app).get("/tasks").set("Authorization", `Bearer ${rami.accessToken}`);
    expect(res.body.data.map((t: { id: string }) => t.id)).not.toContain(task.id);
  });

  it("the transferred task appears in the recipient's GET /tasks, including filtered", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken, { title: "Handoff", priority: "HIGH" });
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    const listRes = await request(app)
      .get("/tasks")
      .set("Authorization", `Bearer ${daniel.accessToken}`);
    expect(listRes.body.data.map((t: { id: string }) => t.id)).toContain(task.id);

    const filteredRes = await request(app)
      .get("/tasks?priority=HIGH&q=Handoff")
      .set("Authorization", `Bearer ${daniel.accessToken}`);
    expect(filteredRes.body.data.map((t: { id: string }) => t.id)).toContain(task.id);
  });
});

describe("Accept — scheduling (FR-30, EC-13)", () => {
  it("stores the recipient-selected scheduledAt, replacing the sender's previous one", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken, {
      title: "Task",
      scheduledAt: "2026-09-25T10:00:00.000Z",
      deadline: "2026-09-27T17:00:00.000Z",
    });
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: "2026-09-26T14:00:00.000Z" });

    expect(res.status).toBe(200);
    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.scheduledAt?.toISOString()).toBe("2026-09-26T14:00:00.000Z");
    expect(stored.deadline?.toISOString()).toBe("2026-09-27T17:00:00.000Z");
  });

  it('"Schedule later" (scheduledAt: null) clears the sender\'s previous scheduledAt', async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken, {
      title: "Task",
      scheduledAt: "2026-09-25T10:00:00.000Z",
    });
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.scheduledAt).toBeNull();
  });

  it("rejects a scheduledAt after the deadline with 409, leaving the task untouched", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken, {
      title: "Task",
      scheduledAt: "2026-09-25T10:00:00.000Z",
      deadline: "2026-09-27T17:00:00.000Z",
    });
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: "2026-09-28T09:00:00.000Z" });

    expect(res.status).toBe(409);
    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.assigneeId).toBe(rami.userId);
    expect(stored.scheduledAt?.toISOString()).toBe("2026-09-25T10:00:00.000Z");
    const assignment = await prisma.taskAssignment.findUniqueOrThrow({ where: { id: created.id } });
    expect(assignment.status).toBe("PENDING");
  });

  it("accepts a valid scheduledAt before the deadline", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken, {
      title: "Task",
      deadline: "2026-09-27T17:00:00.000Z",
    });
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: "2026-09-26T14:00:00.000Z" });

    expect(res.status).toBe(200);
  });

  it('"Schedule later" is valid even when a deadline exists', async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken, {
      title: "Task",
      deadline: "2026-09-27T17:00:00.000Z",
    });
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    expect(res.status).toBe(200);
  });

  it("leaves the deadline unchanged through acceptance", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken, {
      title: "Task",
      deadline: "2026-09-27T17:00:00.000Z",
    });
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: "2026-09-26T14:00:00.000Z" });

    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.deadline?.toISOString()).toBe("2026-09-27T17:00:00.000Z");
  });
});

describe("Accept — Today/Schedule (M5 semantics reused)", () => {
  it("an accepted task scheduled today appears in the recipient's Today view", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const now = Date.now();
    const task = await createTask(rami.accessToken, { title: "Task" });
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: new Date(now).toISOString() });

    const from = new Date(now - 60 * 60 * 1000).toISOString();
    const to = new Date(now + 60 * 60 * 1000).toISOString();
    const res = await request(app)
      .get(`/tasks/today?from=${from}&to=${to}`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.body.scheduledToday.map((t: { id: string }) => t.id)).toContain(task.id);
  });

  it("an accepted task with a chosen date appears in the recipient's Schedule", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken, { title: "Task" });
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: "2026-09-26T14:00:00.000Z" });

    const res = await request(app)
      .get("/tasks/schedule?from=2026-09-26T00:00:00.000Z&to=2026-09-27T00:00:00.000Z")
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.body.data.map((t: { id: string }) => t.id)).toContain(task.id);
  });

  it('a "Schedule later" task does not appear in Schedule', async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken, { title: "Task" });
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    const res = await request(app)
      .get("/tasks/schedule?from=2026-01-01T00:00:00.000Z&to=2027-01-01T00:00:00.000Z")
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.body.data.map((t: { id: string }) => t.id)).not.toContain(task.id);
  });

  it("an accepted task due today still follows Today semantics", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const now = Date.now();
    const task = await createTask(rami.accessToken, {
      title: "Task",
      deadline: new Date(now + 30 * 60 * 1000).toISOString(),
    });
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    const from = new Date(now - 60 * 60 * 1000).toISOString();
    const to = new Date(now + 60 * 60 * 1000).toISOString();
    const res = await request(app)
      .get(`/tasks/today?from=${from}&to=${to}`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.body.dueToday.map((t: { id: string }) => t.id)).toContain(task.id);
  });

  it("an accepted overdue task follows Today semantics", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const now = Date.now();
    const task = await createTask(rami.accessToken, {
      title: "Task",
      deadline: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    });
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    const from = new Date(now - 60 * 60 * 1000).toISOString();
    const to = new Date(now + 60 * 60 * 1000).toISOString();
    const res = await request(app)
      .get(`/tasks/today?from=${from}&to=${to}`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.body.overdue.map((t: { id: string }) => t.id)).toContain(task.id);
  });

  it("the transferred task no longer appears in the sender's Today/Schedule", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const now = Date.now();
    const task = await createTask(rami.accessToken, {
      title: "Task",
      scheduledAt: new Date(now).toISOString(),
    });
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: new Date(now).toISOString() });

    const from = new Date(now - 60 * 60 * 1000).toISOString();
    const to = new Date(now + 60 * 60 * 1000).toISOString();
    const todayRes = await request(app)
      .get(`/tasks/today?from=${from}&to=${to}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);
    const scheduleRes = await request(app)
      .get(`/tasks/schedule?from=${from}&to=${to}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    const todayIds = [
      ...todayRes.body.overdue,
      ...todayRes.body.scheduledToday,
      ...todayRes.body.dueToday,
    ].map((t: { id: string }) => t.id);
    expect(todayIds).not.toContain(task.id);
    expect(scheduleRes.body.data.map((t: { id: string }) => t.id)).not.toContain(task.id);
  });
});

describe("Concurrency: terminal-state resolution races (EC-3)", () => {
  it("double accept: exactly one succeeds", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post(`/assignments/${created.id}/accept`)
          .set("Authorization", `Bearer ${daniel.accessToken}`)
          .send({ scheduledAt: null }),
      ),
    );

    expect(attempts.filter((r) => r.status === 200)).toHaveLength(1);
    expect(attempts.filter((r) => r.status === 409)).toHaveLength(4);
    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.assigneeId).toBe(daniel.userId);
  });

  it("accept vs decline: exactly one succeeds, and assigneeId agrees with the winner", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const [acceptRes, declineRes] = await Promise.all([
      request(app)
        .post(`/assignments/${created.id}/accept`)
        .set("Authorization", `Bearer ${daniel.accessToken}`)
        .send({ scheduledAt: null }),
      request(app)
        .post(`/assignments/${created.id}/decline`)
        .set("Authorization", `Bearer ${daniel.accessToken}`),
    ]);

    const outcomes = [acceptRes.status, declineRes.status];
    expect(outcomes.filter((s) => s === 200)).toHaveLength(1);
    expect(outcomes.filter((s) => s === 409)).toHaveLength(1);

    const assignment = await prisma.taskAssignment.findUniqueOrThrow({ where: { id: created.id } });
    const task_ = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    if (acceptRes.status === 200) {
      expect(assignment.status).toBe("ACCEPTED");
      expect(task_.assigneeId).toBe(daniel.userId);
    } else {
      expect(assignment.status).toBe("DECLINED");
      expect(task_.assigneeId).toBe(rami.userId);
    }
  });

  it("accept vs sender cancel: exactly one terminal transition wins", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const [acceptRes, cancelRes] = await Promise.all([
      request(app)
        .post(`/assignments/${created.id}/accept`)
        .set("Authorization", `Bearer ${daniel.accessToken}`)
        .send({ scheduledAt: null }),
      request(app)
        .post(`/tasks/${task.id}/assignments/${created.id}/cancel`)
        .set("Authorization", `Bearer ${rami.accessToken}`),
    ]);

    const outcomes = [acceptRes.status, cancelRes.status];
    expect(outcomes.filter((s) => s === 200)).toHaveLength(1);
    expect(outcomes.filter((s) => s === 409)).toHaveLength(1);

    const assignment = await prisma.taskAssignment.findUniqueOrThrow({ where: { id: created.id } });
    const task_ = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    if (acceptRes.status === 200) {
      expect(assignment.status).toBe("ACCEPTED");
      expect(task_.assigneeId).toBe(daniel.userId);
    } else {
      expect(assignment.status).toBe("CANCELLED");
      expect(task_.assigneeId).toBe(rami.userId);
    }
  });

  it("decline vs sender cancel: exactly one terminal transition wins", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const [declineRes, cancelRes] = await Promise.all([
      request(app)
        .post(`/assignments/${created.id}/decline`)
        .set("Authorization", `Bearer ${daniel.accessToken}`),
      request(app)
        .post(`/tasks/${task.id}/assignments/${created.id}/cancel`)
        .set("Authorization", `Bearer ${rami.accessToken}`),
    ]);

    const outcomes = [declineRes.status, cancelRes.status];
    expect(outcomes.filter((s) => s === 200)).toHaveLength(1);
    expect(outcomes.filter((s) => s === 409)).toHaveLength(1);

    const assignment = await prisma.taskAssignment.findUniqueOrThrow({ where: { id: created.id } });
    expect(["DECLINED", "CANCELLED"]).toContain(assignment.status);
    const task_ = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    // Neither decline nor cancel ever transfers assigneeId.
    expect(task_.assigneeId).toBe(rami.userId);
  });

  it("the assignment never ends in a contradictory state after any race above", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    await Promise.all([
      request(app)
        .post(`/assignments/${created.id}/accept`)
        .set("Authorization", `Bearer ${daniel.accessToken}`)
        .send({ scheduledAt: null }),
      request(app)
        .post(`/assignments/${created.id}/decline`)
        .set("Authorization", `Bearer ${daniel.accessToken}`),
      request(app)
        .post(`/tasks/${task.id}/assignments/${created.id}/cancel`)
        .set("Authorization", `Bearer ${rami.accessToken}`),
    ]);

    const assignment = await prisma.taskAssignment.findUniqueOrThrow({ where: { id: created.id } });
    expect(["ACCEPTED", "DECLINED", "CANCELLED"]).toContain(assignment.status);
    const task_ = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(task_.assigneeId).toBe(assignment.status === "ACCEPTED" ? daniel.userId : rami.userId);
    expect(task_.creatorId).toBe(rami.userId);
  });
});

describe("History (EC-6)", () => {
  it("a DECLINED assignment row remains stored, not deleted", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/decline`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    const stored = await prisma.taskAssignment.findUnique({ where: { id: created.id } });
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe("DECLINED");
    expect(stored?.fromUserId).toBe(rami.userId);
    expect(stored?.toUserId).toBe(daniel.userId);
  });

  it("an ACCEPTED assignment row remains stored, not deleted, with original fromUserId/toUserId", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    const stored = await prisma.taskAssignment.findUnique({ where: { id: created.id } });
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe("ACCEPTED");
    expect(stored?.fromUserId).toBe(rami.userId);
    expect(stored?.toUserId).toBe(daniel.userId);
  });

  it("a new assignment can be sent by the new assignee after acceptance, preserving prior history", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const carol = await registerUser("carol@example.com", "Carol");
    const task = await createTask(rami.accessToken);
    const first = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${first.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    const second = await sendAssignment(daniel.accessToken, task.id, carol.userId);
    expect(second.status).toBe("PENDING");

    const allRows = await prisma.taskAssignment.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: "asc" },
    });
    expect(allRows).toHaveLength(2);
    expect(allRows[0]?.id).toBe(first.id);
    expect(allRows[0]?.status).toBe("ACCEPTED");
    expect(allRows[1]?.id).toBe(second.id);
    expect(allRows[1]?.status).toBe("PENDING");
  });
});

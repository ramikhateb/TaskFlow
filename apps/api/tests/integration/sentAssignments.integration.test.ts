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

describe("GET /assignments/sent", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get("/assignments/sent");
    expect(res.status).toBe(401);
  });

  it("returns the sender's sent assignments", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken, { title: "Prepare presentation" });
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId, "please help");

    const res = await request(app)
      .get("/assignments/sent")
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: created.id,
      status: "PENDING",
      message: "please help",
      toUser: { id: daniel.userId, name: "Daniel", username: daniel.username },
      task: { id: task.id, title: "Prepare presentation" },
    });
  });

  it("does not show another user's sent assignments", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .get("/assignments/sent")
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.body.data).toEqual([]);
  });

  it("ignores any fromUserId/userId query parameter — identity comes only from the JWT", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .get(`/assignments/sent?fromUserId=${daniel.userId}&userId=${daniel.userId}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    // Still Rami's own sent list (1 item), not Daniel's (0 sent).
    expect(res.body.data).toHaveLength(1);
  });

  it("includes a PENDING assignment", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .get("/assignments/sent")
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.body.data[0].status).toBe("PENDING");
  });

  it("includes an ACCEPTED assignment", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    const res = await request(app)
      .get("/assignments/sent")
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.body.data[0].status).toBe("ACCEPTED");
  });

  it("includes a DECLINED assignment", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/decline`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    const res = await request(app)
      .get("/assignments/sent")
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.body.data[0].status).toBe("DECLINED");
  });

  it("includes a CANCELLED assignment", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/tasks/${task.id}/assignments/${created.id}/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    const res = await request(app)
      .get("/assignments/sent")
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.body.data[0].status).toBe("CANCELLED");
  });

  it("preserves multiple historical rows for the same task (EC-6)", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const sarah = await registerUser("sarah@example.com", "Sarah");
    const task = await createTask(rami.accessToken);
    const toDaniel = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${toDaniel.id}/decline`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);
    const toSarah = await sendAssignment(rami.accessToken, task.id, sarah.userId);
    await request(app)
      .post(`/assignments/${toSarah.id}/accept`)
      .set("Authorization", `Bearer ${sarah.accessToken}`)
      .send({ scheduledAt: null });

    const res = await request(app)
      .get("/assignments/sent")
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.body.data).toHaveLength(2);
    const byId = Object.fromEntries(
      res.body.data.map((row: { id: string; status: string }) => [row.id, row.status]),
    );
    expect(byId[toDaniel.id]).toBe("DECLINED");
    expect(byId[toSarah.id]).toBe("ACCEPTED");
  });

  it("orders results newest-first", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const taskA = await createTask(rami.accessToken, { title: "First" });
    const first = await sendAssignment(rami.accessToken, taskA.id, daniel.userId);
    const taskB = await createTask(rami.accessToken, { title: "Second" });
    const second = await sendAssignment(rami.accessToken, taskB.id, daniel.userId);

    const res = await request(app)
      .get("/assignments/sent")
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.body.data.map((row: { id: string }) => row.id)).toEqual([second.id, first.id]);
  });

  it("returns the recipient as a PublicUser and never exposes email or passwordHash", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const res = await request(app)
      .get("/assignments/sent")
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(Object.keys(res.body.data[0].toUser)).toEqual(["id", "name", "username"]);
    expect(res.body.data[0].toUser).not.toHaveProperty("email");
    expect(res.body.data[0].toUser).not.toHaveProperty("passwordHash");
  });

  it("never exposes the recipient's scheduledAt after acceptance", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: "2026-09-26T14:00:00.000Z" });

    const res = await request(app)
      .get("/assignments/sent")
      .set("Authorization", `Bearer ${rami.accessToken}`);

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

  it("a PENDING sent assignment can still be cancelled (existing M8 capability)", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const cancelRes = await request(app)
      .post(`/tasks/${task.id}/assignments/${created.id}/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);
    expect(cancelRes.status).toBe(200);

    const sentRes = await request(app)
      .get("/assignments/sent")
      .set("Authorization", `Bearer ${rami.accessToken}`);
    expect(sentRes.body.data[0].status).toBe("CANCELLED");
  });

  it("a later refetch reflects a changed terminal status", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);

    const before = await request(app)
      .get("/assignments/sent")
      .set("Authorization", `Bearer ${rami.accessToken}`);
    expect(before.body.data[0].status).toBe("PENDING");

    await request(app)
      .post(`/assignments/${created.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });

    const after = await request(app)
      .get("/assignments/sent")
      .set("Authorization", `Bearer ${rami.accessToken}`);
    expect(after.body.data[0].status).toBe("ACCEPTED");
  });
});

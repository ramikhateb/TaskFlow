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

async function sendAssignment(senderToken: string, taskId: string, toUserId: string) {
  const res = await request(app)
    .post(`/tasks/${taskId}/assignments`)
    .set("Authorization", `Bearer ${senderToken}`)
    .send({ toUserId });
  return res.body;
}

async function acceptAssignment(
  recipientToken: string,
  assignmentId: string,
  scheduledAt: string | null = null,
) {
  const res = await request(app)
    .post(`/assignments/${assignmentId}/accept`)
    .set("Authorization", `Bearer ${recipientToken}`)
    .send({ scheduledAt });
  return res.body;
}

/** Rami creates a task and Daniel accepts it — the standard "transferred" fixture used throughout this file. */
async function setupTransferredTask(
  rami: { accessToken: string },
  daniel: { accessToken: string; userId: string },
) {
  const task = await createTask(rami.accessToken, {
    title: "Task",
    scheduledAt: "2026-09-25T10:00:00.000Z",
    deadline: "2026-09-27T17:00:00.000Z",
  });
  const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
  await acceptAssignment(daniel.accessToken, created.id, "2026-09-26T14:00:00.000Z");
  return task;
}

describe("Creator read-only visibility after transfer (M10, FR-32)", () => {
  it("GET /tasks/:id succeeds for the original creator, read-only", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await setupTransferredTask(rami, daniel);

    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.creatorId).toBe(rami.userId);
    expect(res.body.assigneeId).toBe(daniel.userId);
    expect(res.body.viewer).toEqual({
      isAssignee: false,
      isCreator: true,
      canEdit: false,
      canDelete: false,
    });
  });

  it("does not expose Daniel's scheduledAt to Rami", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await setupTransferredTask(rami, daniel);

    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.body.scheduledAt).toBeNull();

    // Sanity: the value genuinely exists in storage, it's just withheld
    // from this viewer — not that acceptance failed to set it.
    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.scheduledAt?.toISOString()).toBe("2026-09-26T14:00:00.000Z");
  });

  it("leaves deadline, priority, category, status, title visible to the creator", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken, {
      title: "Prepare report",
      category: "Work",
      priority: "HIGH",
      deadline: "2026-09-27T17:00:00.000Z",
    });
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await acceptAssignment(daniel.accessToken, created.id);

    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.body).toMatchObject({
      title: "Prepare report",
      category: "Work",
      priority: "HIGH",
      deadline: "2026-09-27T17:00:00.000Z",
      status: "TODO",
    });
  });

  it("does not mask completedAt for the creator", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await acceptAssignment(daniel.accessToken, created.id);
    await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ status: "DONE" });

    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.body.completedAt).not.toBeNull();
  });

  it("identifies the current assignee as a PublicUser", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await setupTransferredTask(rami, daniel);

    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.body.assignee).toEqual({
      id: daniel.userId,
      name: "Daniel",
      username: daniel.username,
    });
    expect(res.body.creator).toEqual({ id: rami.userId, name: "Rami", username: rami.username });
  });

  it("the whole task-detail response never contains the word 'email' (M11, Phase 12)", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await setupTransferredTask(rami, daniel);

    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(JSON.stringify(res.body)).not.toContain("email");
  });

  it("rejects PATCH from the creator", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await setupTransferredTask(rami, daniel);

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ title: "Rami cannot do this" });

    expect(res.status).toBe(404);
    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.title).toBe("Task");
  });

  it("rejects DELETE from the creator", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await setupTransferredTask(rami, daniel);

    const res = await request(app)
      .delete(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.status).toBe(404);
    await expect(prisma.task.findUnique({ where: { id: task.id } })).resolves.not.toBeNull();
  });

  it("the current assignee still sees their own real scheduledAt", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await setupTransferredTask(rami, daniel);

    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.scheduledAt).toBe("2026-09-26T14:00:00.000Z");
    expect(res.body.viewer).toEqual({
      isAssignee: true,
      isCreator: false,
      canEdit: true,
      canDelete: true,
    });
  });

  it("the current assignee can PATCH normally", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await setupTransferredTask(rami, daniel);

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ title: "Daniel's task now" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Daniel's task now");
  });

  it("the current assignee can DELETE normally", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await setupTransferredTask(rami, daniel);

    const res = await request(app)
      .delete(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);

    expect(res.status).toBe(204);
    await expect(prisma.task.findUnique({ where: { id: task.id } })).resolves.toBeNull();
  });

  it("rejects GET/PATCH/DELETE from an unrelated user, enumeration-safely", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const carol = await registerUser("carol@example.com", "Carol");
    const task = await setupTransferredTask(rami, daniel);

    const getRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${carol.accessToken}`);
    expect(getRes.status).toBe(404);

    const patchRes = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${carol.accessToken}`)
      .send({ title: "Hijacked" });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${carol.accessToken}`);
    expect(deleteRes.status).toBe(404);
  });
});

describe("List isolation: creator visibility does not leak into assignee-scoped views (M10)", () => {
  it("the transferred task does not appear in the creator's GET /tasks", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await setupTransferredTask(rami, daniel);

    const res = await request(app).get("/tasks").set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.body.data.map((t: { id: string }) => t.id)).not.toContain(task.id);
  });

  it("the transferred task does not appear in the creator's search/filter results", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken, { title: "Findable Task" });
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await acceptAssignment(daniel.accessToken, created.id);

    const res = await request(app)
      .get("/tasks?q=Findable")
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.body.data.map((t: { id: string }) => t.id)).not.toContain(task.id);
  });

  it("the transferred task does not appear in the creator's Today", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const now = Date.now();
    const task = await createTask(rami.accessToken, {
      title: "Task",
      deadline: new Date(now - 24 * 60 * 60 * 1000).toISOString(), // overdue
    });
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await acceptAssignment(daniel.accessToken, created.id);

    const from = new Date(now - 60 * 60 * 1000).toISOString();
    const to = new Date(now + 60 * 60 * 1000).toISOString();
    const res = await request(app)
      .get(`/tasks/today?from=${from}&to=${to}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    const allIds = [...res.body.overdue, ...res.body.scheduledToday, ...res.body.dueToday].map(
      (t: { id: string }) => t.id,
    );
    expect(allIds).not.toContain(task.id);
  });

  it("the transferred task does not appear in the creator's Schedule", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await setupTransferredTask(rami, daniel);

    const res = await request(app)
      .get("/tasks/schedule?from=2026-01-01T00:00:00.000Z&to=2027-01-01T00:00:00.000Z")
      .set("Authorization", `Bearer ${rami.accessToken}`);

    expect(res.body.data.map((t: { id: string }) => t.id)).not.toContain(task.id);
  });

  it("the recipient's Tasks/Today/Schedule views behave normally after acceptance", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await setupTransferredTask(rami, daniel);

    const listRes = await request(app)
      .get("/tasks")
      .set("Authorization", `Bearer ${daniel.accessToken}`);
    expect(listRes.body.data.map((t: { id: string }) => t.id)).toContain(task.id);

    const scheduleRes = await request(app)
      .get("/tasks/schedule?from=2026-09-26T00:00:00.000Z&to=2026-09-27T00:00:00.000Z")
      .set("Authorization", `Bearer ${daniel.accessToken}`);
    expect(scheduleRes.body.data.map((t: { id: string }) => t.id)).toContain(task.id);
  });
});

describe("Transfer chains (M10)", () => {
  it("Rami -> Daniel (ACCEPTED) -> Sarah (ACCEPTED): authorization follows the current chain, not history", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const sarah = await registerUser("sarah@example.com", "Sarah");
    const task = await createTask(rami.accessToken, { title: "Chained task" });

    const toDaniel = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await acceptAssignment(daniel.accessToken, toDaniel.id);
    const toSarah = await sendAssignment(daniel.accessToken, task.id, sarah.userId);
    await acceptAssignment(sarah.accessToken, toSarah.id);

    // creatorId is still Rami; assigneeId is now Sarah.
    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.creatorId).toBe(rami.userId);
    expect(stored.assigneeId).toBe(sarah.userId);

    // Rami: creator read-only access succeeds.
    const ramiRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);
    expect(ramiRes.status).toBe(200);
    expect(ramiRes.body.viewer).toMatchObject({
      isCreator: true,
      isAssignee: false,
      canEdit: false,
    });

    // Sarah: current-assignee access succeeds, full control.
    const sarahRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${sarah.accessToken}`);
    expect(sarahRes.status).toBe(200);
    expect(sarahRes.body.viewer).toEqual({
      isAssignee: true,
      isCreator: false,
      canEdit: true,
      canDelete: true,
    });
    const sarahPatch = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${sarah.accessToken}`)
      .send({ title: "Sarah's task now" });
    expect(sarahPatch.status).toBe(200);

    // Daniel: a historical intermediate assignee/sender, currently neither
    // creator nor assignee — no permanent task access from having been in
    // the chain.
    const danielGet = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);
    expect(danielGet.status).toBe(404);

    const danielPatch = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ title: "Daniel should not be able to do this" });
    expect(danielPatch.status).toBe(404);

    const danielDelete = await request(app)
      .delete(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${daniel.accessToken}`);
    expect(danielDelete.status).toBe(404);

    // Daniel can still see his own historical Sent record (Daniel -> Sarah)
    // — that's Daniel's own request history, a separate authorization
    // question from current task access (see the M10 report's "Sent
    // history vs current task authorization" section).
    const danielSent = await request(app)
      .get("/assignments/sent")
      .set("Authorization", `Bearer ${daniel.accessToken}`);
    expect(danielSent.body.data.map((row: { id: string }) => row.id)).toContain(toSarah.id);

    // Verify both ACCEPTED rows exist in assignment history.
    const history = await prisma.taskAssignment.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: "asc" },
    });
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      fromUserId: rami.userId,
      toUserId: daniel.userId,
      status: "ACCEPTED",
    });
    expect(history[1]).toMatchObject({
      fromUserId: daniel.userId,
      toUserId: sarah.userId,
      status: "ACCEPTED",
    });
  });
});

describe("Task deletion + assignment history (V1 behavior, documented limitation)", () => {
  it("deleting a task (by its current assignee, no PENDING assignment) cascades its assignment history", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await sendAssignment(rami.accessToken, task.id, daniel.userId);
    await request(app)
      .post(`/tasks/${task.id}/assignments/${created.id}/cancel`)
      .set("Authorization", `Bearer ${rami.accessToken}`);

    // Rami is still the assignee here (cancel doesn't transfer), so he can
    // delete it — this is the existing M8 cascade behavior, unchanged by
    // M10: once the task is gone, its history (now only reachable via
    // Sent, since GET /tasks/:id 404s) goes with it.
    const deleteRes = await request(app)
      .delete(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${rami.accessToken}`);
    expect(deleteRes.status).toBe(204);

    await expect(
      prisma.taskAssignment.findUnique({ where: { id: created.id } }),
    ).resolves.toBeNull();

    // Sent reflects this too — there's nothing left to report once the
    // underlying rows are gone (documented v1 limitation, see the M10
    // report; not addressed in this milestone).
    const sentRes = await request(app)
      .get("/assignments/sent")
      .set("Authorization", `Bearer ${rami.accessToken}`);
    expect(sentRes.body.data.map((row: { id: string }) => row.id)).not.toContain(created.id);
  });
});

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
  extra: Record<string, unknown> = {},
) {
  const res = await request(app)
    .post(`/tasks/${taskId}/assignments`)
    .set("Authorization", `Bearer ${senderToken}`)
    .send({ toUserId, ...extra });
  return res.body;
}

async function acceptAssignment(
  recipientToken: string,
  assignmentId: string,
  extra: Record<string, unknown> = {},
) {
  const res = await request(app)
    .post(`/assignments/${assignmentId}/accept`)
    .set("Authorization", `Bearer ${recipientToken}`)
    .send({ scheduledAt: null, ...extra });
  return res;
}

async function declineAssignment(recipientToken: string, assignmentId: string) {
  return request(app)
    .post(`/assignments/${assignmentId}/decline`)
    .set("Authorization", `Bearer ${recipientToken}`);
}

async function cancelAssignment(senderToken: string, taskId: string, assignmentId: string) {
  return request(app)
    .post(`/tasks/${taskId}/assignments/${assignmentId}/cancel`)
    .set("Authorization", `Bearer ${senderToken}`);
}

// =====================================================================
// PHASE 2 — Cross-user attack matrix
// A = Rami (original creator/first assignee), B = Daniel (recipient,
// current assignee after A -> B ACCEPTED), C = Carol (unrelated attacker),
// D = Sarah (used for the B -> D transfer chain).
// =====================================================================
describe("Cross-user attack matrix (M11)", () => {
  it("C guesses a task ID: GET/PATCH/DELETE and assignment-create all rejected", async () => {
    const a = await registerUser("rami@example.com", "Rami");
    const c = await registerUser("carol@example.com", "Carol");
    const task = await createTask(a.accessToken);

    const getRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${c.accessToken}`);
    expect(getRes.status).toBe(404);

    const patchRes = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${c.accessToken}`)
      .send({ title: "Stolen" });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${c.accessToken}`);
    expect(deleteRes.status).toBe(404);

    const assignRes = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${c.accessToken}`)
      .send({ toUserId: a.userId });
    expect(assignRes.status).toBe(404);
  });

  it("C guesses a PENDING assignment ID: cancel/accept/decline all rejected", async () => {
    const a = await registerUser("rami@example.com", "Rami");
    const b = await registerUser("daniel@example.com", "Daniel");
    const c = await registerUser("carol@example.com", "Carol");
    const task = await createTask(a.accessToken);
    const created = await sendAssignment(a.accessToken, task.id, b.userId);

    const cancelRes = await cancelAssignment(c.accessToken, task.id, created.id);
    expect(cancelRes.status).toBe(404);

    const acceptRes = await acceptAssignment(c.accessToken, created.id);
    expect(acceptRes.status).toBe(404);

    const declineRes = await declineAssignment(c.accessToken, created.id);
    expect(declineRes.status).toBe(404);

    // Still PENDING — none of C's attempts touched it.
    const stored = await prisma.taskAssignment.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.status).toBe("PENDING");
  });

  it("A after transferring to B: read-only, cannot mutate, cannot create a new assignment on B's task", async () => {
    const a = await registerUser("rami@example.com", "Rami");
    const b = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(a.accessToken);
    const created = await sendAssignment(a.accessToken, task.id, b.userId);
    await acceptAssignment(b.accessToken, created.id);

    const getRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${a.accessToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.viewer.isAssignee).toBe(false);

    const patchRes = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send({ title: "Rami cannot do this" });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${a.accessToken}`);
    expect(deleteRes.status).toBe(404);

    // A is no longer the assignee, so A cannot send a new assignment
    // request "on behalf of" the task either — the endpoint checks
    // Task.assigneeId, not historical involvement.
    const assignRes = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send({ toUserId: a.userId }); // (recipient choice is irrelevant — rejected before that's checked)
    expect(assignRes.status).toBe(404);
  });

  it("historical B (after B -> D ACCEPTED): no current-task access, but keeps own historical Sent record", async () => {
    const a = await registerUser("rami@example.com", "Rami");
    const b = await registerUser("daniel@example.com", "Daniel");
    const d = await registerUser("sarah@example.com", "Sarah");
    const task = await createTask(a.accessToken, { title: "Chained" });

    const toB = await sendAssignment(a.accessToken, task.id, b.userId);
    await acceptAssignment(b.accessToken, toB.id);
    const toD = await sendAssignment(b.accessToken, task.id, d.userId);
    await acceptAssignment(d.accessToken, toD.id);

    // B is now neither creator (A is) nor current assignee (D is).
    const getRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${b.accessToken}`);
    expect(getRes.status).toBe(404);

    const patchRes = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${b.accessToken}`)
      .send({ title: "Daniel cannot do this" });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${b.accessToken}`);
    expect(deleteRes.status).toBe(404);

    const assignRes = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${b.accessToken}`)
      .send({ toUserId: a.userId });
    expect(assignRes.status).toBe(404);

    // B's own Sent history (B -> D) is still B's to see.
    const sentRes = await request(app)
      .get("/assignments/sent")
      .set("Authorization", `Bearer ${b.accessToken}`);
    expect(sentRes.body.data.map((row: { id: string }) => row.id)).toContain(toD.id);
  });
});

// =====================================================================
// PHASE 3 — Mass-assignment / immutable-field protection
// =====================================================================
describe("Mass-assignment / immutable-field protection (M11)", () => {
  it("PATCH /tasks/:id ignores assigneeId/creatorId/id/completedAt/createdAt/updatedAt in the body", async () => {
    const a = await registerUser("rami@example.com", "Rami");
    const c = await registerUser("carol@example.com", "Carol");
    const task = await createTask(a.accessToken, { title: "Original" });

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send({
        title: "Legit update",
        assigneeId: c.userId,
        creatorId: c.userId,
        id: "some-other-id",
        completedAt: "2020-01-01T00:00:00.000Z",
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
      });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Legit update");
    expect(res.body.assigneeId).toBe(a.userId);
    expect(res.body.creatorId).toBe(a.userId);
    expect(res.body.id).toBe(task.id);
    expect(res.body.completedAt).toBeNull();

    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.assigneeId).toBe(a.userId);
    expect(stored.creatorId).toBe(a.userId);
    expect(stored.completedAt).toBeNull();
  });

  it("assignment create ignores fromUserId/status/id in the body", async () => {
    const a = await registerUser("rami@example.com", "Rami");
    const b = await registerUser("daniel@example.com", "Daniel");
    const c = await registerUser("carol@example.com", "Carol");
    const task = await createTask(a.accessToken);

    const res = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send({
        toUserId: b.userId,
        fromUserId: c.userId,
        status: "ACCEPTED",
        id: "attacker-chosen-id",
        respondedAt: "2020-01-01T00:00:00.000Z",
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
    expect(res.body.fromUser.id).toBe(a.userId);
    expect(res.body.id).not.toBe("attacker-chosen-id");

    const stored = await prisma.taskAssignment.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(stored.fromUserId).toBe(a.userId);
    expect(stored.status).toBe("PENDING");
    expect(stored.respondedAt).toBeNull();

    // Task.assigneeId is still Rami — the create path never transfers.
    const task_ = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(task_.assigneeId).toBe(a.userId);
  });

  it("accept ignores toUserId/status/respondedAt/id in the body", async () => {
    const a = await registerUser("rami@example.com", "Rami");
    const b = await registerUser("daniel@example.com", "Daniel");
    const c = await registerUser("carol@example.com", "Carol");
    const task = await createTask(a.accessToken);
    const created = await sendAssignment(a.accessToken, task.id, b.userId);

    const res = await acceptAssignment(b.accessToken, created.id, {
      toUserId: c.userId,
      status: "DECLINED",
      respondedAt: "2020-01-01T00:00:00.000Z",
      id: "attacker-chosen-id",
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ACCEPTED");
    expect(res.body.toUser.id).toBe(b.userId);
    expect(res.body.id).toBe(created.id);

    const stored = await prisma.taskAssignment.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.toUserId).toBe(b.userId);
    expect(stored.status).toBe("ACCEPTED");

    // assigneeId transferred to the REAL recipient (b), never to c.
    const task_ = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(task_.assigneeId).toBe(b.userId);
  });

  it("registration ignores an injected id/passwordHash in the body", async () => {
    const res = await request(app).post("/auth/register").send({
      email: "attacker@example.com",
      password: "password1",
      name: "Attacker",
      username: "attacker",
      id: "chosen-id",
      passwordHash: "not-a-real-hash",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.id).not.toBe("chosen-id");
    const stored = await prisma.user.findUniqueOrThrow({
      where: { email: "attacker@example.com" },
    });
    expect(stored.passwordHash).not.toBe("not-a-real-hash");
  });
});

// =====================================================================
// PHASE 4 — Malformed ID / parameter / body handling
// =====================================================================
describe("Malformed ID / parameter / body handling (M11)", () => {
  it("a garbage task ID returns 404, not a 500", async () => {
    const a = await registerUser("rami@example.com", "Rami");
    const res = await request(app)
      .get("/tasks/' OR '1'='1")
      .set("Authorization", `Bearer ${a.accessToken}`);
    expect(res.status).toBe(404);
  });

  it("a very long garbage task ID returns 404, not a 500", async () => {
    const a = await registerUser("rami@example.com", "Rami");
    const res = await request(app)
      .get(`/tasks/${"x".repeat(5000)}`)
      .set("Authorization", `Bearer ${a.accessToken}`);
    expect(res.status).toBe(404);
  });

  it("a whitespace-only task ID is treated as a well-formed-but-nonexistent id (404)", async () => {
    const a = await registerUser("rami@example.com", "Rami");
    const res = await request(app)
      .get("/tasks/%20")
      .set("Authorization", `Bearer ${a.accessToken}`);
    expect(res.status).toBe(404);
  });

  it("a garbage assignment ID on accept/decline/cancel returns 404, not a 500", async () => {
    const a = await registerUser("rami@example.com", "Rami");
    const task = await createTask(a.accessToken);

    const acceptRes = await acceptAssignment(a.accessToken, '\'; DROP TABLE "Task"; --');
    expect(acceptRes.status).toBe(404);

    const declineRes = await declineAssignment(a.accessToken, '\'; DROP TABLE "Task"; --');
    expect(declineRes.status).toBe(404);

    const cancelRes = await cancelAssignment(a.accessToken, task.id, "not-a-real-id");
    expect(cancelRes.status).toBe(404);

    // The table is still there and still has our task in it.
    await expect(prisma.task.findUnique({ where: { id: task.id } })).resolves.not.toBeNull();
  });

  it("PATCH with a numeric title (wrong JSON type) returns 400 VALIDATION_ERROR", async () => {
    const a = await registerUser("rami@example.com", "Rami");
    const task = await createTask(a.accessToken);

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send({ title: 12345 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("assignment create with an empty body returns 400 VALIDATION_ERROR (toUserId required)", async () => {
    const a = await registerUser("rami@example.com", "Rami");
    const task = await createTask(a.accessToken);

    const res = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("accept with a non-ISO scheduledAt string returns 400 VALIDATION_ERROR", async () => {
    const a = await registerUser("rami@example.com", "Rami");
    const b = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(a.accessToken);
    const created = await sendAssignment(a.accessToken, task.id, b.userId);

    const res = await acceptAssignment(b.accessToken, created.id, { scheduledAt: "not-a-date" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("create-task with a null title (wrong type) returns 400 VALIDATION_ERROR, not a crash", async () => {
    const a = await registerUser("rami@example.com", "Rami");
    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send({ title: null });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

// =====================================================================
// PHASE 6 — Assignment state-machine exhaustive negative-transition matrix
// =====================================================================
describe("Assignment state-machine: terminal states never transition again (M11)", () => {
  async function driveToTerminal(status: "ACCEPTED" | "DECLINED" | "CANCELLED"): Promise<{
    a: Awaited<ReturnType<typeof registerUser>>;
    b: Awaited<ReturnType<typeof registerUser>>;
    task: { id: string };
    assignmentId: string;
  }> {
    const a = await registerUser("rami@example.com", "Rami");
    const b = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(a.accessToken);
    const created = await sendAssignment(a.accessToken, task.id, b.userId);

    if (status === "ACCEPTED") {
      await acceptAssignment(b.accessToken, created.id);
    } else if (status === "DECLINED") {
      await declineAssignment(b.accessToken, created.id);
    } else {
      await cancelAssignment(a.accessToken, task.id, created.id);
    }

    return { a, b, task, assignmentId: created.id };
  }

  const terminalStates = ["ACCEPTED", "DECLINED", "CANCELLED"] as const;
  const attempts = ["accept", "decline", "cancel"] as const;

  for (const terminal of terminalStates) {
    for (const attempt of attempts) {
      it(`${terminal} -> attempted ${attempt} is rejected with 409 and leaves all state untouched`, async () => {
        const { a, b, task, assignmentId } = await driveToTerminal(terminal);
        const before = await prisma.taskAssignment.findUniqueOrThrow({
          where: { id: assignmentId },
        });
        const taskBefore = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });

        const res =
          attempt === "accept"
            ? await acceptAssignment(b.accessToken, assignmentId)
            : attempt === "decline"
              ? await declineAssignment(b.accessToken, assignmentId)
              : await cancelAssignment(a.accessToken, task.id, assignmentId);

        expect(res.status).toBe(409);

        const after = await prisma.taskAssignment.findUniqueOrThrow({
          where: { id: assignmentId },
        });
        expect(after.status).toBe(before.status);
        expect(after.respondedAt?.getTime()).toBe(before.respondedAt?.getTime());

        const taskAfter = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
        expect(taskAfter.assigneeId).toBe(taskBefore.assigneeId);
        expect(taskAfter.scheduledAt?.getTime()).toBe(taskBefore.scheduledAt?.getTime());
        expect(taskAfter.creatorId).toBe(taskBefore.creatorId);
      });
    }
  }
});

// =====================================================================
// PHASE 5 — Task state hardening: status specifically, for creator-only
// and historical-assignee callers (distinct from the generic-field PATCH
// rejections already covered in creatorVisibility.integration.test.ts).
// =====================================================================
describe("Task status changes: creator-only and historical assignee cannot change status (M11)", () => {
  it("a creator-only viewer cannot change task status via PATCH", async () => {
    const a = await registerUser("rami@example.com", "Rami");
    const b = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(a.accessToken);
    const created = await sendAssignment(a.accessToken, task.id, b.userId);
    await acceptAssignment(b.accessToken, created.id);

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send({ status: "DONE" });

    expect(res.status).toBe(404);
    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.status).toBe("TODO");
    expect(stored.completedAt).toBeNull();
  });

  it("a historical (no-longer-creator, no-longer-assignee) user cannot change task status via PATCH", async () => {
    const a = await registerUser("rami@example.com", "Rami");
    const b = await registerUser("daniel@example.com", "Daniel");
    const d = await registerUser("sarah@example.com", "Sarah");
    const task = await createTask(a.accessToken);
    const toB = await sendAssignment(a.accessToken, task.id, b.userId);
    await acceptAssignment(b.accessToken, toB.id);
    const toD = await sendAssignment(b.accessToken, task.id, d.userId);
    await acceptAssignment(d.accessToken, toD.id);

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${b.accessToken}`)
      .send({ status: "DONE" });

    expect(res.status).toBe(404);
    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.status).toBe("TODO");
    expect(stored.completedAt).toBeNull();
  });
});

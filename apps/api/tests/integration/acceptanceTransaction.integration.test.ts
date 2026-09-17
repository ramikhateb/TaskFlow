import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../src/app";
import { loadEnv } from "../../src/env";
import { prisma } from "../../src/lib/prisma";
import * as taskAssignmentRepository from "../../src/repositories/taskAssignmentRepository";

// Phase 8 (M11): audits the M9 acceptance transaction's rollback behavior
// specifically — not just its happy path (already covered extensively in
// inbox.integration.test.ts). `acceptPendingAssignment` is a plain exported
// repository function; calling it directly with a deliberately-wrong
// `fromUserId` reproduces "the task-ownership-transfer half of the
// transaction fails" without any production failure-injection hook — the
// second `updateMany`'s `WHERE assigneeId: fromUserId` clause simply won't
// match, exactly as it wouldn't in a genuine (if practically near-impossible,
// given the invariants — see DATABASE.md §8) production anomaly.

let app: Express;

beforeAll(() => {
  app = createApp(loadEnv());
});

beforeEach(async () => {
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
  return { accessToken: res.body.accessToken as string, userId: res.body.user.id as string };
}

async function createTask(token: string) {
  const res = await request(app)
    .post("/tasks")
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "Task" });
  return res.body;
}

describe("Acceptance transaction rollback audit (M11, Phase 8)", () => {
  it("rolls back the assignment's ACCEPTED transition when the task-ownership write's condition fails", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });

    // Call the real repository function directly against the real test DB,
    // with a `fromUserId` that does NOT match the task's actual current
    // assigneeId — the second write's WHERE clause (`assigneeId: fromUserId`)
    // will therefore match zero rows, exactly as it would if the task's
    // assigneeId had somehow already changed out from under this
    // transaction.
    const result = await taskAssignmentRepository.acceptPendingAssignment({
      id: created.body.id,
      taskId: task.id,
      fromUserId: "not-the-real-sender",
      toUserId: daniel.userId,
      scheduledAt: null,
    });

    // The function reports failure...
    expect(result).toBeNull();

    // ...and critically, the FIRST write (assignment -> ACCEPTED) was rolled
    // back too, not left dangling — this is the entire point of using one
    // interactive transaction instead of two independent statements.
    const assignment = await prisma.taskAssignment.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(assignment.status).toBe("PENDING");
    expect(assignment.respondedAt).toBeNull();

    const storedTask = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(storedTask.assigneeId).toBe(rami.userId);
    expect(storedTask.scheduledAt).toBeNull();

    // The assignment is still genuinely PENDING — a real accept (with the
    // correct fromUserId) still works afterward, proving nothing was left
    // in a half-resolved state.
    const realAccept = await request(app)
      .post(`/assignments/${created.body.id}/accept`)
      .set("Authorization", `Bearer ${daniel.accessToken}`)
      .send({ scheduledAt: null });
    expect(realAccept.status).toBe(200);
  });

  it("does not commit scheduledAt either when the transaction rolls back", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);
    const created = await request(app)
      .post(`/tasks/${task.id}/assignments`)
      .set("Authorization", `Bearer ${rami.accessToken}`)
      .send({ toUserId: daniel.userId });

    await taskAssignmentRepository.acceptPendingAssignment({
      id: created.body.id,
      taskId: task.id,
      fromUserId: "not-the-real-sender",
      toUserId: daniel.userId,
      scheduledAt: new Date("2026-09-26T14:00:00.000Z"),
    });

    const storedTask = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(storedTask.scheduledAt).toBeNull();
  });

  it("a nonexistent assignment id also yields null (no partial task write)", async () => {
    const rami = await registerUser("rami@example.com", "Rami");
    const daniel = await registerUser("daniel@example.com", "Daniel");
    const task = await createTask(rami.accessToken);

    const result = await taskAssignmentRepository.acceptPendingAssignment({
      id: "does-not-exist",
      taskId: task.id,
      fromUserId: rami.userId,
      toUserId: daniel.userId,
      scheduledAt: null,
    });

    expect(result).toBeNull();
    const storedTask = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(storedTask.assigneeId).toBe(rami.userId);
  });
});

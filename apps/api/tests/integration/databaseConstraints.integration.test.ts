import { prisma } from "../../src/lib/prisma";

// Phase 13 (M11): the partial unique index behind FR-21 is invisible to
// Prisma's schema DSL (see DATABASE.md §8) — `prisma migrate status`
// reports the migration as applied, but that only proves the migration
// *ran*, not that this specific hand-written index still exists in the
// live database. This queries Postgres directly (via $queryRaw, not a
// manual psql session) so the check is a durable, repeatable part of the
// suite rather than a one-time manual verification that can silently rot.

interface IndexRow {
  indexname: string;
  indexdef: string;
}

interface ConstraintRow {
  conname: string;
  confdeltype: string;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Database constraint audit (M11, Phase 13)", () => {
  it("the TaskAssignment_one_pending_per_task partial unique index exists", async () => {
    const rows = await prisma.$queryRaw<IndexRow[]>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'TaskAssignment' AND indexname = 'TaskAssignment_one_pending_per_task'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]!.indexdef).toContain('UNIQUE INDEX "TaskAssignment_one_pending_per_task"');
    expect(rows[0]!.indexdef).toContain('("taskId")');
    expect(rows[0]!.indexdef).toMatch(/WHERE \(status = 'PENDING'/);
  });

  it("all documented TaskAssignment indexes exist", async () => {
    const rows = await prisma.$queryRaw<IndexRow[]>`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'TaskAssignment'
    `;
    const names = rows.map((r) => r.indexname).sort();

    expect(names).toEqual(
      [
        "TaskAssignment_pkey",
        "TaskAssignment_fromUserId_status_idx",
        "TaskAssignment_toUserId_status_idx",
        "TaskAssignment_taskId_status_idx",
        "TaskAssignment_one_pending_per_task",
      ].sort(),
    );
  });

  it("TaskAssignment.taskId cascades on Task deletion; fromUserId/toUserId restrict on User deletion", async () => {
    const rows = await prisma.$queryRaw<ConstraintRow[]>`
      SELECT conname, confdeltype FROM pg_constraint
      WHERE conrelid = '"TaskAssignment"'::regclass AND contype = 'f'
    `;
    const byName = Object.fromEntries(rows.map((r) => [r.conname, r.confdeltype]));

    expect(byName["TaskAssignment_taskId_fkey"]).toBe("c"); // CASCADE
    expect(byName["TaskAssignment_fromUserId_fkey"]).toBe("r"); // RESTRICT
    expect(byName["TaskAssignment_toUserId_fkey"]).toBe("r"); // RESTRICT
  });

  it("User.email and User.username are both unique", async () => {
    const rows = await prisma.$queryRaw<IndexRow[]>`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'User'
    `;
    const uniqueIndexes = rows.filter((r) => r.indexdef.includes("UNIQUE"));
    const names = uniqueIndexes.map((r) => r.indexname);

    expect(names).toContain("User_email_key");
    expect(names).toContain("User_username_key");
  });

  it("all documented Task indexes exist", async () => {
    const rows = await prisma.$queryRaw<IndexRow[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'Task'
    `;
    const names = rows.map((r) => r.indexname).sort();

    expect(names).toEqual(
      [
        "Task_pkey",
        "Task_assigneeId_status_idx",
        "Task_assigneeId_scheduledAt_idx",
        "Task_assigneeId_deadline_idx",
        "Task_assigneeId_category_idx",
        "Task_creatorId_idx",
      ].sort(),
    );
  });

  it("Task.assigneeId/creatorId restrict on User deletion (a user with tasks cannot be hard-deleted out from under them)", async () => {
    const rows = await prisma.$queryRaw<ConstraintRow[]>`
      SELECT conname, confdeltype FROM pg_constraint
      WHERE conrelid = '"Task"'::regclass AND contype = 'f'
    `;
    const byName = Object.fromEntries(rows.map((r) => [r.conname, r.confdeltype]));

    expect(byName["Task_assigneeId_fkey"]).toBe("r");
    expect(byName["Task_creatorId_fkey"]).toBe("r");
  });
});

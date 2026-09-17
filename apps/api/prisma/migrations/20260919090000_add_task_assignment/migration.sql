-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "TaskAssignment" (
    "id" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "taskId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskAssignment_taskId_status_idx" ON "TaskAssignment"("taskId", "status");

-- CreateIndex
CREATE INDEX "TaskAssignment_toUserId_status_idx" ON "TaskAssignment"("toUserId", "status");

-- CreateIndex
CREATE INDEX "TaskAssignment_fromUserId_status_idx" ON "TaskAssignment"("fromUserId", "status");

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-added (not expressible in Prisma's schema.prisma DSL, which has no
-- partial/filtered unique index syntax): enforces "at most one PENDING
-- assignment per task" (FR-21) as an actual database constraint, not just a
-- service-layer check. This is what makes duplicate-PENDING-creation safe
-- under concurrent requests regardless of transaction timing/isolation
-- level — see docs/DATABASE.md and the M8 report for the full rationale.
CREATE UNIQUE INDEX "TaskAssignment_one_pending_per_task"
  ON "TaskAssignment" ("taskId")
  WHERE "status" = 'PENDING';

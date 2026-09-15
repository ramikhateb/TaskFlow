-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "category" TEXT,
ADD COLUMN     "deadline" TIMESTAMP(3),
ADD COLUMN     "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Task_assigneeId_scheduledAt_idx" ON "Task"("assigneeId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Task_assigneeId_deadline_idx" ON "Task"("assigneeId", "deadline");

-- CreateIndex
CREATE INDEX "Task_assigneeId_category_idx" ON "Task"("assigneeId", "category");

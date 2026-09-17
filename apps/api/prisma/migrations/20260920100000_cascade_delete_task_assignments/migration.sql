-- M8 follow-up: deleting a task is only reachable once it has no PENDING
-- assignment (FR-13/EC-5, enforced in taskRepository.deleteIfNotPending),
-- so by the time a delete succeeds, any remaining TaskAssignment rows for it
-- are pure history (CANCELLED, or a future ACCEPTED/DECLINED). EC-7 requires
-- that history be removed along with the task rather than blocking deletion
-- outright (the original ON DELETE RESTRICT would have done the latter).

-- DropForeignKey
ALTER TABLE "TaskAssignment" DROP CONSTRAINT "TaskAssignment_taskId_fkey";

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

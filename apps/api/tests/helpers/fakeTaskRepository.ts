import { randomUUID } from "node:crypto";
import type { Task } from "@prisma/client";
import type { TaskRepository } from "../../src/services/taskService";

/**
 * In-memory stand-in for the Prisma-backed task repository, matching its
 * interface exactly, so taskService can be unit tested with no database.
 *
 * `satisfies TaskRepository` (not a `: TaskRepository` annotation) so the
 * returned object keeps its full inferred type, including the plain
 * `update` convenience method below that isn't part of TaskRepository —
 * assignmentService's unit tests use it directly to set up fixtures (e.g.
 * flipping a task straight to DONE) without going through taskService's own
 * rules. taskService itself only ever consumes this through the narrower
 * `TaskRepository` interface, still checked here via `satisfies`.
 *
 * `pendingTaskIds` simulates the real database's view of "does this task
 * have a PENDING assignment" for updateIfNotPending/deleteIfNotPending —
 * exposed so a test can mark/unmark a task pending directly at the
 * repository level, independent of whatever a PendingAssignmentRepository
 * fake reports. That independence matters for FR-13/EC-5 (see the M8
 * follow-up report): the real guarantee is this atomic layer, not a
 * service-level pre-check, and a test proving the repository still blocks
 * even when a (hypothetically stale/bypassed) pre-check wouldn't have is
 * exactly the "don't rely solely on a service-level check" property.
 */
export function createFakeTaskRepository() {
  const tasks: Task[] = [];
  const pendingTaskIds = new Set<string>();

  const core = {
    async findById(id: string) {
      return tasks.find((t) => t.id === id) ?? null;
    },
    async findManyByAssignee(assigneeId, filters = {}) {
      const q = filters.q?.toLowerCase();
      return tasks.filter(
        (t) =>
          t.assigneeId === assigneeId &&
          (!filters.status || t.status === filters.status) &&
          (!filters.priority || t.priority === filters.priority) &&
          (!filters.category || t.category === filters.category) &&
          (!q ||
            t.title.toLowerCase().includes(q) ||
            (t.description !== null && t.description.toLowerCase().includes(q))),
      );
    },
    async create(data) {
      const task: Task = {
        id: randomUUID(),
        title: data.title,
        description: data.description,
        status: "TODO",
        priority: data.priority,
        category: data.category,
        scheduledAt: data.scheduledAt,
        deadline: data.deadline,
        creatorId: data.creatorId,
        assigneeId: data.assigneeId,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      tasks.push(task);
      return task;
    },
    async updateIfNotPending(id, data) {
      const task = tasks.find((t) => t.id === id);
      if (!task || pendingTaskIds.has(id)) return null;
      Object.assign(task, data, { updatedAt: new Date() });
      return task;
    },
    async deleteIfNotPending(id) {
      const index = tasks.findIndex((t) => t.id === id);
      if (index === -1 || pendingTaskIds.has(id)) return false;
      tasks.splice(index, 1);
      return true;
    },
    async findRelevantForToday(assigneeId, from, to) {
      return tasks.filter(
        (t) =>
          t.assigneeId === assigneeId &&
          t.status !== "CANCELLED" &&
          ((t.scheduledAt !== null && t.scheduledAt >= from && t.scheduledAt < to) ||
            (t.deadline !== null && t.deadline < to)),
      );
    },
    async findManyByAssigneeAndScheduledRange(assigneeId, from, to) {
      return tasks
        .filter(
          (t) =>
            t.assigneeId === assigneeId &&
            t.status !== "CANCELLED" &&
            t.scheduledAt !== null &&
            t.scheduledAt >= from &&
            t.scheduledAt < to,
        )
        .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime());
    },
  } satisfies TaskRepository;

  const taskRepository = {
    ...core,
    // Not part of TaskRepository — a plain, unconditional update used only
    // by assignmentService.test.ts to set up fixtures (e.g. flipping a task
    // straight to DONE) directly, bypassing taskService's own rules.
    async update(id: string, data: Partial<Task>): Promise<Task> {
      const task = tasks.find((t) => t.id === id);
      if (!task) throw new Error("not found");
      Object.assign(task, data, { updatedAt: new Date() });
      return task;
    },
  };

  return { tasks, taskRepository, pendingTaskIds };
}

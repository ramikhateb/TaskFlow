import { randomUUID } from "node:crypto";
import type { Task } from "@prisma/client";
import type { TaskRepository } from "../../src/services/taskService";

/**
 * In-memory stand-in for the Prisma-backed task repository, matching its
 * interface exactly, so taskService can be unit tested with no database.
 */
export function createFakeTaskRepository() {
  const tasks: Task[] = [];

  const taskRepository: TaskRepository = {
    async findById(id) {
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
    async update(id, data) {
      const task = tasks.find((t) => t.id === id);
      if (!task) throw new Error("not found");
      Object.assign(task, data, { updatedAt: new Date() });
      return task;
    },
    async deleteById(id) {
      const index = tasks.findIndex((t) => t.id === id);
      if (index === -1) throw new Error("not found");
      const [deleted] = tasks.splice(index, 1);
      return deleted!;
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
  };

  return { tasks, taskRepository };
}

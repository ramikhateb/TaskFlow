import type { Task } from "@prisma/client";
import { prisma } from "../lib/prisma";

export function findById(id: string): Promise<Task | null> {
  return prisma.task.findUnique({ where: { id } });
}

/** Own tasks, per FR-16: keyed by assigneeId, the current responsible party. */
export function findManyByAssignee(assigneeId: string): Promise<Task[]> {
  return prisma.task.findMany({
    where: { assigneeId },
    orderBy: { createdAt: "desc" },
  });
}

export function create(data: {
  title: string;
  description: string | null;
  priority: Task["priority"];
  category: string | null;
  scheduledAt: Date | null;
  deadline: Date | null;
  creatorId: string;
  assigneeId: string;
}): Promise<Task> {
  return prisma.task.create({ data });
}

export function update(
  id: string,
  data: Partial<{
    title: string;
    description: string | null;
    status: Task["status"];
    priority: Task["priority"];
    category: string | null;
    scheduledAt: Date | null;
    deadline: Date | null;
    completedAt: Date | null;
  }>,
): Promise<Task> {
  return prisma.task.update({ where: { id }, data });
}

export function deleteById(id: string): Promise<Task> {
  return prisma.task.delete({ where: { id } });
}

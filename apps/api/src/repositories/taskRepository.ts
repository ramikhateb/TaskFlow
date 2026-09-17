import type { Task } from "@prisma/client";
import { prisma } from "../lib/prisma";

export function findById(id: string): Promise<Task | null> {
  return prisma.task.findUnique({ where: { id } });
}

export interface TaskListFilters {
  status?: Task["status"];
  priority?: Task["priority"];
  /** Exact match, per REQUIREMENTS.md EC-12 — category has no fixed vocabulary. */
  category?: string;
  /** Case-insensitive substring match against title OR description. */
  q?: string;
}

/**
 * Own tasks, per FR-16: keyed by assigneeId, the current responsible party.
 * All filters are applied in the query itself (never fetch-then-filter in
 * JS) and combine with AND — Prisma ANDs sibling `where` keys by default, so
 * `status`/`priority`/`category` each narrow independently, while `q`'s
 * title-OR-description match is scoped inside its own `OR` array rather than
 * widening the whole query.
 */
export function findManyByAssignee(
  assigneeId: string,
  filters: TaskListFilters = {},
): Promise<Task[]> {
  return prisma.task.findMany({
    where: {
      assigneeId,
      ...(filters.status && { status: filters.status }),
      ...(filters.priority && { priority: filters.priority }),
      ...(filters.category && { category: filters.category }),
      ...(filters.q && {
        OR: [
          { title: { contains: filters.q, mode: "insensitive" } },
          { description: { contains: filters.q, mode: "insensitive" } },
        ],
      }),
    },
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

/**
 * Candidate set for the Today view (FR-14): CANCELLED tasks are excluded
 * entirely (never useful for planning), and everything with a scheduledAt in
 * [from, to) or a deadline before `to` is fetched — the latter deliberately
 * unbounded below so old overdue tasks aren't missed. Actual bucket
 * classification (overdue vs. scheduled-today vs. due-today) is business
 * logic and happens in taskService.classifyForToday, not here.
 */
export function findRelevantForToday(assigneeId: string, from: Date, to: Date): Promise<Task[]> {
  return prisma.task.findMany({
    where: {
      assigneeId,
      status: { not: "CANCELLED" },
      OR: [{ scheduledAt: { gte: from, lt: to } }, { deadline: { lt: to } }],
    },
  });
}

/** Schedule view (FR-15): own tasks with scheduledAt in [from, to), chronological. */
export function findManyByAssigneeAndScheduledRange(
  assigneeId: string,
  from: Date,
  to: Date,
): Promise<Task[]> {
  return prisma.task.findMany({
    where: {
      assigneeId,
      status: { not: "CANCELLED" },
      scheduledAt: { gte: from, lt: to },
    },
    orderBy: { scheduledAt: "asc" },
  });
}

import type { Task, TaskPriority, TaskStatus } from "@prisma/client";
import type { CreateTaskRequest, TaskResponse, UpdateTaskRequest } from "@taskflow/shared";
import { ConflictError, NotFoundError } from "../errors";

// Narrow interface (matching the repository module's shape) so this service
// can be unit tested against a fake, with no Prisma import here at all.
export interface TaskRepository {
  findById(id: string): Promise<Task | null>;
  findManyByAssignee(assigneeId: string): Promise<Task[]>;
  create(data: {
    title: string;
    description: string | null;
    priority: TaskPriority;
    category: string | null;
    scheduledAt: Date | null;
    deadline: Date | null;
    creatorId: string;
    assigneeId: string;
  }): Promise<Task>;
  update(
    id: string,
    data: Partial<{
      title: string;
      description: string | null;
      status: TaskStatus;
      priority: TaskPriority;
      category: string | null;
      scheduledAt: Date | null;
      deadline: Date | null;
      completedAt: Date | null;
    }>,
  ): Promise<Task>;
  deleteById(id: string): Promise<Task>;
}

export interface TaskServiceDeps {
  taskRepository: TaskRepository;
}

// Product decision (2026-09-15): TODO, IN_PROGRESS, and DONE are fully
// interchangeable — an everyday to-do task shouldn't have to pass through
// IN_PROGRESS to be completed, or to be reopened. CANCELLED remains a
// terminal state reachable from any of the three.
const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  TODO: ["IN_PROGRESS", "DONE", "CANCELLED"],
  IN_PROGRESS: ["TODO", "DONE", "CANCELLED"],
  DONE: ["TODO", "IN_PROGRESS", "CANCELLED"],
  CANCELLED: [],
};

export function isValidStatusTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true; // no-op PATCH is fine
  return ALLOWED_TRANSITIONS[from].includes(to);
}

// FR-8/EC-13: scheduledAt and deadline are independent — either, both, or
// neither may be set — but when both are present, deadline must be on or
// after scheduledAt. Checked against the task's *resulting* complete state,
// so a PATCH that touches only one of the two fields is validated against
// whichever value (new or already-stored) the other field currently holds.
export function isScheduleValid(scheduledAt: Date | null, deadline: Date | null): boolean {
  if (scheduledAt === null || deadline === null) return true;
  return deadline.getTime() >= scheduledAt.getTime();
}

function toTaskResponse(task: Task): TaskResponse {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    category: task.category,
    scheduledAt: task.scheduledAt?.toISOString() ?? null,
    deadline: task.deadline?.toISOString() ?? null,
    creatorId: task.creatorId,
    assigneeId: task.assigneeId,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function createTaskService({ taskRepository }: TaskServiceDeps) {
  // M3 is self-owned only (no TaskAssignment yet — ROADMAP.md M3), so every
  // authorization check here is keyed on assigneeId alone, per DATABASE.md's
  // invariant that assigneeId is the sole source of truth for who's
  // responsible. A task that exists but isn't the caller's own is reported
  // as NotFoundError, not ForbiddenError, so its existence isn't confirmed
  // to a caller with no relationship to it (ARCHITECTURE.md §4).
  async function findOwnTaskOrThrow(userId: string, taskId: string): Promise<Task> {
    const task = await taskRepository.findById(taskId);
    if (!task || task.assigneeId !== userId) {
      throw new NotFoundError("Task not found");
    }
    return task;
  }

  async function listOwnTasks(userId: string): Promise<TaskResponse[]> {
    const tasks = await taskRepository.findManyByAssignee(userId);
    return tasks.map(toTaskResponse);
  }

  async function createTask(userId: string, input: CreateTaskRequest): Promise<TaskResponse> {
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    const deadline = input.deadline ? new Date(input.deadline) : null;

    if (!isScheduleValid(scheduledAt, deadline)) {
      throw new ConflictError("deadline must be on or after scheduledAt");
    }

    // creatorId/assigneeId always come from the verified access token, never
    // from the request body — CreateTaskRequest has no such fields at all.
    const task = await taskRepository.create({
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? "MEDIUM",
      category: input.category ?? null,
      scheduledAt,
      deadline,
      creatorId: userId,
      assigneeId: userId,
    });
    return toTaskResponse(task);
  }

  async function getTask(userId: string, taskId: string): Promise<TaskResponse> {
    const task = await findOwnTaskOrThrow(userId, taskId);
    return toTaskResponse(task);
  }

  async function updateTask(
    userId: string,
    taskId: string,
    input: UpdateTaskRequest,
  ): Promise<TaskResponse> {
    const task = await findOwnTaskOrThrow(userId, taskId);

    if (input.status !== undefined && !isValidStatusTransition(task.status, input.status)) {
      throw new ConflictError(`Cannot transition task from ${task.status} to ${input.status}`);
    }

    // Resulting state, not just the incoming partial payload: a PATCH that
    // only touches one of scheduledAt/deadline must still be validated
    // against whatever the other one currently is on the stored task.
    const resultingScheduledAt =
      input.scheduledAt !== undefined
        ? input.scheduledAt === null
          ? null
          : new Date(input.scheduledAt)
        : task.scheduledAt;
    const resultingDeadline =
      input.deadline !== undefined
        ? input.deadline === null
          ? null
          : new Date(input.deadline)
        : task.deadline;

    if (!isScheduleValid(resultingScheduledAt, resultingDeadline)) {
      throw new ConflictError("deadline must be on or after scheduledAt");
    }

    const updated = await taskRepository.update(taskId, {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.scheduledAt !== undefined && { scheduledAt: resultingScheduledAt }),
      ...(input.deadline !== undefined && { deadline: resultingDeadline }),
      ...(input.status !== undefined && {
        status: input.status,
        completedAt: input.status === "DONE" ? new Date() : null,
      }),
    });
    return toTaskResponse(updated);
  }

  async function deleteTask(userId: string, taskId: string): Promise<void> {
    await findOwnTaskOrThrow(userId, taskId);
    await taskRepository.deleteById(taskId);
  }

  return { listOwnTasks, createTask, getTask, updateTask, deleteTask };
}

export type TaskService = ReturnType<typeof createTaskService>;

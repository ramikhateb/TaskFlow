import type { Task, TaskStatus } from "@prisma/client";
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
    creatorId: string;
    assigneeId: string;
  }): Promise<Task>;
  update(
    id: string,
    data: Partial<{
      title: string;
      description: string | null;
      status: TaskStatus;
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

function toTaskResponse(task: Task): TaskResponse {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
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
    // creatorId/assigneeId always come from the verified access token, never
    // from the request body — CreateTaskRequest has no such fields at all.
    const task = await taskRepository.create({
      title: input.title,
      description: input.description ?? null,
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

    const updated = await taskRepository.update(taskId, {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
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

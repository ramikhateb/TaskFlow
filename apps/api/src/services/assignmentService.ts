import type { Task, TaskAssignment, User } from "@prisma/client";
import type { CreateTaskAssignmentRequest, TaskAssignmentResponse } from "@taskflow/shared";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { toAssignmentResponse } from "../mappers/assignmentResponse";
import { DuplicatePendingAssignmentError } from "../repositories/taskAssignmentRepository";

type TaskAssignmentWithUsers = TaskAssignment & { fromUser: User; toUser: User };

// Narrow interfaces (matching the repository modules' shape) so this
// service can be unit tested against fakes, with no Prisma import here —
// same pattern as taskService/authService/userService.
export interface TaskAssignmentRepository {
  findById(id: string): Promise<TaskAssignmentWithUsers | null>;
  findPendingByTaskId(taskId: string): Promise<TaskAssignmentWithUsers | null>;
  create(data: {
    taskId: string;
    fromUserId: string;
    toUserId: string;
    message: string | null;
  }): Promise<TaskAssignmentWithUsers>;
  cancelIfPending(id: string): Promise<TaskAssignmentWithUsers | null>;
}

export interface TaskLookupRepository {
  findById(id: string): Promise<Task | null>;
}

export interface UserLookupRepository {
  findById(id: string): Promise<User | null>;
}

export interface AssignmentServiceDeps {
  assignmentRepository: TaskAssignmentRepository;
  taskRepository: TaskLookupRepository;
  userRepository: UserLookupRepository;
}

// FR-... (M8): only active tasks can be sent. A DONE/CANCELLED task has
// nothing left to hand off.
const ASSIGNABLE_STATUSES = new Set<Task["status"]>(["TODO", "IN_PROGRESS"]);

export function createAssignmentService({
  assignmentRepository,
  taskRepository,
  userRepository,
}: AssignmentServiceDeps) {
  async function createAssignment(
    callerId: string,
    taskId: string,
    input: CreateTaskAssignmentRequest,
  ): Promise<TaskAssignmentResponse> {
    const task = await taskRepository.findById(taskId);
    // Same enumeration-resistance rule as task CRUD (M3): a task that
    // exists but isn't the caller's own is reported identically to one
    // that doesn't exist — "who may send" is Task.assigneeId, never
    // creatorId (a creator who handed the task off has no standing to
    // resend it themselves).
    if (!task || task.assigneeId !== callerId) {
      throw new NotFoundError("Task not found");
    }

    if (!ASSIGNABLE_STATUSES.has(task.status)) {
      throw new ConflictError("Only active tasks (TODO or IN_PROGRESS) can be assigned");
    }

    // EC-1: documented as a validation error, even though it can only be
    // checked here — against the verified caller identity — not in the
    // shared Zod schema, which never sees who's calling.
    if (input.toUserId === callerId) {
      throw new ValidationError("You cannot assign a task to yourself");
    }

    // EC-2: the API trusts/validates the recipient id, never a
    // client-supplied username string.
    const recipient = await userRepository.findById(input.toUserId);
    if (!recipient) {
      throw new NotFoundError("Recipient not found");
    }

    // Fast, friendly pre-check (FR-21/EC-4). Not the actual concurrency
    // guarantee — see the try/catch below and schema.prisma's partial
    // unique index for that.
    const existingPending = await assignmentRepository.findPendingByTaskId(taskId);
    if (existingPending) {
      throw new ConflictError("This task already has a pending assignment");
    }

    try {
      const created = await assignmentRepository.create({
        taskId,
        fromUserId: callerId,
        toUserId: input.toUserId,
        message: input.message ?? null,
      });
      return toAssignmentResponse(created);
    } catch (error) {
      // Two requests can both pass the pre-check above; only one INSERT can
      // win against the partial unique index. The loser lands here.
      if (error instanceof DuplicatePendingAssignmentError) {
        throw new ConflictError("This task already has a pending assignment");
      }
      throw error;
    }
  }

  async function cancelAssignment(
    callerId: string,
    taskId: string,
    assignmentId: string,
  ): Promise<TaskAssignmentResponse> {
    const assignment = await assignmentRepository.findById(assignmentId);
    // Visibility gate mirrors taskService.findOwnTaskOrThrow: wrong id,
    // wrong task, or wrong sender are all reported identically so none of
    // them confirms anything about an assignment the caller can't act on.
    if (!assignment || assignment.taskId !== taskId || assignment.fromUserId !== callerId) {
      throw new NotFoundError("Assignment not found");
    }

    const cancelled = await assignmentRepository.cancelIfPending(assignmentId);
    if (!cancelled) {
      // Already ACCEPTED/DECLINED/CANCELLED — a state conflict, not a
      // visibility problem (the caller does own this assignment).
      throw new ConflictError("This assignment is no longer pending");
    }
    return toAssignmentResponse(cancelled);
  }

  // Note: no getPendingForTask here — GET /tasks/:id's pendingAssignment
  // field is built by taskService directly from the assignment repository
  // (a repository-level dependency, not this service), so the task-detail
  // read path never depends on AssignmentService at all. See the M8
  // follow-up report ("keep controllers thin") for why.

  return { createAssignment, cancelAssignment };
}

export type AssignmentService = ReturnType<typeof createAssignmentService>;

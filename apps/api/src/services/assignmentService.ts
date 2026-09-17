import type { Task, User } from "@prisma/client";
import type {
  AcceptTaskAssignmentRequest,
  CreateTaskAssignmentRequest,
  InboxResponse,
  SentAssignmentsResponse,
  TaskAssignmentResponse,
} from "@taskflow/shared";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { isScheduleValid } from "../lib/scheduling";
import {
  toAssignmentResponse,
  toInboxAssignmentResponse,
  toSentAssignmentResponse,
} from "../mappers/assignmentResponse";
import {
  DuplicatePendingAssignmentError,
  type TaskAssignmentWithUsers,
} from "../repositories/taskAssignmentRepository";

// Narrow interfaces (matching the repository modules' shape) so this
// service can be unit tested against fakes, with no Prisma import here —
// same pattern as taskService/authService/userService.
export interface TaskAssignmentRepository {
  findById(id: string): Promise<TaskAssignmentWithUsers | null>;
  findPendingByTaskId(taskId: string): Promise<TaskAssignmentWithUsers | null>;
  findInboxForRecipient(toUserId: string): Promise<TaskAssignmentWithUsers[]>;
  findSentByUser(fromUserId: string): Promise<TaskAssignmentWithUsers[]>;
  create(data: {
    taskId: string;
    fromUserId: string;
    toUserId: string;
    message: string | null;
  }): Promise<TaskAssignmentWithUsers>;
  cancelIfPending(id: string): Promise<TaskAssignmentWithUsers | null>;
  declineIfPending(id: string): Promise<TaskAssignmentWithUsers | null>;
  acceptPendingAssignment(params: {
    id: string;
    taskId: string;
    fromUserId: string;
    toUserId: string;
    scheduledAt: Date | null;
  }): Promise<TaskAssignmentWithUsers | null>;
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

  // FR-26/FR-27 (M9): only the recipient may decline, only while PENDING.
  // Declining never touches Task at all (assigneeId was never changed by
  // create, so there's nothing to revert) — a pure TaskAssignment state
  // change, same shape as cancelAssignment above. Once this commits, the
  // sender's task is unfrozen again (TaskService's freeze check simply
  // finds no PENDING row anymore).
  async function declineAssignment(
    callerId: string,
    assignmentId: string,
  ): Promise<TaskAssignmentResponse> {
    const assignment = await assignmentRepository.findById(assignmentId);
    // Same enumeration-resistance pattern as cancelAssignment: wrong id,
    // or a real assignment the caller isn't the recipient of, are reported
    // identically.
    if (!assignment || assignment.toUserId !== callerId) {
      throw new NotFoundError("Assignment not found");
    }

    const declined = await assignmentRepository.declineIfPending(assignmentId);
    if (!declined) {
      // Already ACCEPTED/DECLINED/CANCELLED — a state conflict, not a
      // visibility problem (the caller does own this assignment).
      throw new ConflictError("This assignment is no longer pending");
    }
    return toAssignmentResponse(declined);
  }

  // FR-25/FR-30 (M9): the only transition that ever writes Task.assigneeId,
  // and the only one where the recipient supplies input beyond "which
  // assignment" — their scheduling choice. See
  // taskAssignmentRepository.acceptPendingAssignment for the transaction
  // itself and the M9 report for the concurrency argument; this method's
  // job is authorization (recipient, still PENDING) and validating that
  // choice against FR-8/EC-13 before ever attempting the transactional
  // write.
  async function acceptAssignment(
    callerId: string,
    assignmentId: string,
    input: AcceptTaskAssignmentRequest,
  ): Promise<TaskAssignmentResponse> {
    const assignment = await assignmentRepository.findById(assignmentId);
    if (!assignment || assignment.toUserId !== callerId) {
      throw new NotFoundError("Assignment not found");
    }
    // Fast, friendly pre-check (EC-3) — not the concurrency guarantee; see
    // acceptPendingAssignment's own atomic conditional update for that.
    if (assignment.status !== "PENDING") {
      throw new ConflictError("This assignment is no longer pending");
    }

    // FR-30: null means "Schedule later" — the sender's previous
    // scheduledAt (on assignment.task) is never read or carried over here,
    // which is precisely how it's prevented from transferring: the new
    // value comes only from the recipient's own request body.
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;

    // EC-13, preserved: the recipient can't schedule past the task's
    // existing deadline (set by the creator/sender, unchanged by
    // acceptance — FR-31). "Schedule later" (null) always passes, since
    // isScheduleValid treats either side being null as valid.
    if (!isScheduleValid(scheduledAt, assignment.task.deadline)) {
      throw new ConflictError("scheduledAt must be on or before the task's deadline");
    }

    const accepted = await assignmentRepository.acceptPendingAssignment({
      id: assignmentId,
      taskId: assignment.taskId,
      fromUserId: assignment.fromUserId,
      toUserId: callerId,
      scheduledAt,
    });
    if (!accepted) {
      // Lost the race to a concurrent cancel/decline/second-accept — see
      // the M9 report's concurrency section.
      throw new ConflictError("This assignment is no longer pending");
    }
    return toAssignmentResponse(accepted);
  }

  // FR-28: incoming PENDING requests only, newest first, scoped
  // exclusively to the authenticated caller via toUserId — never a
  // client-supplied user id. Uses the existing @@index([toUserId, status])
  // query path (findInboxForRecipient), no pagination (out of scope for
  // M9 — a personal inbox of pending requests is not expected to grow
  // large enough to need it; see the M9 report if this changes).
  async function getInbox(callerId: string): Promise<InboxResponse> {
    const rows = await assignmentRepository.findInboxForRecipient(callerId);
    return { data: rows.map(toInboxAssignmentResponse) };
  }

  // FR-29 (M10): the sender's full history — every terminal status, not
  // just PENDING (that distinction from Inbox is the whole point: this is
  // "what happened to the requests I sent," not an actionable queue).
  // Scoped exclusively via fromUserId from the verified caller, same as
  // Inbox's toUserId — never a client-supplied user id.
  async function getSentAssignments(callerId: string): Promise<SentAssignmentsResponse> {
    const rows = await assignmentRepository.findSentByUser(callerId);
    return { data: rows.map(toSentAssignmentResponse) };
  }

  return {
    createAssignment,
    cancelAssignment,
    declineAssignment,
    acceptAssignment,
    getInbox,
    getSentAssignments,
  };
}

export type AssignmentService = ReturnType<typeof createAssignmentService>;

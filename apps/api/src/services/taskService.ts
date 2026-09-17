import type { Task, TaskPriority, TaskStatus, User } from "@prisma/client";
import type {
  CreateTaskRequest,
  DateRangeQuery,
  ListTasksQuery,
  TaskDetailResponse,
  TaskResponse,
  TodayResponse,
  UpdateTaskRequest,
} from "@taskflow/shared";
import { ConflictError, NotFoundError } from "../errors";
import { isScheduleValid } from "../lib/scheduling";
import { toAssignmentResponse, toPublicUser } from "../mappers/assignmentResponse";
import type { TaskAssignmentWithUsers } from "../repositories/taskAssignmentRepository";

// Narrow interface (matching the repository module's shape) so this service
// can be unit tested against a fake, with no Prisma import here at all.
export interface TaskListFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: string;
  q?: string;
}

export interface TaskRepository {
  findById(id: string): Promise<Task | null>;
  findManyByAssignee(assigneeId: string, filters?: TaskListFilters): Promise<Task[]>;
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
  updateIfNotPending(
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
  ): Promise<Task | null>;
  deleteIfNotPending(id: string): Promise<boolean>;
  findRelevantForToday(assigneeId: string, from: Date, to: Date): Promise<Task[]>;
  findManyByAssigneeAndScheduledRange(assigneeId: string, from: Date, to: Date): Promise<Task[]>;
}

// Narrow, repository-level dependency (FR-13/EC-5) — deliberately not a
// dependency on AssignmentService. taskService needs to know "is there a
// PENDING assignment for this task" for two purposes (freezing mutations,
// and building GET /tasks/:id's pendingAssignment field), and both are
// satisfied by this one read method. Depending on the repository directly,
// the same way AssignmentService depends on TaskLookupRepository/
// UserLookupRepository rather than on TaskService, keeps the two services
// decoupled from each other — neither imports the other, so there's no risk
// of a circular service dependency.
export interface PendingAssignmentRepository {
  findPendingByTaskId(taskId: string): Promise<TaskAssignmentWithUsers | null>;
}

// M10 (FR-32): the task-detail response identifies the assignee/creator by
// PublicUser (id/name/username — see PRODUCT.md "both remain visible on the
// task"), which needs a user lookup taskService didn't previously depend on.
// A narrow, repository-level interface — identical in shape to
// AssignmentService's own UserLookupRepository, but declared independently,
// per this architecture's "services never import each other" rule — rather
// than a dependency on UserService or AssignmentService.
export interface UserLookupRepository {
  findById(userId: string): Promise<User | null>;
}

export interface TaskServiceDeps {
  taskRepository: TaskRepository;
  assignmentRepository: PendingAssignmentRepository;
  userRepository: UserLookupRepository;
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

// FR-8/EC-13: checked against the task's *resulting* complete state, so a
// PATCH that touches only one of scheduledAt/deadline is validated against
// whichever value (new or already-stored) the other field currently holds.
// The rule itself now lives in ../lib/scheduling (M9: assignmentService
// needs it too, for validating the recipient's scheduling choice on
// accept) — re-exported here so existing imports of `isScheduleValid` from
// this module keep working unchanged.
export { isScheduleValid } from "../lib/scheduling";

// FR-14: scheduled-today ∪ due-today ∪ overdue, deduplicated. Centralized
// here (per M5's "avoid slightly different definitions of today/overdue
// across components") — the single source of truth for all three
// definitions, unit-testable in isolation with plain constructed tasks.
//
// Buckets are mutually exclusive by construction (overdue > scheduledToday >
// dueToday precedence), which is what "deduplicated" means in practice: a
// task that's both scheduled and due today, or overdue and also scheduled
// today, appears exactly once, in the highest-precedence bucket, carrying
// both its scheduledAt and deadline so the UI can still show both facts.
//
// CANCELLED tasks never appear (no planning value once cancelled). DONE
// tasks are excluded only from `overdue` (FR-12/FR-14: overdue explicitly
// requires the task not be DONE or CANCELLED) — a completed task that's
// scheduled/due today still appears in its natural bucket, left to the UI to
// render as completed (e.g. struck through), not hidden.
export function classifyForToday(
  tasks: Task[],
  now: Date,
  from: Date,
  to: Date,
): { overdue: Task[]; scheduledToday: Task[]; dueToday: Task[] } {
  const overdue: Task[] = [];
  const scheduledToday: Task[] = [];
  const dueToday: Task[] = [];

  const isWithin = (date: Date, start: Date, end: Date) =>
    date.getTime() >= start.getTime() && date.getTime() < end.getTime();

  for (const task of tasks) {
    if (task.status === "CANCELLED") continue;

    const isOverdue =
      task.status !== "DONE" && task.deadline !== null && task.deadline.getTime() < now.getTime();
    if (isOverdue) {
      overdue.push(task);
      continue;
    }

    if (task.scheduledAt !== null && isWithin(task.scheduledAt, from, to)) {
      scheduledToday.push(task);
      continue;
    }

    if (task.deadline !== null && isWithin(task.deadline, from, to)) {
      dueToday.push(task);
    }
  }

  return { overdue, scheduledToday, dueToday };
}

function sortByField(tasks: Task[], field: "scheduledAt" | "deadline"): Task[] {
  return [...tasks].sort((a, b) => (a[field]?.getTime() ?? 0) - (b[field]?.getTime() ?? 0));
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

export function createTaskService({
  taskRepository,
  assignmentRepository,
  userRepository,
}: TaskServiceDeps) {
  // Mutation authorization (PATCH/DELETE) — unchanged since M3, and
  // deliberately NOT widened by M10: creatorId must never substitute for
  // assigneeId here. Every check is keyed on assigneeId alone, per
  // DATABASE.md's invariant that assigneeId is the sole source of truth for
  // who's currently responsible. A task that exists but isn't the caller's
  // own is reported as NotFoundError, not ForbiddenError, so its existence
  // isn't confirmed to a caller with no relationship to it (ARCHITECTURE.md
  // §4).
  async function findOwnTaskOrThrow(userId: string, taskId: string): Promise<Task> {
    const task = await taskRepository.findById(taskId);
    if (!task || task.assigneeId !== userId) {
      throw new NotFoundError("Task not found");
    }
    return task;
  }

  // Read authorization (GET) — M10, FR-32: broader than mutation
  // authorization. The original creator retains permanent READ-ONLY
  // visibility after a transfer, so this additionally allows creatorId to
  // match. Used only by getTask/getTaskDetail below; updateTask/deleteTask
  // continue to call findOwnTaskOrThrow above, unchanged, so a creator can
  // never mutate a task they no longer hold.
  async function findVisibleTaskOrThrow(userId: string, taskId: string): Promise<Task> {
    const task = await taskRepository.findById(taskId);
    if (!task || (task.assigneeId !== userId && task.creatorId !== userId)) {
      throw new NotFoundError("Task not found");
    }
    return task;
  }

  // Filters are already validated/normalized by listTasksQuerySchema at the
  // API boundary (ARCHITECTURE.md §3) — this just forwards them to the
  // repository query. No interpretation happens here or in the controller,
  // so there's exactly one place search/filter semantics are decided.
  async function listOwnTasks(
    userId: string,
    filters: ListTasksQuery = {},
  ): Promise<TaskResponse[]> {
    const tasks = await taskRepository.findManyByAssignee(userId, filters);
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

  // M10: visible to assignee OR creator (findVisibleTaskOrThrow), not
  // assignee-only. Returns the RAW, unmasked TaskResponse — including the
  // real scheduledAt — regardless of which of the two the caller is.
  // Safe today because this has exactly one caller (getTaskDetail below,
  // which applies the creator-only scheduledAt mask before anything reaches
  // the HTTP response); it is NOT safe to wire a new caller directly to
  // this function for a possibly-creator-only viewer without that mask.
  async function getTask(userId: string, taskId: string): Promise<TaskResponse> {
    const task = await findVisibleTaskOrThrow(userId, taskId);
    return toTaskResponse(task);
  }

  // GET /tasks/:id: additively merges the task's current pending assignment
  // (M8), viewer capabilities and assignee/creator identity (M10), into the
  // detail response. Built here, not in the controller, and from
  // repository dependencies, not AssignmentService/UserService — see
  // PendingAssignmentRepository/UserLookupRepository above.
  async function getTaskDetail(userId: string, taskId: string): Promise<TaskDetailResponse> {
    const task = await getTask(userId, taskId);
    const isAssignee = task.assigneeId === userId;
    const isCreator = task.creatorId === userId;

    const [pending, assigneeUser, creatorUser] = await Promise.all([
      assignmentRepository.findPendingByTaskId(taskId),
      userRepository.findById(task.assigneeId),
      userRepository.findById(task.creatorId),
    ]);
    // Structurally impossible (Task.assigneeId/creatorId are required FKs)
    // but keeps this function total rather than fabricating a response.
    if (!assigneeUser || !creatorUser) {
      throw new NotFoundError("Task not found");
    }

    return {
      ...task,
      // M10: scheduledAt is the current assignee's personal planning
      // state — a creator-only viewer never sees the real value, even
      // though every other field (including deadline/priority/category)
      // is visible. See taskDetailResponseSchema's comment for why the
      // mobile client must key off `viewer.isAssignee`, not off whether
      // this happens to be null.
      scheduledAt: isAssignee ? task.scheduledAt : null,
      pendingAssignment: pending ? toAssignmentResponse(pending) : null,
      assignee: toPublicUser(assigneeUser),
      creator: toPublicUser(creatorUser),
      viewer: {
        isAssignee,
        isCreator,
        // Mutation rules are unchanged (findOwnTaskOrThrow/assertNotPending
        // below) — these two fields are that same rule reflected back to
        // the client, not a second, independent authorization decision.
        canEdit: isAssignee && pending === null,
        canDelete: isAssignee && pending === null,
      },
    };
  }

  // FR-13/EC-5: while a task has a PENDING assignment, the current assignee
  // still owns it (read access, Tasks/Today/Schedule visibility are all
  // untouched — see taskRepository's find* methods, none of which filter on
  // assignment state), but every mutation is frozen until the assignment is
  // resolved. This pre-check gives a clean, immediate error in the common
  // (non-racing) case; the actual guarantee is the atomic conditional write
  // in taskRepository.updateIfNotPending/deleteIfNotPending below — see the
  // M8 follow-up report for the concurrency analysis of the residual race
  // between this check and a concurrent assignment being created.
  async function assertNotPending(taskId: string): Promise<void> {
    const pending = await assignmentRepository.findPendingByTaskId(taskId);
    if (pending) {
      throw new ConflictError("Cannot modify a task while it has a pending assignment");
    }
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

    await assertNotPending(taskId);

    const updated = await taskRepository.updateIfNotPending(taskId, {
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
    if (!updated) {
      // A pending assignment was created between the pre-check above and
      // this write winning the race — the atomic WHERE clause (not this
      // service) is what actually caught it.
      throw new ConflictError("Cannot modify a task while it has a pending assignment");
    }
    return toTaskResponse(updated);
  }

  async function deleteTask(userId: string, taskId: string): Promise<void> {
    await findOwnTaskOrThrow(userId, taskId);
    await assertNotPending(taskId);

    const deleted = await taskRepository.deleteIfNotPending(taskId);
    if (!deleted) {
      throw new ConflictError("Cannot delete a task while it has a pending assignment");
    }
  }

  async function getToday(userId: string, range: DateRangeQuery): Promise<TodayResponse> {
    const from = new Date(range.from);
    const to = new Date(range.to);

    const candidates = await taskRepository.findRelevantForToday(userId, from, to);
    const { overdue, scheduledToday, dueToday } = classifyForToday(
      candidates,
      new Date(),
      from,
      to,
    );

    return {
      overdue: sortByField(overdue, "deadline").map(toTaskResponse),
      scheduledToday: sortByField(scheduledToday, "scheduledAt").map(toTaskResponse),
      dueToday: sortByField(dueToday, "deadline").map(toTaskResponse),
    };
  }

  async function getSchedule(userId: string, range: DateRangeQuery): Promise<TaskResponse[]> {
    const from = new Date(range.from);
    const to = new Date(range.to);

    const tasks = await taskRepository.findManyByAssigneeAndScheduledRange(userId, from, to);
    return tasks.map(toTaskResponse); // already ordered by scheduledAt asc (FR-15)
  }

  return {
    listOwnTasks,
    createTask,
    getTask,
    getTaskDetail,
    updateTask,
    deleteTask,
    getToday,
    getSchedule,
  };
}

export type TaskService = ReturnType<typeof createTaskService>;

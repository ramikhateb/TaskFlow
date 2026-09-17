import { z } from "zod";

// M3: title, description, status. M4 adds priority/category/scheduledAt/
// deadline (REQUIREMENTS.md FR-7/FR-8).
export const taskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

// Exactly three levels, per REQUIREMENTS.md FR-7.
export const taskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

const titleSchema = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(200, "Title must be at most 200 characters");

const descriptionSchema = z
  .string()
  .trim()
  .max(2000, "Description must be at most 2000 characters");

// REQUIREMENTS.md FR-7: category is trimmed, at most 100 characters, and
// rejected if blank after trimming — a category of `null` (on update) or
// omission (on create) means the task has no category at all.
const categorySchema = z
  .string()
  .trim()
  .min(1, "Category must not be blank")
  .max(100, "Category must be at most 100 characters");

// Wire format is always ISO 8601 UTC (ARCHITECTURE.md §3) — z.string().datetime()
// defaults to requiring the trailing "Z" (no numeric offset), matching that.
const isoDateTimeSchema = z
  .string()
  .datetime({ message: "Must be a valid ISO 8601 UTC date-time" });

// Status/priority aren't accepted on create — every task starts TODO/MEDIUM
// unless priority is explicitly given (FR-7 defaults).
export const createTaskRequestSchema = z.object({
  title: titleSchema,
  description: descriptionSchema.optional(),
  priority: taskPrioritySchema.optional(),
  category: categorySchema.optional(),
  scheduledAt: isoDateTimeSchema.optional(),
  deadline: isoDateTimeSchema.optional(),
});
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;

// null explicitly clears an optional field; omitted leaves it untouched.
export const updateTaskRequestSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema.nullable(),
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    category: categorySchema.nullable(),
    scheduledAt: isoDateTimeSchema.nullable(),
    deadline: isoDateTimeSchema.nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;

export const taskIdParamSchema = z.object({
  id: z.string().min(1, "id is required"),
});
export type TaskIdParam = z.infer<typeof taskIdParamSchema>;

// Wire format: timestamps are ISO 8601 UTC strings (ARCHITECTURE.md §3).
export const taskResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  category: z.string().nullable(),
  scheduledAt: z.string().nullable(),
  deadline: z.string().nullable(),
  creatorId: z.string(),
  assigneeId: z.string(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TaskResponse = z.infer<typeof taskResponseSchema>;

export const taskListResponseSchema = z.object({
  data: z.array(taskResponseSchema),
});
export type TaskListResponse = z.infer<typeof taskListResponseSchema>;

// M5 (FR-14/FR-15/FR-17, EC-8): the server has no notion of the caller's
// timezone, so both /tasks/today and /tasks/schedule require the client to
// supply the boundary instants explicitly, as UTC ISO strings. For /tasks/today
// these represent the device's local calendar day (midnight to midnight,
// converted to UTC — see apps/mobile/src/features/tasks/dateBoundaries.ts);
// for /tasks/schedule they're an arbitrary caller-chosen range. Same shape,
// reused for both rather than duplicated, since the semantics (an inclusive
// start / exclusive end UTC instant range) are identical.
export const dateRangeQuerySchema = z
  .object({
    from: isoDateTimeSchema,
    to: isoDateTimeSchema,
  })
  .refine((data) => new Date(data.to).getTime() > new Date(data.from).getTime(), {
    message: "to must be after from",
    path: ["to"],
  });
export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;

// FR-14: scheduled-today ∪ due-today ∪ overdue, deduplicated. A task never
// appears in more than one bucket — see taskService.classifyForToday for the
// precedence rule (overdue > scheduledToday > dueToday) that guarantees this.
export const todayResponseSchema = z.object({
  overdue: z.array(taskResponseSchema),
  scheduledToday: z.array(taskResponseSchema),
  dueToday: z.array(taskResponseSchema),
});
export type TodayResponse = z.infer<typeof todayResponseSchema>;

// M6 (FR-16): GET /tasks list filters, all optional and AND-combined —
// omitting all of them is exactly today's unfiltered "list my own tasks".
// category/q tolerate an empty/whitespace value (e.g. a UI control reset to
// "" rather than omitted) by collapsing it to "no filter" rather than a 400,
// which is what makes "clear this one filter" a no-op-safe request to send.
// status/priority stay strict enums — an invalid value is always a genuine
// client error, never something to silently ignore.
const optionalTrimmedString = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === "" ? undefined : value));

export const listTasksQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  category: optionalTrimmedString(),
  q: optionalTrimmedString(),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

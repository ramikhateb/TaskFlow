import { z } from "zod";
import {
  isoDateTimeSchema,
  taskPrioritySchema,
  taskResponseSchema,
  taskStatusSchema,
} from "./task";
import { publicUserSchema } from "./user";

// M8 produced PENDING (on create) and CANCELLED (on cancel). M9 adds the
// recipient-side transitions: ACCEPTED and DECLINED.
export const assignmentStatusSchema = z.enum(["PENDING", "ACCEPTED", "DECLINED", "CANCELLED"]);
export type AssignmentStatus = z.infer<typeof assignmentStatusSchema>;

// A short optional note, not rich text. Blank/omitted normalizes to
// undefined on the way in, null on the way out (same convention as Task's
// description/category — see task.ts).
const assignmentMessageSchema = z
  .string()
  .trim()
  .max(500, "Message must be at most 500 characters")
  .optional()
  .transform((value) => (value === "" ? undefined : value));

export const createTaskAssignmentRequestSchema = z.object({
  toUserId: z.string().min(1, "toUserId is required"),
  message: assignmentMessageSchema,
});
export type CreateTaskAssignmentRequest = z.infer<typeof createTaskAssignmentRequestSchema>;

export const taskIdRouteParamSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
});
export type TaskIdRouteParam = z.infer<typeof taskIdRouteParamSchema>;

export const taskAssignmentRouteParamSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  assignmentId: z.string().min(1, "assignmentId is required"),
});
export type TaskAssignmentRouteParam = z.infer<typeof taskAssignmentRouteParamSchema>;

// Sender/recipient identity is M7's PublicUser (id/name/username) — never
// email, never re-defined here.
export const taskAssignmentResponseSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  status: assignmentStatusSchema,
  message: z.string().nullable(),
  fromUser: publicUserSchema,
  toUser: publicUserSchema,
  respondedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type TaskAssignmentResponse = z.infer<typeof taskAssignmentResponseSchema>;

// GET /tasks/:id only: the plain TaskResponse (used by list/create/update
// too) additively gains the task's current PENDING assignment, if any. Not
// a stored/duplicated column — computed at read time from TaskAssignment,
// which remains the sole source of truth (see the M8 report's "how mobile
// learns pending state" explanation).
export const taskDetailResponseSchema = taskResponseSchema.extend({
  pendingAssignment: taskAssignmentResponseSchema.nullable(),
});
export type TaskDetailResponse = z.infer<typeof taskDetailResponseSchema>;

// M9: route param for the flat /assignments/:assignmentId/... surface
// (accept/decline) — distinct from taskAssignmentRouteParamSchema above,
// which is for the /tasks/:taskId/assignments/:assignmentId/cancel surface
// (create/cancel stay nested under their task; accept/decline/inbox don't —
// see ARCHITECTURE.md §3).
export const assignmentIdRouteParamSchema = z.object({
  assignmentId: z.string().min(1, "assignmentId is required"),
});
export type AssignmentIdRouteParam = z.infer<typeof assignmentIdRouteParamSchema>;

// M9: the recipient's scheduling choice on accept (FR-30). Required, not
// optional — Option B forces an explicit choice between "schedule it" and
// "schedule later" rather than defaulting either way. `null` means
// "schedule later": the sender's previous scheduledAt is never carried
// over (see taskAssignmentService.acceptAssignment) — it describes the
// sender's personal plan, not the task's completion constraint.
export const acceptTaskAssignmentRequestSchema = z.object({
  scheduledAt: isoDateTimeSchema.nullable(),
});
export type AcceptTaskAssignmentRequest = z.infer<typeof acceptTaskAssignmentRequestSchema>;

// M9 Inbox — deliberately NOT the full TaskResponse. In particular,
// scheduledAt is omitted on purpose: it's the sender's personal planning
// state, will be replaced (or cleared) the moment the recipient accepts,
// and must never be presented as if it's part of the incoming request (see
// the M9 report's "how sender scheduledAt is prevented from transferring"
// section). Only the fields a recipient needs to decide are included.
export const inboxTaskSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  priority: taskPrioritySchema,
  category: z.string().nullable(),
  deadline: z.string().nullable(),
  status: taskStatusSchema,
});
export type InboxTaskSummary = z.infer<typeof inboxTaskSummarySchema>;

// fromUser only (never toUser — every inbox row's toUser is always the
// caller, so it would be redundant), and no taskId at top level since
// `task.id` already carries it.
export const inboxAssignmentResponseSchema = z.object({
  id: z.string(),
  status: assignmentStatusSchema,
  message: z.string().nullable(),
  createdAt: z.string(),
  fromUser: publicUserSchema,
  task: inboxTaskSummarySchema,
});
export type InboxAssignmentResponse = z.infer<typeof inboxAssignmentResponseSchema>;

export const inboxResponseSchema = z.object({
  data: z.array(inboxAssignmentResponseSchema),
});
export type InboxResponse = z.infer<typeof inboxResponseSchema>;

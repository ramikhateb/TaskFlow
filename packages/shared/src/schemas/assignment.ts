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

// M10 (FR-32): server-computed authorization the client reflects rather
// than infers. isAssignee/isCreator are mutually non-exclusive (true for
// both on a self-owned task); canEdit/canDelete are currently identical
// (PATCH and DELETE share the same "current assignee, not pending" rule)
// but kept as separate fields since the two actions are authorized
// independently in principle, not because their current values differ.
export const taskViewerCapabilitiesSchema = z.object({
  isAssignee: z.boolean(),
  isCreator: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});
export type TaskViewerCapabilities = z.infer<typeof taskViewerCapabilitiesSchema>;

// GET /tasks/:id only: the plain TaskResponse (used by list/create/update
// too) additively gains the task's current PENDING assignment, if any. Not
// a stored/duplicated column — computed at read time from TaskAssignment,
// which remains the sole source of truth (see the M8 report's "how mobile
// learns pending state" explanation).
//
// M10 additively gains `assignee`/`creator` (PublicUser identity — PRODUCT.md:
// "both remain visible on the task") and `viewer` (server-computed
// capabilities, see above). `scheduledAt` — inherited from taskResponseSchema
// — is a special case: for a non-assignee (creator-only) viewer, the server
// always sends `null` here regardless of the task's real stored value, since
// scheduledAt is the *current assignee's* personal planning state, not part
// of what a creator-only viewer is entitled to see (see the M10 report's
// "how recipient scheduledAt is hidden from creator" section). The mobile
// client must key its rendering off `viewer.isAssignee`, never off whether
// `scheduledAt` happens to be null, since a assignee-visible task can
// legitimately have a null scheduledAt too (simply unscheduled).
export const taskDetailResponseSchema = taskResponseSchema.extend({
  pendingAssignment: taskAssignmentResponseSchema.nullable(),
  assignee: publicUserSchema,
  creator: publicUserSchema,
  viewer: taskViewerCapabilitiesSchema,
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

// M10 Sent (FR-29) — the sender's own history of requests, so unlike Inbox
// it includes every terminal status (PENDING/ACCEPTED/DECLINED/CANCELLED),
// not just PENDING, and carries `respondedAt` (always null in Inbox, since
// everything there is still PENDING by definition). Reuses
// `inboxTaskSummarySchema` for the task field rather than defining a
// near-duplicate: the same "no scheduledAt" rule applies for exactly the
// same reason — after ACCEPTED, scheduledAt is the *recipient's* personal
// planning state, and the sender/creator must never see it here either
// (see the M10 report's "how recipient scheduledAt is hidden from creator"
// section — this is the Sent-list side of that same rule, not a separate
// one). `toUser` (the recipient), not `fromUser` (always the caller here,
// so redundant, mirroring Inbox's own omission of the redundant side).
export const sentAssignmentResponseSchema = z.object({
  id: z.string(),
  status: assignmentStatusSchema,
  message: z.string().nullable(),
  createdAt: z.string(),
  respondedAt: z.string().nullable(),
  toUser: publicUserSchema,
  task: inboxTaskSummarySchema,
});
export type SentAssignmentResponse = z.infer<typeof sentAssignmentResponseSchema>;

export const sentAssignmentsResponseSchema = z.object({
  data: z.array(sentAssignmentResponseSchema),
});
export type SentAssignmentsResponse = z.infer<typeof sentAssignmentsResponseSchema>;

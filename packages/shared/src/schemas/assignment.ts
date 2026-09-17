import { z } from "zod";
import { taskResponseSchema } from "./task";
import { publicUserSchema } from "./user";

// M8: PENDING/ACCEPTED/DECLINED/CANCELLED all exist in the model now, but
// M8 only ever produces PENDING (on create) and CANCELLED (on cancel).
// ACCEPTED/DECLINED are reachable only through M9's accept/decline
// operations, not implemented yet.
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

import { z } from "zod";

// M3 scope only: title, description, status. priority/category/scheduledAt/
// deadline arrive in M4 (REQUIREMENTS.md FR-7/FR-8).
export const taskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

const titleSchema = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(200, "Title must be at most 200 characters");

const descriptionSchema = z
  .string()
  .trim()
  .max(2000, "Description must be at most 2000 characters");

// Status isn't accepted on create — every task starts TODO (FR-7 default).
export const createTaskRequestSchema = z.object({
  title: titleSchema,
  description: descriptionSchema.optional(),
});
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;

// description: null explicitly clears it; omitted leaves it untouched.
export const updateTaskRequestSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema.nullable(),
    status: taskStatusSchema,
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

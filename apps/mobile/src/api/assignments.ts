import {
  taskAssignmentResponseSchema,
  type CreateTaskAssignmentRequest,
  type TaskAssignmentResponse,
} from "@taskflow/shared";
import { apiFetch } from "./client";

export async function createAssignmentRequest(
  taskId: string,
  input: CreateTaskAssignmentRequest,
): Promise<TaskAssignmentResponse> {
  const data = await apiFetch<unknown>(`/tasks/${taskId}/assignments`, {
    method: "POST",
    auth: true,
    body: JSON.stringify(input),
  });
  return taskAssignmentResponseSchema.parse(data);
}

export async function cancelAssignmentRequest(
  taskId: string,
  assignmentId: string,
): Promise<TaskAssignmentResponse> {
  const data = await apiFetch<unknown>(`/tasks/${taskId}/assignments/${assignmentId}/cancel`, {
    method: "POST",
    auth: true,
  });
  return taskAssignmentResponseSchema.parse(data);
}

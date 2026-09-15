import {
  taskListResponseSchema,
  taskResponseSchema,
  type CreateTaskRequest,
  type TaskListResponse,
  type TaskResponse,
  type UpdateTaskRequest,
} from "@taskflow/shared";
import { apiFetch } from "./client";

export async function listTasksRequest(): Promise<TaskListResponse> {
  const data = await apiFetch<unknown>("/tasks", { auth: true });
  return taskListResponseSchema.parse(data);
}

export async function getTaskRequest(id: string): Promise<TaskResponse> {
  const data = await apiFetch<unknown>(`/tasks/${id}`, { auth: true });
  return taskResponseSchema.parse(data);
}

export async function createTaskRequest(input: CreateTaskRequest): Promise<TaskResponse> {
  const data = await apiFetch<unknown>("/tasks", {
    method: "POST",
    auth: true,
    body: JSON.stringify(input),
  });
  return taskResponseSchema.parse(data);
}

export async function updateTaskRequest(
  id: string,
  input: UpdateTaskRequest,
): Promise<TaskResponse> {
  const data = await apiFetch<unknown>(`/tasks/${id}`, {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(input),
  });
  return taskResponseSchema.parse(data);
}

export function deleteTaskRequest(id: string): Promise<void> {
  return apiFetch<void>(`/tasks/${id}`, { method: "DELETE", auth: true });
}

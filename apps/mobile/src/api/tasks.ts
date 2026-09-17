import {
  taskListResponseSchema,
  taskResponseSchema,
  todayResponseSchema,
  type CreateTaskRequest,
  type DateRangeQuery,
  type TaskListResponse,
  type TaskResponse,
  type TodayResponse,
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

function rangeQueryString(range: DateRangeQuery): string {
  return new URLSearchParams({ from: range.from, to: range.to }).toString();
}

export async function getTodayRequest(range: DateRangeQuery): Promise<TodayResponse> {
  const data = await apiFetch<unknown>(`/tasks/today?${rangeQueryString(range)}`, { auth: true });
  return todayResponseSchema.parse(data);
}

export async function getScheduleRequest(range: DateRangeQuery): Promise<TaskListResponse> {
  const data = await apiFetch<unknown>(`/tasks/schedule?${rangeQueryString(range)}`, {
    auth: true,
  });
  return taskListResponseSchema.parse(data);
}

import {
  taskListResponseSchema,
  taskResponseSchema,
  todayResponseSchema,
  type CreateTaskRequest,
  type DateRangeQuery,
  type ListTasksQuery,
  type TaskListResponse,
  type TaskResponse,
  type TodayResponse,
  type UpdateTaskRequest,
} from "@taskflow/shared";
import { apiFetch } from "./client";

export async function listTasksRequest(filters: ListTasksQuery = {}): Promise<TaskListResponse> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.category) params.set("category", filters.category);
  if (filters.q) params.set("q", filters.q);
  const query = params.toString();

  const data = await apiFetch<unknown>(`/tasks${query ? `?${query}` : ""}`, { auth: true });
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

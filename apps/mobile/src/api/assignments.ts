import {
  inboxResponseSchema,
  sentAssignmentsResponseSchema,
  taskAssignmentResponseSchema,
  type AcceptTaskAssignmentRequest,
  type CreateTaskAssignmentRequest,
  type InboxResponse,
  type SentAssignmentsResponse,
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

// M9: flat "/assignments" root, not nested under "/tasks/:taskId" like
// create/cancel above — these are recipient-scoped, not task-scoped. See
// docs/ARCHITECTURE.md §3.
export async function getInboxRequest(): Promise<InboxResponse> {
  const data = await apiFetch<unknown>("/assignments/inbox", { auth: true });
  return inboxResponseSchema.parse(data);
}

export async function acceptAssignmentRequest(
  assignmentId: string,
  input: AcceptTaskAssignmentRequest,
): Promise<TaskAssignmentResponse> {
  const data = await apiFetch<unknown>(`/assignments/${assignmentId}/accept`, {
    method: "POST",
    auth: true,
    body: JSON.stringify(input),
  });
  return taskAssignmentResponseSchema.parse(data);
}

export async function declineAssignmentRequest(
  assignmentId: string,
): Promise<TaskAssignmentResponse> {
  const data = await apiFetch<unknown>(`/assignments/${assignmentId}/decline`, {
    method: "POST",
    auth: true,
  });
  return taskAssignmentResponseSchema.parse(data);
}

// M10 (FR-29): the sender's own history — every terminal status, not just
// PENDING (that's Inbox). Same flat "/assignments" root.
export async function getSentAssignmentsRequest(): Promise<SentAssignmentsResponse> {
  const data = await apiFetch<unknown>("/assignments/sent", { auth: true });
  return sentAssignmentsResponseSchema.parse(data);
}

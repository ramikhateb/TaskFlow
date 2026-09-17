import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateTaskAssignmentRequest } from "@taskflow/shared";
import { cancelAssignmentRequest, createAssignmentRequest } from "../../api/assignments";
import { SENT_QUERY_KEY } from "../inbox/useInbox";
import { taskQueryKey } from "./useTasks";

/**
 * Creating/cancelling an assignment never changes the task's own fields
 * (status/assigneeId) — only its read-time `pendingAssignment` field, which
 * lives on the same GET /tasks/:id response as everything else (M8). So on
 * success we invalidate that one task's detail query; there's no need to
 * touch the ["tasks"] list/today/schedule queries, since a pending
 * assignment is invisible to those views (responsibility hasn't
 * transferred). M10 additionally invalidates Sent — a new/cancelled
 * assignment is exactly what that list shows — mirroring how
 * useAcceptAssignment (features/inbox/useInbox.ts) already invalidates
 * TASKS_QUERY_KEY in the other direction.
 */
export function useCreateAssignment(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskAssignmentRequest) => createAssignmentRequest(taskId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskQueryKey(taskId) });
      queryClient.invalidateQueries({ queryKey: SENT_QUERY_KEY });
    },
  });
}

export function useCancelAssignment(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) => cancelAssignmentRequest(taskId, assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskQueryKey(taskId) });
      queryClient.invalidateQueries({ queryKey: SENT_QUERY_KEY });
    },
  });
}

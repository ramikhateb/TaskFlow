import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateTaskAssignmentRequest } from "@taskflow/shared";
import { cancelAssignmentRequest, createAssignmentRequest } from "../../api/assignments";
import { taskQueryKey } from "./useTasks";

/**
 * Creating/cancelling an assignment never changes the task's own fields
 * (status/assigneeId) — only its read-time `pendingAssignment` field, which
 * lives on the same GET /tasks/:id response as everything else (M8). So on
 * success we just invalidate that one task's detail query; there's no need
 * to touch the ["tasks"] list/today/schedule queries, since a pending
 * assignment is invisible to those views (responsibility hasn't
 * transferred, and M8 has no inbox/list surface for assignments yet).
 */
export function useCreateAssignment(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskAssignmentRequest) => createAssignmentRequest(taskId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskQueryKey(taskId) });
    },
  });
}

export function useCancelAssignment(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) => cancelAssignmentRequest(taskId, assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskQueryKey(taskId) });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AcceptTaskAssignmentRequest } from "@taskflow/shared";
import {
  acceptAssignmentRequest,
  declineAssignmentRequest,
  getInboxRequest,
} from "../../api/assignments";
import { TASKS_QUERY_KEY } from "../tasks/useTasks";

export const INBOX_QUERY_KEY = ["inbox"] as const;

export function useInbox() {
  return useQuery({
    queryKey: INBOX_QUERY_KEY,
    queryFn: async () => (await getInboxRequest()).data,
  });
}

/**
 * Accepting transfers the task to the caller (M9): the new assignee's own
 * Tasks/Today/Schedule need to pick it up, so both the Inbox and the whole
 * ["tasks"] prefix are invalidated. There's no sender-side invalidation
 * here — that's a different device/session's QueryClient (M9 has no
 * real-time sender notifications by design; see the M9 report).
 */
export function useAcceptAssignment(assignmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AcceptTaskAssignmentRequest) =>
      acceptAssignmentRequest(assignmentId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
    },
  });
}

/**
 * Declining never changes the caller's own tasks (the task was never
 * theirs) — only the Inbox needs to lose this entry.
 */
export function useDeclineAssignment(assignmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => declineAssignmentRequest(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY });
    },
  });
}

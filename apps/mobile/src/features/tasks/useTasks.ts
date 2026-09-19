import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateTaskRequest,
  DateRangeQuery,
  ListTasksQuery,
  TaskDetailResponse,
  TaskResponse,
  UpdateTaskRequest,
} from "@taskflow/shared";
import {
  createTaskRequest,
  deleteTaskRequest,
  getScheduleRequest,
  getTaskRequest,
  getTodayRequest,
  listTasksRequest,
  updateTaskRequest,
} from "../../api/tasks";

export const TASKS_QUERY_KEY = ["tasks"] as const;
export const taskQueryKey = (id: string) => ["tasks", id] as const;

// Flat primitives in the key (not the filters object itself) so cache
// identity is unambiguous and matches the existing convention used by
// useToday/useSchedule below. Different filter combinations never share a
// cache entry; the same combination always does.
export function useTasks(filters: ListTasksQuery = {}) {
  return useQuery({
    queryKey: [
      ...TASKS_QUERY_KEY,
      "list",
      filters.status ?? null,
      filters.priority ?? null,
      filters.category ?? null,
      filters.q ?? null,
    ] as const,
    queryFn: async () => (await listTasksRequest(filters)).data,
  });
}

/**
 * Available categories for the filter picker. Deliberately queries with NO
 * filters applied (its own cache entry, decoupled from whatever the Tasks
 * screen's active filters are) rather than deriving options from the
 * currently-filtered list — if it read from the filtered result, selecting
 * any one category would make every *other* category vanish from the
 * picker, since the filtered response no longer contains tasks in them.
 * Tradeoff: this can be briefly stale relative to the very latest edits
 * until its cache revalidates, and — when filters are active — it costs a
 * second lightweight GET /tasks. Both are acceptable for a filter-picker
 * over a personal task list; a dedicated /tasks/categories endpoint was
 * deliberately not added (M6 keeps one composable list endpoint).
 * When no filters are active, this is the exact same query as the main
 * list, so TanStack Query serves it from one shared cache entry — no extra
 * request in the common case.
 */
export function useAvailableCategories(): string[] {
  const allTasks = useTasks({});
  const categories = new Set<string>();
  for (const task of allTasks.data ?? []) {
    if (task.category) categories.add(task.category);
  }
  return Array.from(categories).sort((a, b) => a.localeCompare(b));
}

export function useTask(id: string) {
  return useQuery({
    queryKey: taskQueryKey(id),
    queryFn: () => getTaskRequest(id),
    enabled: id.length > 0,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskRequest) => createTaskRequest(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
    },
  });
}

export function useUpdateTask(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTaskRequest) => updateTaskRequest(id, input),
    onSuccess: (data: TaskResponse) => {
      // PATCH /tasks/:id returns a plain TaskResponse — unlike GET, it never
      // carries viewer/assignee/creator/pendingAssignment (those are detail-
      // only fields, see TaskDetailResponse). Merge onto whatever detail is
      // already cached instead of replacing it outright, or Task Details
      // would immediately crash reading `viewer` off the now-missing field.
      // The invalidate right after still refetches the real detail in the
      // background to reconcile anything this merge can't account for.
      queryClient.setQueryData<TaskDetailResponse>(taskQueryKey(id), (old) =>
        old ? { ...old, ...data } : old,
      );
      queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTaskRequest(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: taskQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
    },
  });
}

// Keyed on the exact range so switching days/ranges never mixes cached
// results, and so a mutation elsewhere (invalidating the ["tasks"] prefix)
// correctly invalidates these too.
export function useToday(range: DateRangeQuery) {
  return useQuery({
    queryKey: [...TASKS_QUERY_KEY, "today", range.from, range.to] as const,
    queryFn: () => getTodayRequest(range),
  });
}

export function useSchedule(range: DateRangeQuery) {
  return useQuery({
    queryKey: [...TASKS_QUERY_KEY, "schedule", range.from, range.to] as const,
    queryFn: async () => (await getScheduleRequest(range)).data,
  });
}

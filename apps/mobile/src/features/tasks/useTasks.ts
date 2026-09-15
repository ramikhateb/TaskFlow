import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTaskRequest, TaskResponse, UpdateTaskRequest } from "@taskflow/shared";
import {
  createTaskRequest,
  deleteTaskRequest,
  getTaskRequest,
  listTasksRequest,
  updateTaskRequest,
} from "../../api/tasks";

export const TASKS_QUERY_KEY = ["tasks"] as const;
export const taskQueryKey = (id: string) => ["tasks", id] as const;

export function useTasks() {
  return useQuery({
    queryKey: TASKS_QUERY_KEY,
    queryFn: async () => (await listTasksRequest()).data,
  });
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
      queryClient.setQueryData(taskQueryKey(id), data);
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

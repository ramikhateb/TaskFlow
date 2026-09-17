import { create } from "zustand";
import type { TaskPriority, TaskStatus } from "@taskflow/shared";

// ARCHITECTURE.md §2 names "active filter selections on the task list" as a
// Zustand use case explicitly — this is client/UI state, never fetched task
// data (that stays in TanStack Query, see useTasks). Because this is a
// module-level store rather than component state, filters naturally persist
// while navigating between tabs (Today/Schedule/Profile and back to Tasks)
// without any extra plumbing.
interface TaskFilterState {
  status: TaskStatus | null; // null = "All"
  priority: TaskPriority | null;
  category: string | null;
  q: string; // "" = no search
  setStatus: (status: TaskStatus | null) => void;
  setPriority: (priority: TaskPriority | null) => void;
  setCategory: (category: string | null) => void;
  setQuery: (q: string) => void;
  clearAll: () => void;
}

export const useTaskFilterStore = create<TaskFilterState>((set) => ({
  status: null,
  priority: null,
  category: null,
  q: "",
  setStatus: (status) => set({ status }),
  setPriority: (priority) => set({ priority }),
  setCategory: (category) => set({ category }),
  setQuery: (q) => set({ q }),
  clearAll: () => set({ status: null, priority: null, category: null, q: "" }),
}));

export function hasActiveTaskFilters(
  state: Pick<TaskFilterState, "status" | "priority" | "category" | "q">,
): boolean {
  return (
    state.status !== null || state.priority !== null || state.category !== null || state.q !== ""
  );
}

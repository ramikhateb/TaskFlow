import { create } from "zustand";
import type { TaskPriority } from "@taskflow/shared";
import type { TaskView } from "../features/tasks/taskView";

// ARCHITECTURE.md §2 names "active filter selections on the task list" as a
// Zustand use case explicitly — this is client/UI state, never fetched task
// data (that stays in TanStack Query, see useTasks). Because this is a
// module-level store rather than component state, filters naturally persist
// while navigating between tabs (Today/Schedule/Profile and back to Tasks)
// without any extra plumbing.
interface TaskFilterState {
  // The screen's permanent All/Active/Completed categorization — not a
  // removable filter chip, so it's tracked separately from priority/
  // category/q and left untouched by clearAll().
  view: TaskView;
  priority: TaskPriority | null;
  category: string | null;
  q: string; // "" = no search
  setView: (view: TaskView) => void;
  setPriority: (priority: TaskPriority | null) => void;
  setCategory: (category: string | null) => void;
  setQuery: (q: string) => void;
  clearAll: () => void;
}

export const useTaskFilterStore = create<TaskFilterState>((set) => ({
  view: "all",
  priority: null,
  category: null,
  q: "",
  setView: (view) => set({ view }),
  setPriority: (priority) => set({ priority }),
  setCategory: (category) => set({ category }),
  setQuery: (q) => set({ q }),
  clearAll: () => set({ priority: null, category: null, q: "" }),
}));

export function hasActiveTaskFilters(
  state: Pick<TaskFilterState, "priority" | "category" | "q">,
): boolean {
  return state.priority !== null || state.category !== null || state.q !== "";
}

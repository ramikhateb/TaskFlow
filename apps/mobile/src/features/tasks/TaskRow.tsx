import { useRouter } from "expo-router";
import type { TaskResponse } from "@taskflow/shared";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { PRIORITY_COLORS, priorityLabel } from "./PrioritySelector";
import { useDeleteTask, useUpdateTask } from "./useTasks";

// Product decision (2026-09-15): TODO/IN_PROGRESS/DONE are fully
// interchangeable, so a task can be completed or reopened directly, in one
// tap, regardless of its current status. CANCELLED remains terminal.
function nextStepFor(
  status: TaskResponse["status"],
): { label: string; to: TaskResponse["status"] } | null {
  switch (status) {
    case "TODO":
    case "IN_PROGRESS":
      return { label: "Mark Done", to: "DONE" };
    case "DONE":
      return { label: "Mark Not Done", to: "TODO" };
    case "CANCELLED":
      return null;
  }
}

interface TaskRowProps {
  task: TaskResponse;
  /** Defaults to "STATUS · category" — Today/Schedule pass a date-focused line instead. */
  subtitle?: string;
}

/**
 * Shared row used by the Tasks list, Today, and Schedule screens, so
 * priority display, the complete/uncomplete action, and delete all have one
 * implementation (per M5: don't duplicate task business logic in a screen).
 */
export function TaskRow({ task, subtitle }: TaskRowProps) {
  const router = useRouter();
  const updateTask = useUpdateTask(task.id);
  const deleteTask = useDeleteTask();
  const nextStep = nextStepFor(task.status);
  const resolvedSubtitle =
    subtitle ?? `${task.status.replace("_", " ")}${task.category ? ` · ${task.category}` : ""}`;

  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.rowMain} onPress={() => router.push(`/tasks/${task.id}`)}>
        <View style={styles.rowTitleLine}>
          <Text
            style={[
              styles.priorityBadge,
              {
                color: PRIORITY_COLORS[task.priority],
                borderColor: PRIORITY_COLORS[task.priority],
              },
            ]}
          >
            {priorityLabel(task.priority)}
          </Text>
          <Text style={[styles.rowTitle, task.status === "DONE" && styles.rowTitleDone]}>
            {task.title}
          </Text>
        </View>
        <Text style={styles.rowSubtitle}>{resolvedSubtitle}</Text>
      </TouchableOpacity>

      <View style={styles.rowActions}>
        {nextStep && (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={updateTask.isPending}
            onPress={() => updateTask.mutate({ status: nextStep.to })}
          >
            <Text style={styles.actionText}>{nextStep.label}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          accessibilityRole="button"
          disabled={deleteTask.isPending}
          onPress={() => deleteTask.mutate(task.id)}
        >
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    gap: 8,
  },
  rowMain: { flex: 1 },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  priorityBadge: {
    fontSize: 10,
    fontWeight: "700",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  rowTitle: { fontSize: 16, fontWeight: "600" },
  rowTitleDone: { textDecorationLine: "line-through", color: "#888" },
  rowSubtitle: { fontSize: 12, color: "#666", marginTop: 2 },
  rowActions: { flexDirection: "row", gap: 16 },
  actionText: { color: "#1a7f37", fontWeight: "600" },
  deleteText: { color: "#c0392b", fontWeight: "600" },
});

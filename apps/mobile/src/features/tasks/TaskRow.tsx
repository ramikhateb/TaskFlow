import { useRouter } from "expo-router";
import type { TaskResponse } from "@taskflow/shared";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, fontSize, spacing } from "../../ui/theme";
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

  function confirmDelete() {
    // Phase 12 (destructive actions): hard-delete cascades this task's
    // assignment history (EC-17) and can't be undone.
    Alert.alert("Delete this task?", `"${task.title}" can't be recovered after this.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteTask.mutate(task.id) },
    ]);
  }

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.rowMain}
        accessibilityRole="button"
        onPress={() => router.push(`/tasks/${task.id}`)}
      >
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
          {task.status === "DONE" && <Text style={styles.doneCheck}>✓</Text>}
        </View>
        <Text style={styles.rowSubtitle}>{resolvedSubtitle}</Text>
      </TouchableOpacity>

      <View style={styles.rowActions}>
        {nextStep && (
          <TouchableOpacity
            style={styles.rowActionButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`${nextStep.label} — ${task.title}`}
            disabled={updateTask.isPending}
            onPress={() => updateTask.mutate({ status: nextStep.to })}
          >
            <Text style={styles.actionText}>{nextStep.label}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.rowActionButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Delete — ${task.title}`}
          disabled={deleteTask.isPending}
          onPress={confirmDelete}
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
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
    gap: spacing.sm,
  },
  rowMain: { flex: 1 },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  priorityBadge: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  rowTitle: { fontSize: fontSize.md, fontWeight: "600", flexShrink: 1 },
  rowTitleDone: { textDecorationLine: "line-through", color: colors.textMuted },
  doneCheck: { color: colors.primary, fontWeight: "700" },
  rowSubtitle: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  rowActions: { flexDirection: "row", gap: spacing.md },
  rowActionButton: { paddingVertical: spacing.xs, paddingHorizontal: 2 },
  actionText: { color: colors.primary, fontWeight: "600", fontSize: fontSize.body },
  deleteText: { color: colors.danger, fontWeight: "600", fontSize: fontSize.body },
});

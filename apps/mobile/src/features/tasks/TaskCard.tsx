import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { TaskResponse } from "@taskflow/shared";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, fontSize, radius, spacing } from "../../ui/theme";
import { PriorityBadge } from "./PriorityBadge";
import { useUpdateTask } from "./useTasks";

// Product decision (2026-09-15): TODO/IN_PROGRESS/DONE are fully
// interchangeable, so a task can be completed or reopened directly, in one
// tap, regardless of its current status. CANCELLED remains terminal.
function nextStatusFor(status: TaskResponse["status"]): TaskResponse["status"] | null {
  switch (status) {
    case "TODO":
    case "IN_PROGRESS":
      return "DONE";
    case "DONE":
      return "TODO";
    case "CANCELLED":
      return null;
  }
}

function formatScheduled(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return sameDay
    ? `Today, ${time}`
    : `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
}

function formatDeadline(iso: string): string {
  return `Due ${new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

interface TaskCardProps {
  task: TaskResponse;
  /**
   * Overrides the card's own default schedule/deadline line — Today and
   * Schedule already know exactly which date field matters in their own
   * context (e.g. "Due Apr 20" for an overdue task, a bare time for one
   * scheduled today) and pass that instead of letting the card guess.
   */
  subtitle?: string;
  /** Tints an explicit `subtitle` red — used by Today's Overdue section. */
  subtitleTone?: "default" | "danger";
}

/**
 * The app's one task row, used by Today, Tasks, and Schedule: a tappable
 * summary (title, completion control, priority, category, schedule/deadline)
 * that answers "what is this and when does it matter?" — everything else
 * about the task lives on its Task Details screen, not on the card.
 */
export function TaskCard({ task, subtitle, subtitleTone = "default" }: TaskCardProps) {
  const router = useRouter();
  const updateTask = useUpdateTask(task.id);
  const nextStatus = nextStatusFor(task.status);
  const isDone = task.status === "DONE";
  const isCancelled = task.status === "CANCELLED";
  const isOverdue =
    !subtitle &&
    !isDone &&
    !isCancelled &&
    task.deadline !== null &&
    new Date(task.deadline).getTime() < Date.now();

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.checkTouch}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="checkbox"
        accessibilityLabel={isDone ? `Mark ${task.title} not done` : `Mark ${task.title} done`}
        accessibilityState={{ checked: isDone, disabled: nextStatus === null }}
        disabled={updateTask.isPending || nextStatus === null}
        onPress={() => nextStatus && updateTask.mutate({ status: nextStatus })}
      >
        <View
          style={[
            styles.checkCircle,
            isDone && styles.checkCircleDone,
            isCancelled && styles.checkCircleCancelled,
          ]}
        >
          {isDone && <Ionicons name="checkmark" size={15} color={colors.textOnPrimary} />}
          {isCancelled && <Ionicons name="close" size={13} color={colors.textMuted} />}
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.body}
        accessibilityRole="button"
        accessibilityLabel={`Open ${task.title}`}
        activeOpacity={0.6}
        // Task Details is a root-level stack screen (app/tasks/[id].tsx),
        // not nested inside any one tab — a plain push here gives genuine,
        // unlimited-depth back history (Today/Schedule/Tasks/Sent → task →
        // another task → back → back → wherever you actually started).
        onPress={() => router.push(`/tasks/${task.id}`)}
      >
        <Text
          style={[styles.title, (isDone || isCancelled) && styles.titleMuted]}
          numberOfLines={2}
        >
          {task.title}
        </Text>

        <View style={styles.metaRow}>
          <PriorityBadge priority={task.priority} />
          {!subtitle && task.category && (
            <View style={styles.categoryPill}>
              <Text style={styles.categoryPillText} numberOfLines={1}>
                {task.category}
              </Text>
            </View>
          )}
          {subtitle && (
            <Text
              style={[styles.metaText, subtitleTone === "danger" && styles.metaTextDanger]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          )}
        </View>

        {!subtitle && (task.scheduledAt || task.deadline) && (
          <View style={styles.metaRow}>
            {task.scheduledAt && (
              <View style={styles.timeInline}>
                <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
                <Text style={styles.metaText}>{formatScheduled(task.scheduledAt)}</Text>
              </View>
            )}
            {task.deadline && (
              <Text style={[styles.metaText, isOverdue && styles.metaTextDanger]}>
                {formatDeadline(task.deadline)}
              </Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  checkTouch: { padding: 2, marginTop: 2 },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleDone: { backgroundColor: colors.success, borderColor: colors.success },
  checkCircleCancelled: { backgroundColor: colors.neutral, borderColor: colors.neutral },
  body: { flex: 1, gap: 6 },
  title: { fontSize: fontSize.taskTitle, fontWeight: "600", color: colors.textPrimary },
  titleMuted: { textDecorationLine: "line-through", color: colors.textMuted },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  metaText: { fontSize: fontSize.meta, color: colors.textSecondary },
  metaTextDanger: { color: colors.danger, fontWeight: "600" },
  timeInline: { flexDirection: "row", alignItems: "center", gap: 4 },
  categoryPill: {
    backgroundColor: colors.neutral,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    maxWidth: 140,
  },
  categoryPillText: { fontSize: fontSize.tiny, fontWeight: "600", color: colors.textSecondary },
});

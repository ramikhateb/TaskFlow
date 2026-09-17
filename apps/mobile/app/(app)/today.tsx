import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getLocalDayBoundaries } from "../../src/features/tasks/dateBoundaries";
import { TaskRow } from "../../src/features/tasks/TaskRow";
import { useToday } from "../../src/features/tasks/useTasks";
import { colors, fontSize, spacing } from "../../src/ui/theme";

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatOverdueDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function TodayScreen() {
  // Recomputed on every render, including on pull-to-refresh, so a session
  // left open across midnight picks up the new local day — the client, not
  // the server, owns "what day is it" (ARCHITECTURE.md §3, EC-8).
  const range = getLocalDayBoundaries(new Date());
  const today = useToday(range);

  if (today.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (today.isError || !today.data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Could not load today&apos;s tasks. Pull to refresh.</Text>
      </View>
    );
  }

  const { overdue, scheduledToday, dueToday } = today.data;
  const isEmpty = overdue.length === 0 && scheduledToday.length === 0 && dueToday.length === 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={today.isFetching} onRefresh={() => today.refetch()} />
      }
    >
      <Text style={styles.title}>Today</Text>

      {isEmpty && (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyHeadline}>You&apos;re all clear for today.</Text>
          <Text style={styles.emptySubtext}>
            Nothing is overdue, scheduled, or due — check Schedule to plan ahead.
          </Text>
        </View>
      )}

      {overdue.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.overdueTitle]}>Overdue · {overdue.length}</Text>
          {overdue.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              subtitle={`Due ${formatOverdueDate(task.deadline)}`}
            />
          ))}
        </View>
      )}

      {scheduledToday.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scheduled Today · {scheduledToday.length}</Text>
          {scheduledToday.map((task) => (
            <TaskRow key={task.id} task={task} subtitle={formatTime(task.scheduledAt)} />
          ))}
        </View>
      )}

      {dueToday.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Due Today · {dueToday.length}</Text>
          {dueToday.map((task) => (
            <TaskRow key={task.id} task={task} subtitle={`Due ${formatTime(task.deadline)}`} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: 20, flexGrow: 1 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.textPrimary },
  emptyBlock: {
    marginTop: spacing.xl,
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xl,
  },
  emptyHeadline: { fontSize: fontSize.lg, fontWeight: "600", color: colors.textPrimary },
  emptySubtext: { fontSize: fontSize.body, color: colors.textMuted, textAlign: "center" },
  error: { color: colors.danger, textAlign: "center" },
  section: { gap: spacing.xs },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.textBody,
    marginBottom: spacing.xs,
  },
  overdueTitle: { color: colors.danger },
});

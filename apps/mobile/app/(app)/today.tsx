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
        <Text style={styles.error}>Could not load today&apos;s tasks.</Text>
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

      {isEmpty && <Text style={styles.empty}>Nothing scheduled or due today.</Text>}

      {overdue.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.overdueTitle]}>Overdue</Text>
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
          <Text style={styles.sectionTitle}>Scheduled</Text>
          {scheduledToday.map((task) => (
            <TaskRow key={task.id} task={task} subtitle={formatTime(task.scheduledAt)} />
          ))}
        </View>
      )}

      {dueToday.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Due Today</Text>
          {dueToday.map((task) => (
            <TaskRow key={task.id} task={task} subtitle={`Due ${formatTime(task.deadline)}`} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24, gap: 20 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "700" },
  empty: { color: "#666", marginTop: 12 },
  error: { color: "#c0392b" },
  section: { gap: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#333", marginBottom: 4 },
  overdueTitle: { color: "#c0392b" },
});

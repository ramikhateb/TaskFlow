import { useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getLocalDayBoundaries } from "../../src/features/tasks/dateBoundaries";
import { TaskRow } from "../../src/features/tasks/TaskRow";
import { useSchedule } from "../../src/features/tasks/useTasks";

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDeadline(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function ScheduleScreen() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const range = getLocalDayBoundaries(selectedDate);
  const schedule = useSchedule(range);

  return (
    <View style={styles.container}>
      <View style={styles.nav}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          onPress={() => setSelectedDate((d) => addDays(d, -1))}
        >
          <Text style={styles.navButton}>‹ Prev</Text>
        </TouchableOpacity>
        <Text style={styles.dateLabel}>{formatDay(selectedDate)}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Next day"
          onPress={() => setSelectedDate((d) => addDays(d, 1))}
        >
          <Text style={styles.navButton}>Next ›</Text>
        </TouchableOpacity>
      </View>

      {!isSameLocalDay(selectedDate, new Date()) && (
        <TouchableOpacity accessibilityRole="button" onPress={() => setSelectedDate(new Date())}>
          <Text style={styles.todayLink}>Jump to Today</Text>
        </TouchableOpacity>
      )}

      {schedule.isLoading && <ActivityIndicator style={styles.spacer} />}
      {schedule.isError && <Text style={styles.error}>Could not load the schedule.</Text>}

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={schedule.isFetching} onRefresh={() => schedule.refetch()} />
        }
      >
        {schedule.data && schedule.data.length === 0 && (
          <Text style={styles.empty}>Nothing scheduled for this day.</Text>
        )}
        {schedule.data?.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            subtitle={
              task.deadline
                ? `${formatTime(task.scheduledAt)} · Deadline ${formatDeadline(task.deadline)}`
                : formatTime(task.scheduledAt)
            }
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 24, gap: 12 },
  nav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  navButton: { color: "#1a7f37", fontWeight: "600", fontSize: 15 },
  dateLabel: { fontSize: 16, fontWeight: "700" },
  todayLink: { color: "#666", textAlign: "center", textDecorationLine: "underline" },
  spacer: { marginTop: 24 },
  error: { color: "#c0392b", marginTop: 24, textAlign: "center" },
  empty: { color: "#666", textAlign: "center", marginTop: 24 },
  list: { gap: 4, paddingBottom: 24 },
});

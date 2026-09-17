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
import { colors, fontSize, spacing } from "../../src/ui/theme";

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
  const isToday = isSameLocalDay(selectedDate, new Date());

  return (
    <View style={styles.container}>
      <View style={styles.nav}>
        <TouchableOpacity
          style={styles.navTouch}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          onPress={() => setSelectedDate((d) => addDays(d, -1))}
        >
          <Text style={styles.navButton}>‹ Prev</Text>
        </TouchableOpacity>
        <Text style={styles.dateLabel}>{isToday ? "Today" : formatDay(selectedDate)}</Text>
        <TouchableOpacity
          style={styles.navTouch}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Next day"
          onPress={() => setSelectedDate((d) => addDays(d, 1))}
        >
          <Text style={styles.navButton}>Next ›</Text>
        </TouchableOpacity>
      </View>

      {!isToday && (
        <TouchableOpacity accessibilityRole="button" onPress={() => setSelectedDate(new Date())}>
          <Text style={styles.todayLink}>Jump to Today</Text>
        </TouchableOpacity>
      )}

      {schedule.isLoading && <ActivityIndicator style={styles.spacer} />}
      {schedule.isError && (
        <Text style={styles.error}>Could not load the schedule. Pull to refresh.</Text>
      )}

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={schedule.isFetching} onRefresh={() => schedule.refetch()} />
        }
      >
        {schedule.data && schedule.data.length === 0 && (
          <Text style={styles.empty}>
            {isToday ? "Nothing scheduled for today." : "Nothing scheduled for this day."}
          </Text>
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
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.md },
  nav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  navTouch: { paddingVertical: spacing.xs },
  navButton: { color: colors.primary, fontWeight: "600", fontSize: fontSize.base },
  dateLabel: { fontSize: fontSize.md, fontWeight: "700", color: colors.textPrimary },
  todayLink: { color: colors.textMuted, textAlign: "center", textDecorationLine: "underline" },
  spacer: { marginTop: spacing.xl },
  error: { color: colors.danger, marginTop: spacing.xl, textAlign: "center" },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },
  list: { gap: spacing.xs, paddingBottom: spacing.xl },
});

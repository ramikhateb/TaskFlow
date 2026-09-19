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
import { TaskCard } from "../../src/features/tasks/TaskCard";
import { useSchedule } from "../../src/features/tasks/useTasks";
import { EmptyState } from "../../src/ui/EmptyState";
import { IconButton } from "../../src/ui/IconButton";
import { Screen } from "../../src/ui/Screen";
import { colors, fontFamily, fontSize, radius, spacing } from "../../src/ui/theme";

const STRIP_DAYS_BEFORE = 3;
const STRIP_DAYS_AFTER = 3;

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

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
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
  const today = new Date();
  const isToday = isSameLocalDay(selectedDate, today);

  const stripDays = Array.from({ length: STRIP_DAYS_BEFORE + STRIP_DAYS_AFTER + 1 }, (_, i) =>
    addDays(selectedDate, i - STRIP_DAYS_BEFORE),
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Schedule</Text>
        <Text style={styles.monthLabel}>{formatMonthYear(selectedDate)}</Text>
      </View>

      <View style={styles.stripRow}>
        <IconButton
          name="chevron-back"
          accessibilityLabel="Previous day"
          onPress={() => setSelectedDate((d) => addDays(d, -1))}
        />
        <View style={styles.strip}>
          {stripDays.map((day) => {
            const selected = isSameLocalDay(day, selectedDate);
            const isDayToday = isSameLocalDay(day, today);
            return (
              <TouchableOpacity
                key={day.toISOString()}
                style={[styles.dayPill, selected && styles.dayPillSelected]}
                accessibilityRole="button"
                accessibilityLabel={day.toDateString()}
                accessibilityState={{ selected }}
                onPress={() => setSelectedDate(day)}
              >
                <Text style={[styles.dayWeekday, selected && styles.daySelectedText]}>
                  {day.toLocaleDateString(undefined, { weekday: "narrow" })}
                </Text>
                <Text
                  style={[
                    styles.dayNumber,
                    selected && styles.daySelectedText,
                    !selected && isDayToday && styles.dayTodayText,
                  ]}
                >
                  {day.getDate()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <IconButton
          name="chevron-forward"
          accessibilityLabel="Next day"
          onPress={() => setSelectedDate((d) => addDays(d, 1))}
        />
      </View>

      {!isToday && (
        <Text style={styles.todayLink} onPress={() => setSelectedDate(new Date())}>
          Jump to Today
        </Text>
      )}

      {schedule.isLoading && <ActivityIndicator style={styles.spacer} color={colors.primary} />}
      {schedule.isError && (
        <Text style={styles.error}>Could not load the schedule. Pull to refresh.</Text>
      )}

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={schedule.isFetching}
            onRefresh={() => schedule.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {schedule.data && schedule.data.length === 0 && (
          <EmptyState
            icon="calendar-outline"
            title={isToday ? "Nothing scheduled today" : "Nothing scheduled"}
            subtitle="Tasks you schedule for this day will appear here."
          />
        )}
        {schedule.data?.map((task) => (
          <View key={task.id} style={styles.timelineRow}>
            <Text style={styles.timeLabel}>{formatTime(task.scheduledAt)}</Text>
            <View style={styles.timelineCard}>
              <TaskCard
                task={task}
                subtitle={task.deadline ? `Due ${formatDeadline(task.deadline)}` : undefined}
              />
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  title: {
    fontSize: fontSize.screenTitle,
    fontFamily: fontFamily.heading,
    color: colors.textPrimary,
  },
  monthLabel: { fontSize: fontSize.body, color: colors.textSecondary, marginTop: 2 },
  stripRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
  strip: { flex: 1, flexDirection: "row", justifyContent: "space-between" },
  dayPill: {
    width: 38,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    alignItems: "center",
    gap: 2,
  },
  dayPillSelected: { backgroundColor: colors.primary },
  dayWeekday: { fontSize: fontSize.tiny, color: colors.textMuted, fontWeight: "600" },
  dayNumber: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: "700" },
  daySelectedText: { color: colors.textOnPrimary },
  dayTodayText: { color: colors.primary },
  todayLink: {
    color: colors.primary,
    textAlign: "center",
    fontSize: fontSize.meta,
    fontWeight: "600",
    marginTop: spacing.sm,
  },
  spacer: { marginTop: spacing.xl },
  error: { color: colors.danger, marginTop: spacing.xl, textAlign: "center" },
  list: { padding: spacing.xl, gap: spacing.md, flexGrow: 1 },
  timelineRow: { flexDirection: "row", gap: spacing.sm },
  timeLabel: {
    width: 52,
    fontSize: fontSize.meta,
    color: colors.textSecondary,
    fontWeight: "600",
    paddingTop: spacing.md,
  },
  timelineCard: { flex: 1 },
});

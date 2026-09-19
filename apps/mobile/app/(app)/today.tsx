import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getLocalDayBoundaries } from "../../src/features/tasks/dateBoundaries";
import { TaskCard } from "../../src/features/tasks/TaskCard";
import { useToday } from "../../src/features/tasks/useTasks";
import { EmptyState } from "../../src/ui/EmptyState";
import { IconButton } from "../../src/ui/IconButton";
import { Screen } from "../../src/ui/Screen";
import { SectionHeader } from "../../src/ui/SectionHeader";
import { colors, fontFamily, fontSize, radius, spacing } from "../../src/ui/theme";

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatOverdueDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatHeaderDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function SummaryTile({
  count,
  label,
  fg,
  bg,
}: {
  count: number;
  label: string;
  fg: string;
  bg: string;
}) {
  return (
    <View style={[tileStyles.tile, { backgroundColor: bg }]}>
      <Text style={[tileStyles.count, { color: fg }]}>{count}</Text>
      <Text style={[tileStyles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

const tileStyles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    gap: 2,
  },
  count: { fontSize: fontSize.sectionTitle + 3, fontWeight: "800" },
  label: { fontSize: fontSize.small, fontWeight: "600" },
});

export default function TodayScreen() {
  const router = useRouter();
  // Recomputed on every render, including on pull-to-refresh, so a session
  // left open across midnight picks up the new local day — the client, not
  // the server, owns "what day is it" (ARCHITECTURE.md §3, EC-8).
  const now = new Date();
  const range = getLocalDayBoundaries(now);
  const today = useToday(range);

  if (today.isLoading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  if (today.isError || !today.data) {
    return (
      <Screen style={styles.centered}>
        <Text style={styles.error}>Could not load today&apos;s tasks. Pull to refresh.</Text>
      </Screen>
    );
  }

  // Preserves the exact M5 classification: overdue ∪ scheduled-today ∪
  // due-today, deduplicated server-side — this screen only presents it.
  const { overdue, scheduledToday, dueToday } = today.data;
  const isEmpty = overdue.length === 0 && scheduledToday.length === 0 && dueToday.length === 0;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={today.isFetching}
            onRefresh={() => today.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        <View>
          <Text style={styles.title}>Today</Text>
          <Text style={styles.subtitle}>{formatHeaderDate(now)}</Text>
        </View>

        {!isEmpty && (
          <View style={styles.summaryRow}>
            <SummaryTile
              count={overdue.length}
              label="Overdue"
              fg={colors.danger}
              bg={colors.dangerBg}
            />
            <SummaryTile
              count={scheduledToday.length}
              label="Scheduled"
              fg={colors.info}
              bg={colors.infoBg}
            />
            <SummaryTile
              count={dueToday.length}
              label="Due Today"
              fg={colors.warning}
              bg={colors.warningBg}
            />
          </View>
        )}

        {isEmpty && (
          <EmptyState
            icon="checkmark-circle-outline"
            title="You're all clear for today"
            subtitle="Nothing needs your attention right now."
          />
        )}

        {overdue.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Overdue" count={overdue.length} tone="danger" />
            <View style={styles.cardList}>
              {overdue.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  subtitle={`Due ${formatOverdueDate(task.deadline)}`}
                  subtitleTone="danger"
                />
              ))}
            </View>
          </View>
        )}

        {scheduledToday.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Scheduled" count={scheduledToday.length} />
            <View style={styles.cardList}>
              {scheduledToday.map((task) => (
                <TaskCard key={task.id} task={task} subtitle={formatTime(task.scheduledAt)} />
              ))}
            </View>
          </View>
        )}

        {dueToday.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Due Today" count={dueToday.length} />
            <View style={styles.cardList}>
              {dueToday.map((task) => (
                <TaskCard key={task.id} task={task} subtitle={`Due ${formatTime(task.deadline)}`} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <IconButton
        name="add"
        variant="floating"
        accessibilityLabel="Create task"
        style={styles.fab}
        onPress={() => router.push("/tasks/new")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.xl, flexGrow: 1, paddingBottom: spacing.xxl * 2 },
  centered: { alignItems: "center", justifyContent: "center" },
  title: {
    fontSize: fontSize.screenTitle,
    fontFamily: fontFamily.heading,
    color: colors.textPrimary,
  },
  subtitle: { fontSize: fontSize.body, color: colors.textSecondary, marginTop: 2 },
  summaryRow: { flexDirection: "row", gap: spacing.sm },
  error: { color: colors.danger, textAlign: "center" },
  section: { gap: spacing.sm },
  cardList: { gap: spacing.sm },
  fab: { position: "absolute", right: spacing.xl, bottom: spacing.xl },
});

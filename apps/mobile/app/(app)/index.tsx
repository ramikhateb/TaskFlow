import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useDebouncedValue } from "../../src/lib/useDebouncedValue";
import { hasActiveTaskFilters, useTaskFilterStore } from "../../src/stores/taskFilterStore";
import { TaskFilterModal } from "../../src/features/tasks/TaskFilterModal";
import { TaskCard } from "../../src/features/tasks/TaskCard";
import { TASK_VIEW_OPTIONS, filterTasksByView } from "../../src/features/tasks/taskView";
import { useTasks } from "../../src/features/tasks/useTasks";
import { EmptyState } from "../../src/ui/EmptyState";
import { IconButton } from "../../src/ui/IconButton";
import { Screen } from "../../src/ui/Screen";
import { SegmentedControl } from "../../src/ui/SegmentedControl";
import { colors, fontFamily, fontSize, radius, spacing } from "../../src/ui/theme";

const SEARCH_DEBOUNCE_MS = 400;

export default function TaskListScreen() {
  const router = useRouter();
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  const view = useTaskFilterStore((s) => s.view);
  const priority = useTaskFilterStore((s) => s.priority);
  const category = useTaskFilterStore((s) => s.category);
  const activeQuery = useTaskFilterStore((s) => s.q);
  const setView = useTaskFilterStore((s) => s.setView);
  const setPriority = useTaskFilterStore((s) => s.setPriority);
  const setCategory = useTaskFilterStore((s) => s.setCategory);
  const setQuery = useTaskFilterStore((s) => s.setQuery);
  const clearAll = useTaskFilterStore((s) => s.clearAll);

  // Seeded from the store (not "") so the box shows the right text even if
  // this screen remounts while a search/filter is still active elsewhere.
  const [searchDraft, setSearchDraft] = useState(activeQuery);
  const debouncedQuery = useDebouncedValue(searchDraft, SEARCH_DEBOUNCE_MS);

  // Only the debounced value reaches the store (and therefore the network) —
  // typing itself never fires a request per keystroke.
  useEffect(() => {
    setQuery(debouncedQuery);
  }, [debouncedQuery, setQuery]);

  const filtersActive = hasActiveTaskFilters({ priority, category, q: activeQuery });
  const activeFilterChips = [
    priority && { key: "priority", label: priority.toLowerCase(), clear: () => setPriority(null) },
    category && { key: "category", label: category, clear: () => setCategory(null) },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  // The All/Active/Completed split is client-side (see taskView.ts) over
  // whatever the server already returned for the priority/category/search
  // filters — there's no single status filter that expresses "TODO or
  // IN_PROGRESS" in one request.
  const tasks = useTasks({
    priority: priority ?? undefined,
    category: category ?? undefined,
    q: activeQuery,
  });
  const viewTasks = tasks.data ? filterTasksByView(tasks.data, view) : undefined;

  function clearEverything() {
    clearAll();
    setSearchDraft("");
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Tasks</Text>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={17} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search tasks"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Search tasks"
            returnKeyType="search"
            value={searchDraft}
            onChangeText={setSearchDraft}
          />
        </View>
        <IconButton
          name="options-outline"
          variant={filtersActive ? "primary" : "default"}
          accessibilityLabel={filtersActive ? "Filters (active)" : "Filters"}
          onPress={() => setFilterModalVisible(true)}
        />
      </View>

      <View style={styles.viewTabs}>
        <SegmentedControl options={TASK_VIEW_OPTIONS} value={view} onChange={setView} />
      </View>

      {activeFilterChips.length > 0 && (
        <FlatList
          horizontal
          data={activeFilterChips}
          keyExtractor={(chip) => chip.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item }) => (
            <View style={styles.activeChip}>
              <Text style={styles.activeChipText}>{item.label}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.label} filter`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={item.clear}
              >
                <Ionicons name="close" size={13} color={colors.primaryPressed} />
              </TouchableOpacity>
            </View>
          )}
          ListFooterComponent={
            <Text style={styles.clearAllLink} onPress={clearEverything}>
              Clear all
            </Text>
          }
        />
      )}

      {tasks.isLoading && <ActivityIndicator style={styles.spacer} color={colors.primary} />}

      {tasks.isError && (
        <Text style={styles.error}>
          Could not load tasks:{" "}
          {tasks.error instanceof Error ? tasks.error.message : "unknown error"}
        </Text>
      )}

      {viewTasks && viewTasks.length === 0 && filtersActive && (
        <EmptyState
          icon="search-outline"
          title="No matching tasks"
          subtitle="Try changing your search or filters."
        />
      )}

      {viewTasks && viewTasks.length === 0 && !filtersActive && view === "all" && (
        <EmptyState
          icon="checkbox-outline"
          title="No tasks yet"
          subtitle="Create your first task to get started."
        />
      )}

      {viewTasks && viewTasks.length === 0 && !filtersActive && view === "active" && (
        <EmptyState
          icon="checkbox-outline"
          title="Nothing active"
          subtitle="Tasks you haven't finished yet will appear here."
        />
      )}

      {viewTasks && viewTasks.length === 0 && !filtersActive && view === "completed" && (
        <EmptyState
          icon="checkmark-circle-outline"
          title="No completed tasks yet"
          subtitle="Tasks you mark done will appear here."
        />
      )}

      {viewTasks && viewTasks.length > 0 && (
        <FlatList
          data={viewTasks}
          keyExtractor={(task) => task.id}
          renderItem={({ item }) => <TaskCard task={item} />}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <TaskFilterModal visible={filterModalVisible} onClose={() => setFilterModalVisible(false)} />

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
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  title: {
    fontSize: fontSize.screenTitle,
    fontFamily: fontFamily.heading,
    color: colors.textPrimary,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  searchRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary },
  viewTabs: { paddingHorizontal: spacing.xl, marginTop: spacing.md },
  chipRow: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    marginTop: spacing.md,
    alignItems: "center",
  },
  activeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  activeChipText: { fontSize: fontSize.small, color: colors.primaryPressed, fontWeight: "600" },
  clearAllLink: {
    color: colors.danger,
    fontWeight: "600",
    fontSize: fontSize.small,
    marginLeft: spacing.xs,
  },
  spacer: { marginTop: spacing.xl },
  error: {
    marginTop: spacing.xl,
    marginHorizontal: spacing.xl,
    color: colors.danger,
    textAlign: "center",
  },
  list: { padding: spacing.xl, gap: spacing.sm, paddingBottom: spacing.xxl * 2 },
  fab: { position: "absolute", right: spacing.xl, bottom: spacing.xl },
});

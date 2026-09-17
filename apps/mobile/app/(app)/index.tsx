import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
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
import { TaskRow } from "../../src/features/tasks/TaskRow";
import { useTasks } from "../../src/features/tasks/useTasks";

const SEARCH_DEBOUNCE_MS = 400;

export default function TaskListScreen() {
  const router = useRouter();
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  const status = useTaskFilterStore((s) => s.status);
  const priority = useTaskFilterStore((s) => s.priority);
  const category = useTaskFilterStore((s) => s.category);
  const activeQuery = useTaskFilterStore((s) => s.q);
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

  const filtersActive = hasActiveTaskFilters({ status, priority, category, q: activeQuery });
  const tasks = useTasks({
    status: status ?? undefined,
    priority: priority ?? undefined,
    category: category ?? undefined,
    q: activeQuery,
  });

  function clearEverything() {
    clearAll();
    setSearchDraft("");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tasks</Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search tasks..."
          accessibilityLabel="Search tasks"
          value={searchDraft}
          onChangeText={setSearchDraft}
        />
        <TouchableOpacity
          style={[styles.filterButton, filtersActive && styles.filterButtonActive]}
          accessibilityRole="button"
          accessibilityLabel="Filters"
          onPress={() => setFilterModalVisible(true)}
        >
          <Text style={[styles.filterButtonText, filtersActive && styles.filterButtonTextActive]}>
            Filters{filtersActive ? " •" : ""}
          </Text>
        </TouchableOpacity>
      </View>

      {filtersActive && (
        <TouchableOpacity accessibilityRole="button" onPress={clearEverything}>
          <Text style={styles.clearAllLink}>Clear all filters</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.newButton}
        accessibilityRole="button"
        onPress={() => router.push("/tasks/new")}
      >
        <Text style={styles.newButtonText}>+ New Task</Text>
      </TouchableOpacity>

      {tasks.isLoading && <ActivityIndicator style={styles.spacer} />}

      {tasks.isError && (
        <Text style={styles.error}>
          Could not load tasks:{" "}
          {tasks.error instanceof Error ? tasks.error.message : "unknown error"}
        </Text>
      )}

      {tasks.data && tasks.data.length === 0 && filtersActive && (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyInBlock}>No tasks match your search or filters.</Text>
          <TouchableOpacity accessibilityRole="button" onPress={clearEverything}>
            <Text style={styles.clearAllLink}>Clear filters</Text>
          </TouchableOpacity>
        </View>
      )}

      {tasks.data && tasks.data.length === 0 && !filtersActive && (
        <Text style={styles.empty}>No tasks yet — create your first one above.</Text>
      )}

      {tasks.data && tasks.data.length > 0 && (
        <FlatList
          data={tasks.data}
          keyExtractor={(task) => task.id}
          renderItem={({ item }) => <TaskRow task={item} />}
          style={styles.list}
        />
      )}

      <TaskFilterModal visible={filterModalVisible} onClose={() => setFilterModalVisible(false)} />

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 24 },
  title: { fontSize: 28, fontWeight: "700" },
  searchRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  filterButton: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  filterButtonActive: { backgroundColor: "#1a7f37", borderColor: "#1a7f37" },
  filterButtonText: { color: "#333", fontWeight: "600", fontSize: 13 },
  filterButtonTextActive: { color: "#fff" },
  clearAllLink: { color: "#c0392b", fontWeight: "600", marginTop: 8, fontSize: 13 },
  newButton: {
    backgroundColor: "#1a7f37",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginTop: 16,
  },
  newButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  spacer: { marginTop: 24 },
  emptyBlock: { marginTop: 24, alignItems: "center", gap: 8 },
  emptyInBlock: { color: "#666", textAlign: "center" },
  empty: { marginTop: 24, color: "#666", textAlign: "center" },
  error: { marginTop: 24, color: "#c0392b", textAlign: "center" },
  list: { marginTop: 16 },
});

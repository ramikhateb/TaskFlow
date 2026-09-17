import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { TaskRow } from "../../src/features/tasks/TaskRow";
import { useTasks } from "../../src/features/tasks/useTasks";

export default function TaskListScreen() {
  const router = useRouter();
  const tasks = useTasks();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tasks</Text>

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

      {tasks.data && tasks.data.length === 0 && (
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

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 24 },
  title: { fontSize: 28, fontWeight: "700" },
  newButton: {
    backgroundColor: "#1a7f37",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginTop: 16,
  },
  newButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  spacer: { marginTop: 24 },
  empty: { marginTop: 24, color: "#666", textAlign: "center" },
  error: { marginTop: 24, color: "#c0392b", textAlign: "center" },
  list: { marginTop: 16 },
});

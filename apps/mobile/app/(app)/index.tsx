import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import type { TaskResponse } from "@taskflow/shared";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLogout, useMe } from "../../src/features/auth/useAuth";
import { useDeleteTask, useTasks, useUpdateTask } from "../../src/features/tasks/useTasks";

// Product decision (2026-09-15): TODO/IN_PROGRESS/DONE are fully
// interchangeable, so a task can be completed or reopened directly, in one
// tap, regardless of its current status. CANCELLED remains terminal.
function nextStepFor(
  status: TaskResponse["status"],
): { label: string; to: TaskResponse["status"] } | null {
  switch (status) {
    case "TODO":
    case "IN_PROGRESS":
      return { label: "Mark Done", to: "DONE" };
    case "DONE":
      return { label: "Mark Not Done", to: "TODO" };
    case "CANCELLED":
      return null;
  }
}

function TaskRow({ task }: { task: TaskResponse }) {
  const router = useRouter();
  const updateTask = useUpdateTask(task.id);
  const deleteTask = useDeleteTask();
  const nextStep = nextStepFor(task.status);

  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.rowMain} onPress={() => router.push(`/tasks/${task.id}`)}>
        <Text style={[styles.rowTitle, task.status === "DONE" && styles.rowTitleDone]}>
          {task.title}
        </Text>
        <Text style={styles.rowStatus}>{task.status.replace("_", " ")}</Text>
      </TouchableOpacity>

      <View style={styles.rowActions}>
        {nextStep && (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={updateTask.isPending}
            onPress={() => updateTask.mutate({ status: nextStep.to })}
          >
            <Text style={styles.actionText}>{nextStep.label}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          accessibilityRole="button"
          disabled={deleteTask.isPending}
          onPress={() => deleteTask.mutate(task.id)}
        >
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function TaskListScreen() {
  const router = useRouter();
  const me = useMe();
  const logout = useLogout();
  const tasks = useTasks();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>TaskFlow</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => logout.mutate()}>
          <Text style={styles.signOut}>Sign Out</Text>
        </TouchableOpacity>
      </View>
      {me.data && <Text style={styles.subtitle}>Signed in as {me.data.name}</Text>}

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
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 28, fontWeight: "700" },
  subtitle: { fontSize: 13, color: "#666", marginTop: 2 },
  signOut: { color: "#c0392b", fontWeight: "600" },
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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    gap: 8,
  },
  rowMain: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: "600" },
  rowTitleDone: { textDecorationLine: "line-through", color: "#888" },
  rowStatus: { fontSize: 12, color: "#666", marginTop: 2 },
  rowActions: { flexDirection: "row", gap: 16 },
  actionText: { color: "#1a7f37", fontWeight: "600" },
  deleteText: { color: "#c0392b", fontWeight: "600" },
});

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import type { TaskResponse } from "@taskflow/shared";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useDeleteTask, useTask, useUpdateTask } from "../../../src/features/tasks/useTasks";

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

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const task = useTask(id);
  const updateTask = useUpdateTask(id);
  const deleteTask = useDeleteTask();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Seed local edit fields once the task loads.
  useEffect(() => {
    if (task.data) {
      setTitle(task.data.title);
      setDescription(task.data.description ?? "");
    }
  }, [task.data]);

  if (task.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (task.isError || !task.data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Could not load this task.</Text>
      </View>
    );
  }

  const nextStep = nextStepFor(task.data.status);

  return (
    <View style={styles.container}>
      <Text style={styles.status}>{task.data.status.replace("_", " ")}</Text>

      <TextInput
        style={styles.input}
        placeholder="Title"
        accessibilityLabel="Title"
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Description"
        accessibilityLabel="Description"
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <TouchableOpacity
        style={styles.button}
        accessibilityRole="button"
        disabled={updateTask.isPending}
        onPress={() => updateTask.mutate({ title, description: description.trim() || null })}
      >
        {updateTask.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Save</Text>
        )}
      </TouchableOpacity>

      {nextStep && (
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          accessibilityRole="button"
          disabled={updateTask.isPending}
          onPress={() => updateTask.mutate({ status: nextStep.to })}
        >
          <Text style={styles.secondaryButtonText}>{nextStep.label}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.button, styles.deleteButton]}
        accessibilityRole="button"
        disabled={deleteTask.isPending}
        onPress={() => deleteTask.mutate(id, { onSuccess: () => router.back() })}
      >
        <Text style={styles.deleteButtonText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  status: { fontSize: 13, color: "#666", fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  button: {
    backgroundColor: "#1a7f37",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondaryButton: { backgroundColor: "#eef7ee" },
  secondaryButtonText: { color: "#1a7f37", fontSize: 16, fontWeight: "600" },
  deleteButton: { backgroundColor: "#fdecea" },
  deleteButtonText: { color: "#c0392b", fontSize: 16, fontWeight: "600" },
  error: { color: "#c0392b" },
});

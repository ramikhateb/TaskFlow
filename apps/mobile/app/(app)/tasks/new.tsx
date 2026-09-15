import { useRouter } from "expo-router";
import { useState } from "react";
import type { TaskPriority } from "@taskflow/shared";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { ApiError } from "../../../src/api/client";
import { DateTimeField } from "../../../src/features/tasks/DateTimeField";
import { PrioritySelector } from "../../../src/features/tasks/PrioritySelector";
import { useCreateTask } from "../../../src/features/tasks/useTasks";

export default function NewTaskScreen() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [category, setCategory] = useState("");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const createTask = useCreateTask();

  const errorMessage = createTask.isError
    ? createTask.error instanceof ApiError && createTask.error.status === 400
      ? "Please check the task details and try again"
      : "Something went wrong. Please try again."
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>New Task</Text>

      <TextInput
        style={styles.input}
        placeholder="Title"
        accessibilityLabel="Title"
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Description (optional)"
        accessibilityLabel="Description"
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <PrioritySelector value={priority} onChange={setPriority} />

      <TextInput
        style={styles.input}
        placeholder="Category (optional)"
        accessibilityLabel="Category"
        value={category}
        onChangeText={setCategory}
      />

      <DateTimeField
        label="Scheduled — when you plan to do this"
        value={scheduledAt}
        onChange={setScheduledAt}
      />
      <DateTimeField
        label="Deadline — when it must be done by"
        value={deadline}
        onChange={setDeadline}
      />

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      <TouchableOpacity
        style={styles.button}
        accessibilityRole="button"
        disabled={createTask.isPending}
        onPress={() =>
          createTask.mutate(
            {
              title,
              description: description.trim() || undefined,
              priority,
              category: category.trim() || undefined,
              scheduledAt: scheduledAt ? scheduledAt.toISOString() : undefined,
              deadline: deadline ? deadline.toISOString() : undefined,
            },
            { onSuccess: () => router.back() },
          )
        }
      >
        {createTask.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Create</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: "700" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  button: { backgroundColor: "#1a7f37", borderRadius: 8, padding: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  error: { color: "#c0392b" },
});

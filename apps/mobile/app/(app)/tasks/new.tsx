import { useRouter } from "expo-router";
import { useState } from "react";
import type { TaskPriority } from "@taskflow/shared";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import { colors, fontSize, radius, spacing } from "../../../src/ui/theme";

export default function NewTaskScreen() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [category, setCategory] = useState("");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const createTask = useCreateTask();

  // A deadline before the chosen scheduled time can never be saved
  // (REQUIREMENTS.md EC-13) — caught here for immediate feedback, re-checked
  // by the server regardless (Phase 6: understandable before *and* after
  // server validation).
  const hasDeadlineConflict =
    scheduledAt !== null && deadline !== null && deadline.getTime() < scheduledAt.getTime();

  const errorMessage = createTask.isError
    ? createTask.error instanceof ApiError && createTask.error.status === 400
      ? "Please check the task details and try again"
      : "Something went wrong. Please try again."
    : null;

  const canSubmit = title.trim().length > 0 && !hasDeadlineConflict && !createTask.isPending;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.title}>New Task</Text>

        <TextInput
          style={styles.input}
          placeholder="Title"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Title"
          returnKeyType="next"
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Description (optional)"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Description"
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <PrioritySelector value={priority} onChange={setPriority} />

        <TextInput
          style={styles.input}
          placeholder="Category (optional)"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Category"
          returnKeyType="done"
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
        {hasDeadlineConflict && (
          <Text style={styles.error} accessibilityRole="alert">
            The deadline is before the scheduled time — pick a deadline on or after it.
          </Text>
        )}

        {errorMessage && (
          <Text style={styles.error} accessibilityRole="alert">
            {errorMessage}
          </Text>
        )}

        <TouchableOpacity
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
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
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.buttonText}>Create</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { fontSize: fontSize.xl, fontWeight: "700", color: colors.textPrimary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: "600" },
  error: { color: colors.danger, fontSize: fontSize.body },
});

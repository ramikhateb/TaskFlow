import { useRouter } from "expo-router";
import { useState } from "react";
import type { TaskPriority } from "@taskflow/shared";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";
import { ApiError } from "../../src/api/client";
import { DateTimeField } from "../../src/features/tasks/DateTimeField";
import { PrioritySelector } from "../../src/features/tasks/PrioritySelector";
import { useCreateTask } from "../../src/features/tasks/useTasks";
import { Button } from "../../src/ui/Button";
import { FormField, TextField } from "../../src/ui/FormField";
import { Screen } from "../../src/ui/Screen";
import { ScreenHeader } from "../../src/ui/ScreenHeader";
import { colors, fontSize, spacing } from "../../src/ui/theme";

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
  // by the server regardless.
  const hasDeadlineConflict =
    scheduledAt !== null && deadline !== null && deadline.getTime() < scheduledAt.getTime();

  const errorMessage = createTask.isError
    ? createTask.error instanceof ApiError && createTask.error.status === 400
      ? "Please check the task details and try again"
      : "Something went wrong. Please try again."
    : null;

  const canSubmit = title.trim().length > 0 && !hasDeadlineConflict && !createTask.isPending;

  return (
    <Screen>
      <ScreenHeader title="New Task" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <TextField
            label="Title"
            placeholder="What needs to get done?"
            accessibilityLabel="Title"
            returnKeyType="next"
            value={title}
            onChangeText={setTitle}
          />
          <TextField
            label="Description"
            placeholder="Add details (optional)"
            accessibilityLabel="Description"
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <FormField label="Priority">
            <PrioritySelector value={priority} onChange={setPriority} />
          </FormField>

          <TextField
            label="Category"
            placeholder="e.g. Work, Home (optional)"
            accessibilityLabel="Category"
            returnKeyType="done"
            value={category}
            onChangeText={setCategory}
          />

          <DateTimeField
            label="Schedule — when you plan to do this"
            icon="calendar-outline"
            value={scheduledAt}
            onChange={setScheduledAt}
          />
          <DateTimeField
            label="Deadline — when it must be done by"
            icon="flag-outline"
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

          <Button
            label="Create Task"
            loading={createTask.isPending}
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
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  error: { color: colors.danger, fontSize: fontSize.meta },
});

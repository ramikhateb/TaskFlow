import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import type {
  PublicUser,
  TaskAssignmentResponse,
  TaskPriority,
  TaskResponse,
} from "@taskflow/shared";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { DateTimeField } from "../../../src/features/tasks/DateTimeField";
import {
  PRIORITY_COLORS,
  priorityLabel,
  PrioritySelector,
} from "../../../src/features/tasks/PrioritySelector";
import { canAssignTask } from "../../../src/features/tasks/assignmentEligibility";
import {
  useCancelAssignment,
  useCreateAssignment,
} from "../../../src/features/tasks/useAssignments";
import { useDeleteTask, useTask, useUpdateTask } from "../../../src/features/tasks/useTasks";
import { UserSearchField } from "../../../src/features/users/UserSearchField";
import { colors, disabledOpacity, fontSize, radius, spacing } from "../../../src/ui/theme";

/**
 * The task detail screen's only new M8 surface. Deliberately self-contained
 * here rather than promoted to its own shared component: it's used from
 * exactly one screen, and folding it into a separate file would just spread
 * this one small piece of state (which panel is open) across two files.
 *
 * Sending or cancelling never changes the task itself — only this section
 * re-renders in response (via useTask's `pendingAssignment` field); the
 * rest of the screen (title, status, etc.) is untouched, matching the core
 * M8 invariant that responsibility hasn't transferred.
 */
function AssignmentSection({
  taskId,
  taskStatus,
  pendingAssignment,
}: {
  taskId: string;
  taskStatus: TaskResponse["status"];
  pendingAssignment: TaskAssignmentResponse | null;
}) {
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PublicUser | null>(null);
  const [message, setMessage] = useState("");
  const createAssignment = useCreateAssignment(taskId);
  const cancelAssignment = useCancelAssignment(taskId);

  if (pendingAssignment) {
    return (
      <View style={styles.assignmentBanner}>
        <Text style={styles.assignmentBannerLabel}>Pending assignment</Text>
        <Text style={styles.assignmentBannerName}>{pendingAssignment.toUser.name}</Text>
        <Text style={styles.assignmentBannerUsername}>@{pendingAssignment.toUser.username}</Text>
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          accessibilityRole="button"
          disabled={cancelAssignment.isPending}
          onPress={() => cancelAssignment.mutate(pendingAssignment.id)}
        >
          {cancelAssignment.isPending ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.secondaryButtonText}>Cancel Assignment</Text>
          )}
        </TouchableOpacity>
        {cancelAssignment.isError && (
          <Text style={styles.error} accessibilityRole="alert">
            Could not cancel — it may have already been resolved. Pull to refresh.
          </Text>
        )}
      </View>
    );
  }

  if (!canAssignTask(taskStatus)) {
    return null;
  }

  if (!isAssigning) {
    return (
      <TouchableOpacity
        style={[styles.button, styles.secondaryButton]}
        accessibilityRole="button"
        onPress={() => setIsAssigning(true)}
      >
        <Text style={styles.secondaryButtonText}>Assign to someone</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.assignPanel}>
      <UserSearchField onSelectUser={setSelectedUser} selectedUserId={selectedUser?.id ?? null} />
      {selectedUser && (
        <TextInput
          style={styles.input}
          placeholder="Add a message (optional)"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Assignment message"
          value={message}
          onChangeText={setMessage}
        />
      )}
      <View style={styles.assignPanelActions}>
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton, styles.assignPanelButton]}
          accessibilityRole="button"
          onPress={() => {
            setIsAssigning(false);
            setSelectedUser(null);
            setMessage("");
          }}
        >
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.assignPanelButton]}
          accessibilityRole="button"
          disabled={!selectedUser || createAssignment.isPending}
          onPress={() => {
            if (!selectedUser) return;
            createAssignment.mutate(
              { toUserId: selectedUser.id, message: message.trim() || undefined },
              {
                onSuccess: () => {
                  setIsAssigning(false);
                  setSelectedUser(null);
                  setMessage("");
                },
              },
            );
          }}
        >
          {createAssignment.isPending ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.buttonText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
      {createAssignment.isError && (
        <Text style={styles.error} accessibilityRole="alert">
          Could not send — please try again.
        </Text>
      )}
    </View>
  );
}

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
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [category, setCategory] = useState("");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [deadline, setDeadline] = useState<Date | null>(null);

  // Seed local edit fields once the task loads.
  useEffect(() => {
    if (task.data) {
      setTitle(task.data.title);
      setDescription(task.data.description ?? "");
      setPriority(task.data.priority);
      setCategory(task.data.category ?? "");
      setScheduledAt(task.data.scheduledAt ? new Date(task.data.scheduledAt) : null);
      setDeadline(task.data.deadline ? new Date(task.data.deadline) : null);
    }
  }, [task.data]);

  if (task.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  // Phase 7-F: stale/deleted/not-found — say so plainly rather than leaving
  // a blank or broken-looking screen, and offer a way back.
  if (task.isError || !task.data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>
          This task couldn&apos;t be found — it may have been deleted.
        </Text>
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton, styles.backButton]}
          accessibilityRole="button"
          onPress={() => router.back()}
        >
          <Text style={styles.secondaryButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const nextStep = nextStepFor(task.data.status);
  // M10 (FR-32): the server is the sole authority on what this viewer may
  // do — `viewer` is computed by TaskService.getTaskDetail, never inferred
  // here from missing fields or fragile id comparisons. `canEdit`/
  // `canDelete` already fold in BOTH reasons a mutation might be
  // unavailable: the caller isn't the current assignee at all (creator-only,
  // M10), or they are the assignee but a PENDING assignment currently
  // freezes the task (FR-13/EC-5, M8) — the two are distinguished below only
  // to show the right explanatory copy, not to re-derive authorization.
  const { viewer } = task.data;
  const isFrozenByPending = viewer.isAssignee && !viewer.canEdit;
  const hasDeadlineConflict =
    scheduledAt !== null && deadline !== null && deadline.getTime() < scheduledAt.getTime();

  function confirmDelete() {
    // Phase 12 (destructive actions): hard-delete cascades this task's
    // entire assignment history (EC-17) and can't be undone — a plain tap
    // is not enough friction for that.
    Alert.alert("Delete this task?", "This can't be undone and removes its request history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteTask.mutate(id, { onSuccess: () => router.back() }),
      },
    ]);
  }

  // Creator-only viewer (M10): a completely different, read-only screen —
  // no edit form, no Save/Mark Done/Delete, no assign flow (only the
  // current assignee may send/cancel assignments). scheduledAt is never
  // rendered here at all, on top of the server already sending it as null
  // for this viewer — belt and suspenders against ever displaying it.
  if (!viewer.isAssignee) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.statusRow}>
          <Text style={styles.status}>{task.data.status.replace("_", " ")}</Text>
          <Text style={[styles.priorityBadge, { color: PRIORITY_COLORS[task.data.priority] }]}>
            {priorityLabel(task.data.priority)} priority
          </Text>
        </View>

        <View style={styles.readOnlyNotice}>
          <Text style={styles.readOnlyNoticeText}>
            Assigned to {task.data.assignee.name} · @{task.data.assignee.username} — you created
            this task but are no longer responsible for it, so it&apos;s read-only here.
          </Text>
        </View>

        <Text style={styles.readOnlyTitle}>{task.data.title}</Text>
        {task.data.description && (
          <Text style={styles.readOnlyDescription}>{task.data.description}</Text>
        )}
        {task.data.category && (
          <Text style={styles.readOnlyMeta}>Category: {task.data.category}</Text>
        )}
        {task.data.deadline && (
          <Text style={styles.readOnlyMeta}>
            Deadline:{" "}
            {new Date(task.data.deadline).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </Text>
        )}
        {task.data.pendingAssignment && (
          <Text style={styles.readOnlyMeta}>
            Pending transfer to {task.data.pendingAssignment.toUser.name} · @
            {task.data.pendingAssignment.toUser.username}
          </Text>
        )}
      </ScrollView>
    );
  }

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
        <View style={styles.statusRow}>
          <Text style={styles.status}>{task.data.status.replace("_", " ")}</Text>
          <Text style={[styles.priorityBadge, { color: PRIORITY_COLORS[task.data.priority] }]}>
            {priorityLabel(task.data.priority)} priority
          </Text>
        </View>

        {isFrozenByPending && (
          <View style={styles.frozenNotice} accessibilityRole="text">
            <Text style={styles.frozenNoticeText}>
              Awaiting {task.data.pendingAssignment!.toUser.name}&apos;s response — editing,
              completing, and deleting are disabled until the assignment is cancelled or resolved.
            </Text>
          </View>
        )}

        {task.data.status === "CANCELLED" && (
          <View style={styles.infoNotice}>
            <Text style={styles.infoNoticeText}>
              This task is cancelled. Cancelling is final — it can still be edited, but not
              reopened.
            </Text>
          </View>
        )}

        <TextInput
          style={styles.input}
          placeholder="Title"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Title"
          value={title}
          onChangeText={setTitle}
          editable={viewer.canEdit}
        />
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Description"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          editable={viewer.canEdit}
        />

        <PrioritySelector value={priority} onChange={setPriority} disabled={!viewer.canEdit} />

        <TextInput
          style={styles.input}
          placeholder="Category (optional)"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Category"
          value={category}
          onChangeText={setCategory}
          editable={viewer.canEdit}
        />

        <DateTimeField
          label="Scheduled — when you plan to do this"
          value={scheduledAt}
          onChange={setScheduledAt}
          disabled={!viewer.canEdit}
        />
        <DateTimeField
          label="Deadline — when it must be done by"
          value={deadline}
          onChange={setDeadline}
          disabled={!viewer.canEdit}
        />
        {hasDeadlineConflict && (
          <Text style={styles.error} accessibilityRole="alert">
            The deadline is before the scheduled time — pick a deadline on or after it.
          </Text>
        )}

        <TouchableOpacity
          style={[styles.button, (!viewer.canEdit || hasDeadlineConflict) && styles.buttonDisabled]}
          accessibilityRole="button"
          accessibilityState={{
            disabled: !viewer.canEdit || hasDeadlineConflict || updateTask.isPending,
          }}
          disabled={!viewer.canEdit || hasDeadlineConflict || updateTask.isPending}
          onPress={() =>
            updateTask.mutate({
              title,
              description: description.trim() || null,
              priority,
              category: category.trim() || null,
              scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
              deadline: deadline ? deadline.toISOString() : null,
            })
          }
        >
          {updateTask.isPending ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.buttonText}>Save</Text>
          )}
        </TouchableOpacity>

        {updateTask.isError && (
          <Text style={styles.error} accessibilityRole="alert">
            Could not save — the task may have changed (e.g. a new pending assignment). Pull to
            refresh and try again.
          </Text>
        )}

        {nextStep && (
          <TouchableOpacity
            style={[
              styles.button,
              styles.secondaryButton,
              !viewer.canEdit && styles.buttonDisabled,
            ]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !viewer.canEdit || updateTask.isPending }}
            disabled={!viewer.canEdit || updateTask.isPending}
            onPress={() => updateTask.mutate({ status: nextStep.to })}
          >
            <Text style={styles.secondaryButtonText}>{nextStep.label}</Text>
          </TouchableOpacity>
        )}

        <AssignmentSection
          taskId={id}
          taskStatus={task.data.status}
          pendingAssignment={task.data.pendingAssignment}
        />

        <TouchableOpacity
          style={[styles.button, styles.deleteButton, !viewer.canDelete && styles.buttonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Delete task"
          accessibilityState={{ disabled: !viewer.canDelete || deleteTask.isPending }}
          disabled={!viewer.canDelete || deleteTask.isPending}
          onPress={confirmDelete}
        >
          {deleteTask.isPending ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Text style={styles.deleteButtonText}>Delete</Text>
          )}
        </TouchableOpacity>

        {deleteTask.isError && (
          <Text style={styles.error} accessibilityRole="alert">
            Could not delete — please try again.
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xl * 2 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  backButton: { paddingHorizontal: spacing.xl },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  status: { fontSize: fontSize.body, color: colors.textMuted, fontWeight: "600" },
  priorityBadge: { fontSize: fontSize.body, fontWeight: "700" },
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
  buttonDisabled: { opacity: disabledOpacity },
  buttonText: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: "600" },
  frozenNotice: {
    backgroundColor: colors.warningMuted,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  frozenNoticeText: { color: colors.warning, fontSize: fontSize.body, lineHeight: 18 },
  infoNotice: {
    backgroundColor: colors.infoMuted,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  infoNoticeText: { color: colors.info, fontSize: fontSize.body, lineHeight: 18 },
  secondaryButton: { backgroundColor: colors.primaryMuted },
  secondaryButtonText: { color: colors.primary, fontSize: fontSize.md, fontWeight: "600" },
  deleteButton: { backgroundColor: colors.dangerMuted },
  deleteButtonText: { color: colors.danger, fontSize: fontSize.md, fontWeight: "600" },
  error: { color: colors.danger, fontSize: fontSize.body },
  assignmentBanner: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.md,
    padding: 14,
    gap: spacing.xs,
  },
  assignmentBannerLabel: { fontSize: fontSize.sm, fontWeight: "700", color: colors.primary },
  assignmentBannerName: { fontSize: fontSize.md, fontWeight: "600" },
  assignmentBannerUsername: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  assignPanel: { gap: spacing.md },
  assignPanelActions: { flexDirection: "row", gap: spacing.md },
  assignPanelButton: { flex: 1 },
  readOnlyNotice: {
    backgroundColor: colors.infoMuted,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  readOnlyNoticeText: { color: colors.info, fontSize: fontSize.body, lineHeight: 18 },
  readOnlyTitle: { fontSize: fontSize.xl, fontWeight: "700" },
  readOnlyDescription: { fontSize: fontSize.base, color: colors.textBody },
  readOnlyMeta: { fontSize: fontSize.body, color: colors.textMuted },
});

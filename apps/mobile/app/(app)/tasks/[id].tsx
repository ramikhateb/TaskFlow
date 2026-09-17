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
            <ActivityIndicator color="#1a7f37" />
          ) : (
            <Text style={styles.secondaryButtonText}>Cancel Assignment</Text>
          )}
        </TouchableOpacity>
        {cancelAssignment.isError && (
          <Text style={styles.error}>Could not cancel — please try again.</Text>
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
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
      {createAssignment.isError && (
        <Text style={styles.error}>Could not send — please try again.</Text>
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

  if (task.isError || !task.data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Could not load this task.</Text>
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.statusRow}>
        <Text style={styles.status}>{task.data.status.replace("_", " ")}</Text>
        <Text style={[styles.priorityBadge, { color: PRIORITY_COLORS[task.data.priority] }]}>
          {priorityLabel(task.data.priority)} priority
        </Text>
      </View>

      {isFrozenByPending && (
        <View style={styles.frozenNotice}>
          <Text style={styles.frozenNoticeText}>
            Awaiting {task.data.pendingAssignment!.toUser.name}&apos;s response — editing,
            completing, and deleting are disabled until the assignment is cancelled or resolved.
          </Text>
        </View>
      )}

      <TextInput
        style={styles.input}
        placeholder="Title"
        accessibilityLabel="Title"
        value={title}
        onChangeText={setTitle}
        editable={viewer.canEdit}
      />
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Description"
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

      <TouchableOpacity
        style={[styles.button, !viewer.canEdit && styles.buttonDisabled]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !viewer.canEdit || updateTask.isPending }}
        disabled={!viewer.canEdit || updateTask.isPending}
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
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Save</Text>
        )}
      </TouchableOpacity>

      {updateTask.isError && (
        <Text style={styles.error}>
          Could not save — the task may have changed (e.g. a new pending assignment). Pull to
          refresh and try again.
        </Text>
      )}

      {nextStep && (
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton, !viewer.canEdit && styles.buttonDisabled]}
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
        accessibilityState={{ disabled: !viewer.canDelete || deleteTask.isPending }}
        disabled={!viewer.canDelete || deleteTask.isPending}
        onPress={() => deleteTask.mutate(id, { onSuccess: () => router.back() })}
      >
        <Text style={styles.deleteButtonText}>Delete</Text>
      </TouchableOpacity>

      {deleteTask.isError && <Text style={styles.error}>Could not delete — please try again.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, gap: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  status: { fontSize: 13, color: "#666", fontWeight: "600" },
  priorityBadge: { fontSize: 13, fontWeight: "700" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  button: { backgroundColor: "#1a7f37", borderRadius: 8, padding: 14, alignItems: "center" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  frozenNotice: {
    backgroundColor: "#fff8e1",
    borderRadius: 8,
    padding: 12,
  },
  frozenNoticeText: { color: "#8a6d00", fontSize: 13, lineHeight: 18 },
  secondaryButton: { backgroundColor: "#eef7ee" },
  secondaryButtonText: { color: "#1a7f37", fontSize: 16, fontWeight: "600" },
  deleteButton: { backgroundColor: "#fdecea" },
  deleteButtonText: { color: "#c0392b", fontSize: 16, fontWeight: "600" },
  error: { color: "#c0392b" },
  assignmentBanner: {
    backgroundColor: "#eef7ee",
    borderRadius: 8,
    padding: 14,
    gap: 4,
  },
  assignmentBannerLabel: { fontSize: 12, fontWeight: "700", color: "#1a7f37" },
  assignmentBannerName: { fontSize: 16, fontWeight: "600" },
  assignmentBannerUsername: { fontSize: 14, color: "#666", marginBottom: 8 },
  assignPanel: { gap: 12 },
  assignPanelActions: { flexDirection: "row", gap: 12 },
  assignPanelButton: { flex: 1 },
  readOnlyNotice: {
    backgroundColor: "#eef2f7",
    borderRadius: 8,
    padding: 12,
  },
  readOnlyNoticeText: { color: "#3a4a5c", fontSize: 13, lineHeight: 18 },
  readOnlyTitle: { fontSize: 22, fontWeight: "700" },
  readOnlyDescription: { fontSize: 15, color: "#333" },
  readOnlyMeta: { fontSize: 13, color: "#666" },
});

import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import type { TaskPriority, TaskResponse } from "@taskflow/shared";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { DateTimeField } from "../../src/features/tasks/DateTimeField";
import { PrioritySelector } from "../../src/features/tasks/PrioritySelector";
import { PriorityBadge } from "../../src/features/tasks/PriorityBadge";
import { canAssignTask } from "../../src/features/tasks/assignmentEligibility";
import { useCancelAssignment } from "../../src/features/tasks/useAssignments";
import { useDeleteTask, useTask, useUpdateTask } from "../../src/features/tasks/useTasks";
import { Avatar } from "../../src/ui/Avatar";
import { Button } from "../../src/ui/Button";
import { FormField, TextField } from "../../src/ui/FormField";
import { IconButton } from "../../src/ui/IconButton";
import { Screen } from "../../src/ui/Screen";
import { ScreenHeader } from "../../src/ui/ScreenHeader";
import { colors, fontSize, radius, spacing } from "../../src/ui/theme";

const TASK_STATUS_STYLE: Record<TaskResponse["status"], { label: string; fg: string; bg: string }> =
  {
    TODO: { label: "To Do", fg: colors.textSecondary, bg: colors.neutral },
    IN_PROGRESS: { label: "In Progress", fg: colors.info, bg: colors.infoBg },
    DONE: { label: "Done", fg: colors.success, bg: colors.successBg },
    CANCELLED: { label: "Cancelled", fg: colors.textSecondary, bg: colors.neutral },
  };

function TaskStatusBadge({ status }: { status: TaskResponse["status"] }) {
  const { label, fg, bg } = TASK_STATUS_STYLE[status];
  return (
    <View style={[styles.statusPill, { backgroundColor: bg }]}>
      <Text style={[styles.statusPillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** A single "Label ... Value" row — the building block of every read-only section below. */
function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      {typeof children === "string" ? <Text style={styles.infoValue}>{children}</Text> : children}
    </View>
  );
}

/** A labeled group of InfoRows — Planning, Collaboration, etc. Renders nothing if it has no rows. */
function Section({ label, children }: { label: string; children: ReactNode }) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : [children].filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionBody}>
        {rows.map((row, index) => (
          <View key={index} style={index === rows.length - 1 ? undefined : styles.rowDivider}>
            {row}
          </View>
        ))}
      </View>
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
  const params = useLocalSearchParams<{ id: string | string[] }>();
  // Defensive: Expo Router can hand back an array for a dynamic segment
  // during certain route transitions (e.g. a swipe-back gesture) — normalize
  // to a plain string so a transient re-render can never disable the task
  // query and get mistaken for "this task was deleted".
  const id = Array.isArray(params.id) ? (params.id[0] ?? "") : params.id;
  const router = useRouter();
  const task = useTask(id);
  const updateTask = useUpdateTask(id);
  const deleteTask = useDeleteTask();
  const cancelAssignment = useCancelAssignment(id);

  // Task Details opens in a read-only VIEW MODE by default (item 4 of the
  // Nudge navigation/UX redesign) — a form full of TextInputs is not what
  // "look at a task" should feel like. Edit mode is a local toggle on this
  // same screen (not a separate route) so Save/Cancel trivially "return to
  // Task Details" with no navigation at all; the swipe-back gesture is
  // disabled while editing so it can't be mistaken for "leave the screen"
  // (see the <Stack.Screen> below) — Cancel is the only way out besides Save.
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [category, setCategory] = useState("");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [deadline, setDeadline] = useState<Date | null>(null);

  // Seed local edit fields from the server whenever they change — but never
  // while actively editing, or an in-flight background refetch could
  // silently overwrite what the user is mid-typing.
  useEffect(() => {
    if (task.data && !isEditing) {
      setTitle(task.data.title);
      setDescription(task.data.description ?? "");
      setPriority(task.data.priority);
      setCategory(task.data.category ?? "");
      setScheduledAt(task.data.scheduledAt ? new Date(task.data.scheduledAt) : null);
      setDeadline(task.data.deadline ? new Date(task.data.deadline) : null);
    }
  }, [task.data, isEditing]);

  // A momentarily-empty id (mid navigation-transition) is a transient
  // loading state, not evidence the task is gone — show a spinner rather
  // than risk a false "deleted" message for something that resolves a
  // frame later.
  if (!id || task.isLoading) {
    return (
      <Screen>
        <ScreenHeader title="Task Details" />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  // Stale/deleted/not-found — say so plainly rather than leaving a blank
  // or broken-looking screen, and offer a way back.
  if (task.isError || !task.data) {
    return (
      <Screen>
        <ScreenHeader title="Task Details" />
        <View style={styles.centered}>
          <Text style={styles.error}>
            This task couldn&apos;t be found — it may have been deleted.
          </Text>
          <Button label="Go back" variant="outline" onPress={() => router.back()} />
        </View>
      </Screen>
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
  // A private, self-created task (creator === assignee) has no one to
  // collaborate with — the section would just say "Created by You / Assigned
  // to You", which tells the user nothing they don't already know.
  const showCollaboration = !(viewer.isAssignee && viewer.isCreator);

  function startEdit() {
    if (!task.data) return;
    setTitle(task.data.title);
    setDescription(task.data.description ?? "");
    setPriority(task.data.priority);
    setCategory(task.data.category ?? "");
    setScheduledAt(task.data.scheduledAt ? new Date(task.data.scheduledAt) : null);
    setDeadline(task.data.deadline ? new Date(task.data.deadline) : null);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
  }

  function confirmDelete() {
    // Hard-delete cascades this task's entire assignment history (EC-17) —
    // that's not reversible, so this needs a real confirmation.
    Alert.alert("Delete this task?", "This can't be undone and removes its request history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteTask.mutate(id, { onSuccess: () => router.back() }),
      },
    ]);
  }

  // Creator-only viewer (M10): a read-only screen — no edit form, no
  // Save/Mark Done/Delete, no assign flow (only the current assignee may
  // send/cancel assignments). scheduledAt is never rendered here at all —
  // the server already sends it as null for this viewer, and every row
  // below is omitted when its value is null (item 5), so there is no code
  // path that could ever render Daniel's personal schedule to the creator.
  if (!viewer.isAssignee) {
    return (
      <Screen>
        <ScreenHeader title="Task Details" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.readOnlyBanner}>
            <Ionicons name="eye-outline" size={16} color={colors.primaryPressed} />
            <Text style={styles.readOnlyBannerText}>
              Assigned to {task.data.assignee.name} — you&apos;re viewing this task as the creator.
            </Text>
          </View>

          <View style={styles.titleRow}>
            <TaskStatusBadge status={task.data.status} />
            <PriorityBadge priority={task.data.priority} />
          </View>
          <Text style={styles.title}>{task.data.title}</Text>

          {task.data.description && (
            <Section label="Description">
              <Text style={styles.description}>{task.data.description}</Text>
            </Section>
          )}

          <Section label="Planning">
            {task.data.category && <InfoRow label="Category">{task.data.category}</InfoRow>}
            {task.data.deadline && (
              <InfoRow label="Deadline">{formatDateTime(task.data.deadline)}</InfoRow>
            )}
          </Section>

          {showCollaboration && (
            <Section label="Collaboration">
              <InfoRow label="Created by">You</InfoRow>
              <InfoRow label="Assigned to">
                <View style={styles.identityInline}>
                  <Avatar name={task.data.assignee.name} size={28} />
                  <View>
                    <Text style={styles.infoValue}>{task.data.assignee.name}</Text>
                    <Text style={styles.identityUsername}>@{task.data.assignee.username}</Text>
                  </View>
                </View>
              </InfoRow>
            </Section>
          )}

          {task.data.pendingAssignment && (
            <Text style={styles.readOnlyMeta}>
              Pending transfer to {task.data.pendingAssignment.toUser.name} · @
              {task.data.pendingAssignment.toUser.username}
            </Text>
          )}
        </ScrollView>
      </Screen>
    );
  }

  // ---- Assignee viewer: EDIT MODE ----
  if (isEditing) {
    return (
      <Screen>
        {/* Disables the iOS swipe-back edge gesture while editing — without
            this, a swipe would pop the whole route (leaving Task Details
            entirely) instead of just cancelling the edit, which would feel
            like losing your place rather than a contained "Cancel". */}
        <Stack.Screen options={{ gestureEnabled: false }} />
        <View style={styles.editHeader}>
          <TouchableOpacity accessibilityRole="button" onPress={cancelEdit}>
            <Text style={styles.editHeaderAction}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.editHeaderTitle}>Edit Task</Text>
          <View style={styles.editHeaderSpacer} />
        </View>
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
              accessibilityLabel="Title"
              value={title}
              onChangeText={setTitle}
            />
            <TextField
              label="Description"
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
              placeholder="Optional"
              accessibilityLabel="Category"
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

            <Button
              label="Save Changes"
              disabled={hasDeadlineConflict}
              loading={updateTask.isPending}
              onPress={() =>
                updateTask.mutate(
                  {
                    title,
                    description: description.trim() || null,
                    priority,
                    category: category.trim() || null,
                    scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
                    deadline: deadline ? deadline.toISOString() : null,
                  },
                  { onSuccess: () => setIsEditing(false) },
                )
              }
            />
            {updateTask.isError && (
              <Text style={styles.error} accessibilityRole="alert">
                Could not save — the task may have changed (e.g. a new pending assignment). Pull to
                refresh and try again.
              </Text>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  // ---- Assignee viewer: VIEW MODE (default) ----
  return (
    <Screen>
      {/* Explicitly re-enables the swipe gesture on return from edit mode —
          don't rely on the edit branch's own `gestureEnabled: false` being
          unset automatically just because that branch stopped rendering. */}
      <Stack.Screen options={{ gestureEnabled: true }} />
      <ScreenHeader
        title="Task Details"
        action={
          viewer.canEdit && (
            <IconButton name="pencil-outline" accessibilityLabel="Edit task" onPress={startEdit} />
          )
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <TaskStatusBadge status={task.data.status} />
          <PriorityBadge priority={task.data.priority} />
        </View>
        <Text style={styles.title}>{task.data.title}</Text>

        {isFrozenByPending && (
          <View style={styles.collabPanel}>
            <View style={styles.collabPanelHeader}>
              <Ionicons name="time-outline" size={16} color={colors.warning} />
              <Text style={styles.collabPanelTitle}>
                Waiting for {task.data.pendingAssignment!.toUser.name}
              </Text>
            </View>
            <Text style={styles.collabPanelText}>
              @{task.data.pendingAssignment!.toUser.username} hasn&apos;t responded yet — editing,
              completing, and deleting are locked until this is resolved or cancelled.
            </Text>
            <Button
              label="Cancel Assignment"
              variant="outline"
              loading={cancelAssignment.isPending}
              onPress={() => cancelAssignment.mutate(task.data!.pendingAssignment!.id)}
            />
            {cancelAssignment.isError && (
              <Text style={styles.error} accessibilityRole="alert">
                Could not cancel — it may have already been resolved. Pull to refresh.
              </Text>
            )}
          </View>
        )}

        {task.data.status === "CANCELLED" && (
          <View style={styles.infoNotice}>
            <Text style={styles.infoNoticeText}>
              This task is cancelled. It can still be edited, but not reopened.
            </Text>
          </View>
        )}

        {task.data.description && (
          <Section label="Description">
            <Text style={styles.description}>{task.data.description}</Text>
          </Section>
        )}

        <Section label="Planning">
          {task.data.category && <InfoRow label="Category">{task.data.category}</InfoRow>}
          {task.data.scheduledAt && (
            <InfoRow label="Scheduled">{formatDateTime(task.data.scheduledAt)}</InfoRow>
          )}
          {task.data.deadline && (
            <InfoRow label="Deadline">{formatDateTime(task.data.deadline)}</InfoRow>
          )}
        </Section>

        {showCollaboration && (
          <Section label="Collaboration">
            <InfoRow label="Created by">
              {viewer.isCreator ? "You" : "Someone who assigned this to you"}
            </InfoRow>
            <InfoRow label="Assigned to">You</InfoRow>
          </Section>
        )}

        {nextStep && (
          <Button
            label={nextStep.label}
            variant="outline"
            disabled={!viewer.canEdit}
            loading={updateTask.isPending}
            onPress={() => updateTask.mutate({ status: nextStep.to })}
          />
        )}

        {!isFrozenByPending && canAssignTask(task.data.status) && (
          <Button
            label="Assign task"
            variant="secondary"
            icon={<Ionicons name="paper-plane-outline" size={17} color={colors.primaryPressed} />}
            onPress={() => router.push(`/tasks/assign/${id}`)}
          />
        )}

        <Button
          label="Delete Task"
          variant="danger"
          disabled={!viewer.canDelete}
          loading={deleteTask.isPending}
          onPress={confirmDelete}
        />
        {deleteTask.isError && (
          <Text style={styles.error} accessibilityRole="alert">
            Could not delete — please try again.
          </Text>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  editHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  editHeaderAction: { fontSize: fontSize.body, fontWeight: "600", color: colors.textSecondary },
  editHeaderTitle: { fontSize: fontSize.taskTitle, fontWeight: "700", color: colors.textPrimary },
  editHeaderSpacer: { width: 50 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { fontSize: fontSize.sectionTitle + 4, fontWeight: "800", color: colors.textPrimary },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  statusPillText: { fontSize: fontSize.tiny, fontWeight: "700" },
  error: { color: colors.danger, fontSize: fontSize.meta },
  collabPanel: {
    backgroundColor: colors.warningBg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  collabPanelHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  collabPanelTitle: { fontSize: fontSize.body, fontWeight: "700", color: colors.warning },
  collabPanelText: { color: colors.textSecondary, fontSize: fontSize.meta, lineHeight: 18 },
  infoNotice: { backgroundColor: colors.neutral, borderRadius: radius.lg, padding: spacing.md },
  infoNoticeText: { color: colors.textSecondary, fontSize: fontSize.meta, lineHeight: 18 },
  readOnlyBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  readOnlyBannerText: {
    flex: 1,
    color: colors.primaryPressed,
    fontSize: fontSize.meta,
    lineHeight: 18,
  },
  readOnlyMeta: { fontSize: fontSize.meta, color: colors.textMuted },
  section: { gap: spacing.sm },
  sectionLabel: { fontSize: fontSize.meta, fontWeight: "700", color: colors.textSecondary },
  sectionBody: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  description: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 21 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
  },
  infoLabel: { fontSize: fontSize.meta, color: colors.textSecondary },
  infoValue: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: "500" },
  identityInline: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  identityUsername: { fontSize: fontSize.small, color: colors.textMuted },
});

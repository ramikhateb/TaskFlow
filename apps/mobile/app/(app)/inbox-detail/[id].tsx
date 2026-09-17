import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { DateTimeField } from "../../../src/features/tasks/DateTimeField";
import { isAcceptScheduleValid } from "../../../src/features/inbox/acceptScheduling";
import { PRIORITY_COLORS, priorityLabel } from "../../../src/features/tasks/PrioritySelector";
import {
  useAcceptAssignment,
  useDeclineAssignment,
  useInbox,
} from "../../../src/features/inbox/useInbox";
import { colors, fontSize, radius, spacing } from "../../../src/ui/theme";

type ScheduleChoice = "pick" | "later";

export default function InboxRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const inbox = useInbox();
  const acceptAssignment = useAcceptAssignment(id);
  const declineAssignment = useDeclineAssignment(id);

  const [isAccepting, setIsAccepting] = useState(false);
  const [scheduleChoice, setScheduleChoice] = useState<ScheduleChoice>("pick");
  const [chosenDate, setChosenDate] = useState<Date | null>(null);

  if (inbox.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const assignment = inbox.data?.find((a) => a.id === id);

  if (!assignment) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>
          This request is no longer available — it may have already been resolved.
        </Text>
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton, styles.backButton]}
          accessibilityRole="button"
          onPress={() => router.back()}
        >
          <Text style={styles.secondaryButtonText}>Back to Inbox</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const deadline = assignment.task.deadline ? new Date(assignment.task.deadline) : null;
  const scheduledAtToSubmit = scheduleChoice === "pick" ? chosenDate : null;
  const scheduleIsValid = isAcceptScheduleValid(scheduledAtToSubmit, deadline);
  const canConfirmAccept = scheduleChoice === "later" || (chosenDate !== null && scheduleIsValid);

  function handleDecline() {
    declineAssignment.mutate(undefined, { onSuccess: () => router.back() });
  }

  function handleConfirmAccept() {
    acceptAssignment.mutate(
      { scheduledAt: scheduledAtToSubmit ? scheduledAtToSubmit.toISOString() : null },
      { onSuccess: () => router.replace(`/tasks/${assignment.task.id}`) },
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.statusRow}>
        <Text style={[styles.priorityBadge, { color: PRIORITY_COLORS[assignment.task.priority] }]}>
          {priorityLabel(assignment.task.priority)} priority
        </Text>
      </View>

      <Text style={styles.title}>{assignment.task.title}</Text>
      {assignment.task.description && (
        <Text style={styles.description}>{assignment.task.description}</Text>
      )}

      <Text style={styles.fromLine}>
        From {assignment.fromUser.name} · @{assignment.fromUser.username}
      </Text>

      {assignment.task.category && (
        <Text style={styles.metaLine}>Category: {assignment.task.category}</Text>
      )}
      {deadline && (
        <Text style={styles.metaLine}>
          Due: {deadline.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </Text>
      )}
      {assignment.message && <Text style={styles.message}>&ldquo;{assignment.message}&rdquo;</Text>}

      {!isAccepting && (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.button, styles.declineButton]}
            accessibilityRole="button"
            disabled={declineAssignment.isPending}
            onPress={handleDecline}
          >
            {declineAssignment.isPending ? (
              <ActivityIndicator color={colors.danger} />
            ) : (
              <Text style={styles.declineButtonText}>Decline</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.acceptButton]}
            accessibilityRole="button"
            onPress={() => setIsAccepting(true)}
          >
            <Text style={styles.acceptButtonText}>Accept</Text>
          </TouchableOpacity>
        </View>
      )}

      {declineAssignment.isError && (
        <Text style={styles.error} accessibilityRole="alert">
          Could not decline — it may have already been resolved. Pull to refresh.
        </Text>
      )}

      {isAccepting && (
        <View style={styles.acceptPanel}>
          <Text style={styles.acceptPanelTitle}>When do you want to do this?</Text>

          <TouchableOpacity
            style={styles.choiceRow}
            accessibilityRole="radio"
            accessibilityState={{ checked: scheduleChoice === "pick" }}
            onPress={() => setScheduleChoice("pick")}
          >
            <View style={[styles.radio, scheduleChoice === "pick" && styles.radioSelected]} />
            <Text style={styles.choiceLabel}>Schedule it</Text>
          </TouchableOpacity>
          {scheduleChoice === "pick" && (
            <DateTimeField label="Date & time" value={chosenDate} onChange={setChosenDate} />
          )}
          {scheduleChoice === "pick" && chosenDate && !scheduleIsValid && (
            <Text style={styles.error} accessibilityRole="alert">
              This is after the task&apos;s deadline — pick an earlier time.
            </Text>
          )}

          <TouchableOpacity
            style={styles.choiceRow}
            accessibilityRole="radio"
            accessibilityState={{ checked: scheduleChoice === "later" }}
            onPress={() => setScheduleChoice("later")}
          >
            <View style={[styles.radio, scheduleChoice === "later" && styles.radioSelected]} />
            <Text style={styles.choiceLabel}>Schedule later</Text>
          </TouchableOpacity>
          {scheduleChoice === "later" && (
            <Text style={styles.choiceHint}>
              It won&apos;t appear on your Schedule until you set a time later from the task.
            </Text>
          )}

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              accessibilityRole="button"
              onPress={() => {
                setIsAccepting(false);
                setScheduleChoice("pick");
                setChosenDate(null);
              }}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.acceptButton]}
              accessibilityRole="button"
              disabled={!canConfirmAccept || acceptAssignment.isPending}
              onPress={handleConfirmAccept}
            >
              {acceptAssignment.isPending ? (
                <ActivityIndicator color={colors.textOnPrimary} />
              ) : (
                <Text style={styles.acceptButtonText}>Accept task</Text>
              )}
            </TouchableOpacity>
          </View>

          {acceptAssignment.isError && (
            <Text style={styles.error} accessibilityRole="alert">
              Could not accept — it may have already been resolved. Pull to refresh.
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  backButton: { paddingHorizontal: spacing.xl },
  statusRow: { flexDirection: "row" },
  priorityBadge: { fontSize: fontSize.body, fontWeight: "700" },
  title: { fontSize: fontSize.xl, fontWeight: "700", color: colors.textPrimary },
  description: { fontSize: fontSize.base, color: colors.textBody },
  fromLine: { fontSize: fontSize.md, color: colors.textSubtle, fontWeight: "600" },
  metaLine: { fontSize: fontSize.body, color: colors.textMuted },
  message: {
    fontSize: fontSize.md,
    color: colors.textBody,
    fontStyle: "italic",
    marginTop: spacing.xs,
  },
  actionsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  button: { flex: 1, borderRadius: radius.md, padding: 14, alignItems: "center" },
  declineButton: { backgroundColor: colors.dangerMuted },
  declineButtonText: { color: colors.danger, fontSize: fontSize.md, fontWeight: "600" },
  acceptButton: { backgroundColor: colors.primary },
  acceptButtonText: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: "600" },
  secondaryButton: { backgroundColor: colors.primaryMuted },
  secondaryButtonText: { color: colors.primary, fontSize: fontSize.md, fontWeight: "600" },
  error: { color: colors.danger, fontSize: fontSize.body },
  acceptPanel: {
    marginTop: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    paddingTop: spacing.lg,
  },
  acceptPanelTitle: { fontSize: fontSize.md, fontWeight: "600", color: colors.textPrimary },
  choiceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.textFaint,
  },
  radioSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  choiceLabel: { fontSize: fontSize.base, color: colors.textPrimary },
  choiceHint: { fontSize: fontSize.sm, color: colors.textMuted, marginLeft: 28 },
});

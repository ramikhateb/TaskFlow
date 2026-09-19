import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { DateTimeField } from "../../src/features/tasks/DateTimeField";
import { isAcceptScheduleValid } from "../../src/features/inbox/acceptScheduling";
import { PriorityBadge } from "../../src/features/tasks/PriorityBadge";
import {
  useAcceptAssignment,
  useDeclineAssignment,
  useInbox,
} from "../../src/features/inbox/useInbox";
import { Avatar } from "../../src/ui/Avatar";
import { Button } from "../../src/ui/Button";
import { Screen } from "../../src/ui/Screen";
import { ScreenHeader } from "../../src/ui/ScreenHeader";
import { colors, fontSize, radius, spacing } from "../../src/ui/theme";

type ScheduleChoice = "pick" | "later";

function ChoiceCard({
  selected,
  title,
  description,
  onPress,
}: {
  selected: boolean;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.choiceCard, selected && styles.choiceCardSelected]}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <View style={styles.choiceText}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceDescription}>{description}</Text>
      </View>
    </TouchableOpacity>
  );
}

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
      <Screen>
        <ScreenHeader title="Request" />
      </Screen>
    );
  }

  const assignment = inbox.data?.find((a) => a.id === id);

  if (!assignment) {
    return (
      <Screen>
        <ScreenHeader title="Request" />
        <View style={styles.centered}>
          <Text style={styles.error}>
            This request is no longer available — it may have already been resolved.
          </Text>
          <Button label="Back to Inbox" variant="outline" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const taskId = assignment.task.id;
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
      { onSuccess: () => router.replace(`/tasks/${taskId}`) },
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Request" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.senderRow}>
          <Avatar name={assignment.fromUser.name} size={44} />
          <View>
            <Text style={styles.senderName}>{assignment.fromUser.name}</Text>
            <Text style={styles.senderUsername}>@{assignment.fromUser.username}</Text>
          </View>
        </View>
        <Text style={styles.actionLine}>assigned you a task</Text>

        <Text style={styles.title}>{assignment.task.title}</Text>
        {assignment.task.description && (
          <Text style={styles.description}>{assignment.task.description}</Text>
        )}

        <View style={styles.metaRow}>
          <PriorityBadge priority={assignment.task.priority} />
          {assignment.task.category && (
            <Text style={styles.metaText}>{assignment.task.category}</Text>
          )}
        </View>
        {deadline && (
          <Text style={styles.metaText}>
            Due {deadline.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          </Text>
        )}
        {assignment.message && (
          <Text style={styles.message}>&ldquo;{assignment.message}&rdquo;</Text>
        )}

        {!isAccepting && (
          <View style={styles.actionsRow}>
            <Button
              label="Decline"
              variant="outline"
              style={styles.actionButton}
              loading={declineAssignment.isPending}
              onPress={handleDecline}
            />
            <Button
              label="Accept"
              style={styles.actionButton}
              onPress={() => setIsAccepting(true)}
            />
          </View>
        )}

        {declineAssignment.isError && (
          <Text style={styles.error} accessibilityRole="alert">
            Could not decline — it may have already been resolved. Pull to refresh.
          </Text>
        )}

        {isAccepting && (
          <View style={styles.acceptPanel}>
            <Text style={styles.acceptPanelTitle}>How do you want to schedule it?</Text>

            <ChoiceCard
              selected={scheduleChoice === "pick"}
              title="Schedule it"
              description="Choose when you'll work on this task."
              onPress={() => setScheduleChoice("pick")}
            />
            {scheduleChoice === "pick" && (
              <DateTimeField label="Date & time" value={chosenDate} onChange={setChosenDate} />
            )}
            {scheduleChoice === "pick" && chosenDate && !scheduleIsValid && (
              <Text style={styles.error} accessibilityRole="alert">
                This is after the task&apos;s deadline — pick an earlier time.
              </Text>
            )}

            <ChoiceCard
              selected={scheduleChoice === "later"}
              title="Schedule later"
              description="Add it to your tasks without choosing a time yet."
              onPress={() => setScheduleChoice("later")}
            />

            <View style={styles.actionsRow}>
              <Button
                label="Cancel"
                variant="outline"
                style={styles.actionButton}
                onPress={() => {
                  setIsAccepting(false);
                  setScheduleChoice("pick");
                  setChosenDate(null);
                }}
              />
              <Button
                label="Accept Task"
                style={styles.actionButton}
                disabled={!canConfirmAccept}
                loading={acceptAssignment.isPending}
                onPress={handleConfirmAccept}
              />
            </View>

            {acceptAssignment.isError && (
              <Text style={styles.error} accessibilityRole="alert">
                Could not accept — it may have already been resolved. Pull to refresh.
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.sm, paddingBottom: spacing.xxl * 2 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  senderRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  senderName: { fontSize: fontSize.body, fontWeight: "700", color: colors.textPrimary },
  senderUsername: { fontSize: fontSize.meta, color: colors.textMuted },
  actionLine: { fontSize: fontSize.meta, color: colors.textSecondary },
  title: {
    fontSize: fontSize.sectionTitle + 3,
    fontWeight: "800",
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  description: { fontSize: fontSize.body, color: colors.textSecondary },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  metaText: { fontSize: fontSize.meta, color: colors.textSecondary },
  message: {
    fontSize: fontSize.body,
    color: colors.textPrimary,
    fontStyle: "italic",
    marginTop: spacing.xs,
  },
  actionsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  actionButton: { flex: 1 },
  error: { color: colors.danger, fontSize: fontSize.meta },
  acceptPanel: {
    marginTop: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.lg,
  },
  acceptPanelTitle: { fontSize: fontSize.taskTitle, fontWeight: "700", color: colors.textPrimary },
  choiceCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  choiceCardSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.primary },
  choiceText: { flex: 1, gap: 2 },
  choiceTitle: { fontSize: fontSize.body, fontWeight: "600", color: colors.textPrimary },
  choiceDescription: { fontSize: fontSize.meta, color: colors.textSecondary },
});

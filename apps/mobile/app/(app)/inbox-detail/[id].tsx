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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
              <ActivityIndicator color="#c0392b" />
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
        <Text style={styles.error}>Could not decline — please try again.</Text>
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
            <Text style={styles.error}>
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
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.acceptButtonText}>Accept task</Text>
              )}
            </TouchableOpacity>
          </View>

          {acceptAssignment.isError && (
            <Text style={styles.error}>Could not accept — please try again.</Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, gap: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  statusRow: { flexDirection: "row" },
  priorityBadge: { fontSize: 13, fontWeight: "700" },
  title: { fontSize: 22, fontWeight: "700" },
  description: { fontSize: 15, color: "#333" },
  fromLine: { fontSize: 14, color: "#444", fontWeight: "600" },
  metaLine: { fontSize: 13, color: "#666" },
  message: { fontSize: 14, color: "#333", fontStyle: "italic", marginTop: 4 },
  actionsRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  button: { flex: 1, borderRadius: 8, padding: 14, alignItems: "center" },
  declineButton: { backgroundColor: "#fdecea" },
  declineButtonText: { color: "#c0392b", fontSize: 16, fontWeight: "600" },
  acceptButton: { backgroundColor: "#1a7f37" },
  acceptButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondaryButton: { backgroundColor: "#eef7ee" },
  secondaryButtonText: { color: "#1a7f37", fontSize: 16, fontWeight: "600" },
  error: { color: "#c0392b", fontSize: 13 },
  acceptPanel: {
    marginTop: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingTop: 16,
  },
  acceptPanelTitle: { fontSize: 16, fontWeight: "600" },
  choiceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#999",
  },
  radioSelected: { borderColor: "#1a7f37", backgroundColor: "#1a7f37" },
  choiceLabel: { fontSize: 15 },
});

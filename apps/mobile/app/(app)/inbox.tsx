import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import type { InboxAssignmentResponse, SentAssignmentResponse } from "@taskflow/shared";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useCancelAssignment } from "../../src/features/tasks/useAssignments";
import { PRIORITY_COLORS, priorityLabel } from "../../src/features/tasks/PrioritySelector";
import { SENT_STATUS_COLORS, sentStatusLabel } from "../../src/features/inbox/sentStatus";
import { useInbox, useSentAssignments } from "../../src/features/inbox/useInbox";
import { colors, fontSize, radius, spacing } from "../../src/ui/theme";

type CollaborationView = "incoming" | "sent";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function IncomingRow({ item }: { item: InboxAssignmentResponse }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`Request from ${item.fromUser.name}: ${item.task.title}`}
      onPress={() => router.push(`/inbox-detail/${item.id}`)}
    >
      <View style={styles.rowTitleLine}>
        <Text
          style={[
            styles.priorityBadge,
            {
              color: PRIORITY_COLORS[item.task.priority],
              borderColor: PRIORITY_COLORS[item.task.priority],
            },
          ]}
        >
          {priorityLabel(item.task.priority)}
        </Text>
        <Text style={styles.rowTitle}>{item.task.title}</Text>
      </View>
      <Text style={styles.rowSubtitle}>
        From {item.fromUser.name} · @{item.fromUser.username}
      </Text>
      {(item.task.category || item.task.deadline) && (
        <Text style={styles.rowMeta}>
          {item.task.category ?? ""}
          {item.task.category && item.task.deadline ? " · " : ""}
          {item.task.deadline ? `Due ${formatDateTime(item.task.deadline)}` : ""}
        </Text>
      )}
      {item.message && <Text style={styles.rowMessage}>&ldquo;{item.message}&rdquo;</Text>}
      <Text style={styles.rowSent}>Sent {formatDateTime(item.createdAt)}</Text>
    </TouchableOpacity>
  );
}

// Tapping a Sent row always opens the current task detail (`/tasks/:id`),
// whichever state it's in — the task-detail screen's own server-derived
// `viewer` capabilities (M10) already render the right thing, whether the
// sender is still the assignee (PENDING/DECLINED/CANCELLED: normal,
// possibly-frozen editing) or is now creator-only (ACCEPTED: read-only).
// No separate "Sent detail" screen is needed for that reason. The one
// action Sent adds inline is Cancel, reusing M8's existing capability
// exactly, as a sibling touchable (not nested) so it doesn't also trigger
// the row's own navigation — same layout pattern as TaskRow.tsx.
function SentRow({ item }: { item: SentAssignmentResponse }) {
  const router = useRouter();
  const cancelAssignment = useCancelAssignment(item.task.id);

  return (
    <View>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.rowMain}
          accessibilityRole="button"
          accessibilityLabel={`Sent to ${item.toUser.name}: ${item.task.title}, ${sentStatusLabel(item.status)}`}
          onPress={() => router.push(`/tasks/${item.task.id}`)}
        >
          <View style={styles.rowTitleLine}>
            <Text
              style={[
                styles.priorityBadge,
                {
                  color: PRIORITY_COLORS[item.task.priority],
                  borderColor: PRIORITY_COLORS[item.task.priority],
                },
              ]}
            >
              {priorityLabel(item.task.priority)}
            </Text>
            <Text style={styles.rowTitle}>{item.task.title}</Text>
          </View>
          <Text style={styles.rowSubtitle}>
            To {item.toUser.name} · @{item.toUser.username}
          </Text>
          <View style={styles.statusRow}>
            <View
              style={[styles.statusDot, { backgroundColor: SENT_STATUS_COLORS[item.status] }]}
            />
            <Text style={[styles.statusLabel, { color: SENT_STATUS_COLORS[item.status] }]}>
              {sentStatusLabel(item.status)}
            </Text>
          </View>
        </TouchableOpacity>

        {item.status === "PENDING" && (
          <TouchableOpacity
            style={styles.cancelTouch}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Cancel request to ${item.toUser.name}`}
            disabled={cancelAssignment.isPending}
            onPress={() => cancelAssignment.mutate(item.id)}
          >
            {cancelAssignment.isPending ? (
              <ActivityIndicator />
            ) : (
              <Text style={styles.cancelText}>Cancel</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* M11: a stale Sent row's Cancel can lose a race (the recipient just
          accepted/declined it) — surface that instead of silently doing
          nothing, matching the error-surfacing pattern used everywhere else
          a mutation can fail (e.g. task detail's Save/Delete). */}
      {cancelAssignment.isError && (
        <Text style={styles.rowError} accessibilityRole="alert">
          Could not cancel — it may have already been resolved.
        </Text>
      )}
    </View>
  );
}

export default function InboxScreen() {
  const [view, setView] = useState<CollaborationView>("incoming");
  const inbox = useInbox();
  const sent = useSentAssignments();
  const active = view === "incoming" ? inbox : sent;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Inbox</Text>

      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleButton, view === "incoming" && styles.toggleButtonActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: view === "incoming" }}
          onPress={() => setView("incoming")}
        >
          <Text style={[styles.toggleText, view === "incoming" && styles.toggleTextActive]}>
            Incoming{inbox.data && inbox.data.length > 0 ? ` (${inbox.data.length})` : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, view === "sent" && styles.toggleButtonActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: view === "sent" }}
          onPress={() => setView("sent")}
        >
          <Text style={[styles.toggleText, view === "sent" && styles.toggleTextActive]}>Sent</Text>
        </TouchableOpacity>
      </View>

      {active.isLoading && <ActivityIndicator style={styles.spacer} />}

      {active.isError && (
        <Text style={styles.error}>
          Could not load {view === "incoming" ? "your inbox" : "sent requests"}. Pull to refresh.
        </Text>
      )}

      {active.data && active.data.length === 0 && !active.isLoading && (
        <Text style={styles.empty}>
          {view === "incoming"
            ? "No pending task requests right now."
            : "You haven't sent any task requests yet."}
        </Text>
      )}

      {view === "incoming" && inbox.data && inbox.data.length > 0 && (
        <FlatList
          data={inbox.data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <IncomingRow item={item} />}
          style={styles.list}
          onRefresh={() => inbox.refetch()}
          refreshing={inbox.isRefetching}
        />
      )}

      {view === "sent" && sent.data && sent.data.length > 0 && (
        <FlatList
          data={sent.data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SentRow item={item} />}
          style={styles.list}
          onRefresh={() => sent.refetch()}
          refreshing={sent.isRefetching}
        />
      )}

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.xl },
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.textPrimary },
  toggleRow: {
    flexDirection: "row",
    marginTop: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.separator,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  toggleButton: {
    flex: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  toggleButtonActive: { backgroundColor: colors.primary },
  toggleText: { fontSize: fontSize.body, fontWeight: "600", color: colors.textSubtle },
  toggleTextActive: { color: colors.textOnPrimary },
  spacer: { marginTop: spacing.xl },
  empty: { marginTop: spacing.xl, color: colors.textMuted, textAlign: "center" },
  error: { marginTop: spacing.xl, color: colors.danger, textAlign: "center" },
  list: { marginTop: spacing.lg },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
    gap: spacing.sm,
  },
  rowMain: { flex: 1, gap: spacing.xs },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  priorityBadge: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  rowTitle: { fontSize: fontSize.md, fontWeight: "600" },
  rowSubtitle: { fontSize: fontSize.body, color: colors.textSubtle },
  rowMeta: { fontSize: fontSize.sm, color: colors.textMuted },
  rowMessage: { fontSize: fontSize.body, color: colors.textBody, fontStyle: "italic" },
  rowSent: { fontSize: fontSize.xs, color: colors.textFaint },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusLabel: { fontSize: fontSize.sm, fontWeight: "700" },
  cancelTouch: { paddingVertical: spacing.xs, paddingHorizontal: 2 },
  cancelText: { color: colors.danger, fontWeight: "600" },
  rowError: { color: colors.danger, fontSize: fontSize.sm, paddingBottom: spacing.sm },
});

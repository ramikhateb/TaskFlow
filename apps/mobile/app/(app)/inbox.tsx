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
          <Text style={[styles.statusLabel, { color: SENT_STATUS_COLORS[item.status] }]}>
            {sentStatusLabel(item.status)}
          </Text>
        </TouchableOpacity>

        {item.status === "PENDING" && (
          <TouchableOpacity
            accessibilityRole="button"
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
        <Text style={styles.rowError}>Could not cancel — it may have already been resolved.</Text>
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
            Incoming
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
          Could not load {view === "incoming" ? "your inbox" : "sent requests"}:{" "}
          {active.error instanceof Error ? active.error.message : "unknown error"}
        </Text>
      )}

      {active.data && active.data.length === 0 && (
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
  container: { flex: 1, backgroundColor: "#fff", padding: 24 },
  title: { fontSize: 28, fontWeight: "700" },
  toggleRow: {
    flexDirection: "row",
    marginTop: 16,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
    padding: 4,
    gap: 4,
  },
  toggleButton: { flex: 1, borderRadius: 6, paddingVertical: 8, alignItems: "center" },
  toggleButtonActive: { backgroundColor: "#1a7f37" },
  toggleText: { fontSize: 14, fontWeight: "600", color: "#444" },
  toggleTextActive: { color: "#fff" },
  spacer: { marginTop: 24 },
  empty: { marginTop: 24, color: "#666", textAlign: "center" },
  error: { marginTop: 24, color: "#c0392b", textAlign: "center" },
  list: { marginTop: 16 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    gap: 8,
  },
  rowMain: { flex: 1, gap: 4 },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  priorityBadge: {
    fontSize: 10,
    fontWeight: "700",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  rowTitle: { fontSize: 16, fontWeight: "600" },
  rowSubtitle: { fontSize: 13, color: "#444" },
  rowMeta: { fontSize: 12, color: "#666" },
  rowMessage: { fontSize: 13, color: "#333", fontStyle: "italic" },
  rowSent: { fontSize: 11, color: "#999" },
  statusLabel: { fontSize: 12, fontWeight: "700" },
  cancelText: { color: "#c0392b", fontWeight: "600" },
  rowError: { color: "#c0392b", fontSize: 12, paddingBottom: 8 },
});

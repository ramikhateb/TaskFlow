import { useRouter } from "expo-router";
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
import {
  useDeclineAssignment,
  useInbox,
  useSentAssignments,
} from "../../src/features/inbox/useInbox";
import { StatusBadge } from "../../src/features/inbox/StatusBadge";
import { PriorityBadge } from "../../src/features/tasks/PriorityBadge";
import { useCancelAssignment } from "../../src/features/tasks/useAssignments";
import { Avatar } from "../../src/ui/Avatar";
import { Button } from "../../src/ui/Button";
import { EmptyState } from "../../src/ui/EmptyState";
import { Screen } from "../../src/ui/Screen";
import { SegmentedControl } from "../../src/ui/SegmentedControl";
import { colors, fontFamily, fontSize, radius, spacing } from "../../src/ui/theme";

type CollaborationView = "incoming" | "sent";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function IncomingCard({ item }: { item: InboxAssignmentResponse }) {
  const router = useRouter();
  const decline = useDeclineAssignment(item.id);

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Avatar name={item.fromUser.name} size={40} />
        <View style={styles.cardIdentity}>
          <Text style={styles.senderName}>{item.fromUser.name}</Text>
          <Text style={styles.senderUsername}>@{item.fromUser.username}</Text>
        </View>
      </View>

      <Text style={styles.actionLine}>assigned you a task</Text>
      <Text style={styles.taskTitle} numberOfLines={2}>
        {item.task.title}
      </Text>

      <View style={styles.metaRow}>
        <PriorityBadge priority={item.task.priority} />
        {item.task.deadline && (
          <Text style={styles.metaText}>Due {formatDateTime(item.task.deadline)}</Text>
        )}
      </View>

      {item.message && <Text style={styles.message}>&ldquo;{item.message}&rdquo;</Text>}

      <View style={styles.actionsRow}>
        <Button
          label="Decline"
          variant="outline"
          style={styles.actionButton}
          loading={decline.isPending}
          onPress={() => decline.mutate()}
        />
        <Button
          label="Accept"
          style={styles.actionButton}
          onPress={() => router.push(`/inbox-detail/${item.id}`)}
        />
      </View>

      {decline.isError && (
        <Text style={styles.error} accessibilityRole="alert">
          Could not decline — it may have already been resolved. Pull to refresh.
        </Text>
      )}
    </View>
  );
}

// Tapping a Sent card always opens the current task detail (`/tasks/:id`),
// whichever state it's in — the task-detail screen's own server-derived
// `viewer` capabilities (M10) already render the right thing, whether the
// sender is still the assignee (PENDING/DECLINED/CANCELLED: normal,
// possibly-frozen editing) or is now creator-only (ACCEPTED: read-only).
function SentCard({ item }: { item: SentAssignmentResponse }) {
  const router = useRouter();
  const cancelAssignment = useCancelAssignment(item.task.id);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardTop}
        accessibilityRole="button"
        onPress={() => router.push(`/tasks/${item.task.id}`)}
      >
        <Avatar name={item.toUser.name} size={40} />
        <View style={styles.cardIdentity}>
          <Text style={styles.senderName}>{item.toUser.name}</Text>
          <Text style={styles.senderUsername}>@{item.toUser.username}</Text>
        </View>
        <StatusBadge status={item.status} />
      </TouchableOpacity>

      <Text style={styles.taskTitle} numberOfLines={2}>
        {item.task.title}
      </Text>

      {item.status === "PENDING" && (
        <Button
          label="Cancel"
          variant="outline"
          loading={cancelAssignment.isPending}
          onPress={() => cancelAssignment.mutate(item.id)}
          style={styles.cancelButton}
        />
      )}

      {cancelAssignment.isError && (
        <Text style={styles.error} accessibilityRole="alert">
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
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Inbox</Text>
      </View>

      <View style={styles.segmentWrap}>
        <SegmentedControl
          options={[
            {
              label: `Incoming${inbox.data?.length ? ` (${inbox.data.length})` : ""}`,
              value: "incoming",
            },
            { label: "Sent", value: "sent" },
          ]}
          value={view}
          onChange={setView}
        />
      </View>

      {active.isLoading && <ActivityIndicator style={styles.spacer} color={colors.primary} />}

      {active.isError && (
        <Text style={styles.error}>
          Could not load {view === "incoming" ? "your inbox" : "sent requests"}. Pull to refresh.
        </Text>
      )}

      {active.data && active.data.length === 0 && !active.isLoading && (
        <EmptyState
          icon={view === "incoming" ? "file-tray-outline" : "paper-plane-outline"}
          title={view === "incoming" ? "No incoming nudges" : "Nothing sent yet"}
          subtitle={
            view === "incoming"
              ? "Tasks assigned to you will appear here."
              : "Tasks you assign to others will appear here."
          }
        />
      )}

      {view === "incoming" && inbox.data && inbox.data.length > 0 && (
        <FlatList
          data={inbox.data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <IncomingCard item={item} />}
          contentContainerStyle={styles.list}
          onRefresh={() => inbox.refetch()}
          refreshing={inbox.isRefetching}
        />
      )}

      {view === "sent" && sent.data && sent.data.length > 0 && (
        <FlatList
          data={sent.data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SentCard item={item} />}
          contentContainerStyle={styles.list}
          onRefresh={() => sent.refetch()}
          refreshing={sent.isRefetching}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  title: {
    fontSize: fontSize.screenTitle,
    fontFamily: fontFamily.heading,
    color: colors.textPrimary,
  },
  segmentWrap: { paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  spacer: { marginTop: spacing.xl },
  error: {
    marginTop: spacing.md,
    marginHorizontal: spacing.xl,
    color: colors.danger,
    textAlign: "center",
  },
  list: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cardIdentity: { flex: 1 },
  senderName: { fontSize: fontSize.body, fontWeight: "700", color: colors.textPrimary },
  senderUsername: { fontSize: fontSize.meta, color: colors.textMuted },
  actionLine: { fontSize: fontSize.meta, color: colors.textSecondary },
  taskTitle: { fontSize: fontSize.taskTitle, fontWeight: "600", color: colors.textPrimary },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  metaText: { fontSize: fontSize.meta, color: colors.textSecondary },
  message: { fontSize: fontSize.meta, color: colors.textSecondary, fontStyle: "italic" },
  actionsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  actionButton: { flex: 1 },
  cancelButton: { alignSelf: "flex-start", paddingVertical: spacing.sm, minHeight: 0 },
});

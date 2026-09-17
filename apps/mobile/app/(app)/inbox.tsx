import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import type { InboxAssignmentResponse } from "@taskflow/shared";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { PRIORITY_COLORS, priorityLabel } from "../../src/features/tasks/PrioritySelector";
import { useInbox } from "../../src/features/inbox/useInbox";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function InboxRow({ item }: { item: InboxAssignmentResponse }) {
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

export default function InboxScreen() {
  const inbox = useInbox();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Inbox</Text>

      {inbox.isLoading && <ActivityIndicator style={styles.spacer} />}

      {inbox.isError && (
        <Text style={styles.error}>
          Could not load your inbox:{" "}
          {inbox.error instanceof Error ? inbox.error.message : "unknown error"}
        </Text>
      )}

      {inbox.data && inbox.data.length === 0 && (
        <Text style={styles.empty}>No pending task requests right now.</Text>
      )}

      {inbox.data && inbox.data.length > 0 && (
        <FlatList
          data={inbox.data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <InboxRow item={item} />}
          style={styles.list}
          onRefresh={() => inbox.refetch()}
          refreshing={inbox.isRefetching}
        />
      )}

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 24 },
  title: { fontSize: 28, fontWeight: "700" },
  spacer: { marginTop: 24 },
  empty: { marginTop: 24, color: "#666", textAlign: "center" },
  error: { marginTop: 24, color: "#c0392b", textAlign: "center" },
  list: { marginTop: 16 },
  row: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    gap: 4,
  },
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
});

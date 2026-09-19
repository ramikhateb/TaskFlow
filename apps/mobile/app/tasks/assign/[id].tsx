import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import type { PublicUser } from "@taskflow/shared";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";
import { useCreateAssignment } from "../../../src/features/tasks/useAssignments";
import { UserSearchField } from "../../../src/features/users/UserSearchField";
import { Button } from "../../../src/ui/Button";
import { TextField } from "../../../src/ui/FormField";
import { Screen } from "../../../src/ui/Screen";
import { ScreenHeader } from "../../../src/ui/ScreenHeader";
import { colors, fontSize, spacing } from "../../../src/ui/theme";

/**
 * Its own pushed screen rather than an expanding panel on Task Details
 * (Nudge navigation redesign): assigning is a substantial, focused action —
 * search, select, optionally message, send — and deserves the same "full
 * screen" treatment as Task Details/Edit Task/Find People, not a modal or an
 * inline accordion. Sending never changes the task's own fields, so on
 * success this just pops back to Task Details, whose `pendingAssignment`
 * field is already invalidated by useCreateAssignment and will show the new
 * pending state immediately.
 */
export default function AssignTaskScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  // Defensive: Expo Router can hand back an array for a dynamic segment
  // during certain route transitions — normalize to a plain string so a
  // stray transient re-render can never send a malformed id to the API.
  const id = Array.isArray(params.id) ? (params.id[0] ?? "") : params.id;
  const router = useRouter();
  const [selectedUser, setSelectedUser] = useState<PublicUser | null>(null);
  const [message, setMessage] = useState("");
  const createAssignment = useCreateAssignment(id);

  return (
    <Screen>
      <ScreenHeader title="Assign Task" />
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
          <Text style={styles.label}>Search by name or @username</Text>
          <UserSearchField
            onSelectUser={setSelectedUser}
            selectedUserId={selectedUser?.id ?? null}
          />

          {selectedUser && (
            <TextField
              label="Message"
              placeholder="Add a message (optional)"
              accessibilityLabel="Assignment message"
              value={message}
              onChangeText={setMessage}
            />
          )}

          <Button
            label="Send Nudge"
            disabled={!selectedUser}
            loading={createAssignment.isPending}
            onPress={() => {
              if (!selectedUser) return;
              createAssignment.mutate(
                { toUserId: selectedUser.id, message: message.trim() || undefined },
                { onSuccess: () => router.back() },
              );
            }}
          />

          {createAssignment.isError && (
            <Text style={styles.error} accessibilityRole="alert">
              Could not send — please try again.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  label: { fontSize: fontSize.meta, fontWeight: "600", color: colors.textSecondary },
  error: { color: colors.danger, fontSize: fontSize.meta },
});

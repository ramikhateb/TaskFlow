import { useState } from "react";
import type { PublicUser } from "@taskflow/shared";
import { StyleSheet, Text, View } from "react-native";
import { UserSearchField } from "../../src/features/users/UserSearchField";
import { colors, fontSize, radius, spacing } from "../../src/ui/theme";

// M7: selection is visual only — no assignment flow exists yet (M8 adds it,
// reusing UserSearchField directly with a real onSelectUser handler).
export default function SearchUsersScreen() {
  const [selected, setSelected] = useState<PublicUser | null>(null);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Find People</Text>

      <UserSearchField selectedUserId={selected?.id} onSelectUser={setSelected} />

      {selected && (
        <View style={styles.selectedNote}>
          <Text style={styles.selectedNoteText}>
            Selected {selected.name} (@{selected.username}) — go to a task&apos;s detail screen and
            tap &ldquo;Assign to someone&rdquo; to send it.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.textPrimary },
  selectedNote: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  selectedNoteText: { color: colors.primary, fontSize: fontSize.body, lineHeight: 18 },
});

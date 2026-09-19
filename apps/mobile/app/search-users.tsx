import { useState } from "react";
import type { PublicUser } from "@taskflow/shared";
import { StyleSheet, Text, View } from "react-native";
import { UserSearchField } from "../src/features/users/UserSearchField";
import { Screen } from "../src/ui/Screen";
import { ScreenHeader } from "../src/ui/ScreenHeader";
import { colors, fontSize, radius, spacing } from "../src/ui/theme";

// M7: selection is visual only — no assignment flow exists yet (M8 adds it,
// reusing UserSearchField directly with a real onSelectUser handler).
export default function SearchUsersScreen() {
  const [selected, setSelected] = useState<PublicUser | null>(null);

  return (
    <Screen>
      <ScreenHeader title="Find People" />
      <View style={styles.container}>
        <UserSearchField selectedUserId={selected?.id} onSelectUser={setSelected} />

        {selected && (
          <View style={styles.selectedNote}>
            <Text style={styles.selectedNoteText}>
              Selected {selected.name} (@{selected.username}) — open a task and tap &ldquo;Assign
              task&rdquo; to send it.
            </Text>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, gap: spacing.md },
  selectedNote: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  selectedNoteText: { color: colors.primaryPressed, fontSize: fontSize.meta, lineHeight: 18 },
});

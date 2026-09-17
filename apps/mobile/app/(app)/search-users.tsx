import { useState } from "react";
import type { PublicUser } from "@taskflow/shared";
import { StyleSheet, Text, View } from "react-native";
import { UserSearchField } from "../../src/features/users/UserSearchField";

// M7: selection is visual only — no assignment flow exists yet (M8 adds it,
// reusing UserSearchField directly with a real onSelectUser handler).
export default function SearchUsersScreen() {
  const [selected, setSelected] = useState<PublicUser | null>(null);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Find People</Text>

      <UserSearchField selectedUserId={selected?.id} onSelectUser={setSelected} />

      {selected && (
        <Text style={styles.selectedNote}>
          Selected {selected.name} (@{selected.username}) — assignment isn&apos;t available yet.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: "700" },
  selectedNote: { color: "#666", fontSize: 13, marginTop: 8 },
});

import { useState } from "react";
import type { PublicUser } from "@taskflow/shared";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { isSearchQueryTooShort, normalizeSearchQuery } from "./normalizeSearchQuery";
import { useUserSearch } from "./useUserSearch";

const SEARCH_DEBOUNCE_MS = 400;

interface UserSearchFieldProps {
  /**
   * M7: selecting a result does nothing but visually mark it (no assignment
   * flow exists yet). M8 reuses this exact component — passing a real
   * handler here (e.g. to open a task-assignment confirmation) is the only
   * thing it needs to add; everything else (debounce, states, styling) is
   * already done.
   */
  onSelectUser?: (user: PublicUser) => void;
  selectedUserId?: string | null;
}

export function UserSearchField({ onSelectUser, selectedUserId }: UserSearchFieldProps) {
  const [queryDraft, setQueryDraft] = useState("");
  const debouncedQuery = useDebouncedValue(queryDraft, SEARCH_DEBOUNCE_MS);
  const search = useUserSearch(debouncedQuery);

  const normalized = normalizeSearchQuery(debouncedQuery);
  const tooShort = isSearchQueryTooShort(debouncedQuery);
  const isEmptyInput = normalized.length === 0;

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Search by name or @username"
        accessibilityLabel="Search users"
        autoCapitalize="none"
        autoCorrect={false}
        value={queryDraft}
        onChangeText={setQueryDraft}
      />

      {isEmptyInput && <Text style={styles.hint}>Type a name or username to find someone.</Text>}
      {tooShort && <Text style={styles.hint}>Keep typing — at least 2 characters.</Text>}

      {search.isLoading && !tooShort && !isEmptyInput && (
        <ActivityIndicator style={styles.spacer} />
      )}

      {search.isError && <Text style={styles.error}>Could not search right now.</Text>}

      {search.data && search.data.length === 0 && !tooShort && !isEmptyInput && (
        <Text style={styles.hint}>No matching users.</Text>
      )}

      {search.data && search.data.length > 0 && (
        <FlatList
          data={search.data}
          keyExtractor={(user) => user.id}
          style={styles.list}
          renderItem={({ item }) => {
            const selected = item.id === selectedUserId;
            return (
              <TouchableOpacity
                style={[styles.row, selected && styles.rowSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onSelectUser?.(item)}
              >
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.username}>@{item.username}</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  hint: { color: "#666", marginTop: 8 },
  error: { color: "#c0392b", marginTop: 8 },
  spacer: { marginTop: 16 },
  list: { marginTop: 8 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  rowSelected: { backgroundColor: "#eef7ee" },
  name: { fontSize: 16, fontWeight: "600" },
  username: { fontSize: 14, color: "#666" },
});

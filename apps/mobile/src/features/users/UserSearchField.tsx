import { Ionicons } from "@expo/vector-icons";
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
import { Avatar } from "../../ui/Avatar";
import { colors, fontSize, radius, spacing } from "../../ui/theme";
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
      <View style={styles.inputRow}>
        <Ionicons name="search" size={17} color={colors.textMuted} />
        <TextInput
          style={styles.input}
          placeholder="Search by name or @username"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Search users"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          value={queryDraft}
          onChangeText={setQueryDraft}
        />
      </View>

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
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const selected = item.id === selectedUserId;
            return (
              <TouchableOpacity
                style={[styles.row, selected && styles.rowSelected]}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, @${item.username}`}
                accessibilityState={{ selected }}
                onPress={() => onSelectUser?.(item)}
              >
                <Avatar name={item.name} size={36} />
                <View style={styles.identity}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.username}>@{item.username}</Text>
                </View>
                {selected && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary },
  hint: { color: colors.textMuted, marginTop: spacing.sm, fontSize: fontSize.meta },
  error: { color: colors.danger, marginTop: spacing.sm, fontSize: fontSize.meta },
  spacer: { marginTop: spacing.lg },
  list: { marginTop: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowSelected: { backgroundColor: colors.primaryLight, borderRadius: radius.md },
  identity: { flex: 1 },
  name: { fontSize: fontSize.body, fontWeight: "600", color: colors.textPrimary },
  username: { fontSize: fontSize.meta, color: colors.textMuted },
});

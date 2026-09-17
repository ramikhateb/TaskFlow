import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, fontSize, radius, spacing } from "../../ui/theme";

interface FilterOption<T> {
  label: string;
  value: T;
}

interface FilterChipRowProps<T> {
  label: string;
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Generic single-select chip row, shared by the status/priority/category filters. */
export function FilterChipRow<T>({ label, options, value, onChange }: FilterChipRowProps<T>) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <TouchableOpacity
              key={String(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => onChange(option.value)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginBottom: spacing.xl - 4 },
  sectionLabel: { fontSize: fontSize.body, color: colors.textMuted, fontWeight: "600" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm - 2,
    paddingHorizontal: spacing.md,
    minHeight: 32,
    justifyContent: "center",
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.body, color: colors.textBody },
  chipTextSelected: { color: colors.textOnPrimary, fontWeight: "600" },
});

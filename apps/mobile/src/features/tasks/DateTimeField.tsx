import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, disabledOpacity, fontSize, radius, spacing } from "../../ui/theme";

interface DateTimeFieldProps {
  label: string;
  value: Date | null;
  onChange: (value: Date | null) => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

/**
 * A labeled "set/clear" control for an optional date+time value, shown as an
 * icon + readable-value row rather than a raw input.
 *
 * @react-native-community/datetimepicker's Android implementation only
 * supports a single mode ("date" or "time") per dialog — it has no combined
 * "datetime" mode there, unlike iOS's compact picker which does. So iOS gets
 * one combined picker; Android does a two-step date-then-time flow, merging
 * the results into one Date. Confirmed compatible with Expo Go on SDK 57.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  disabled = false,
  icon = "calendar-outline",
}: DateTimeFieldProps) {
  const [activeMode, setActiveMode] = useState<"date" | "time" | null>(null);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);

  function handleChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type !== "set" || !selected) {
      setActiveMode(null);
      setPendingDate(null);
      return;
    }

    if (Platform.OS === "ios") {
      onChange(selected);
      setActiveMode(null);
      return;
    }

    if (activeMode === "date") {
      setPendingDate(selected);
      setActiveMode("time");
      return;
    }

    const base = pendingDate ?? new Date();
    const combined = new Date(base);
    combined.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    onChange(combined);
    setPendingDate(null);
    setActiveMode(null);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.valueButton, disabled && styles.valueButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel={`Set ${label}`}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => setActiveMode("date")}
        >
          <Ionicons
            name={icon}
            size={17}
            color={value ? colors.primary : colors.textMuted}
            style={styles.icon}
          />
          <Text style={[styles.valueText, !value && styles.placeholderText]}>
            {value ? formatDateTime(value) : "Not set"}
          </Text>
        </TouchableOpacity>
        {value && (
          <TouchableOpacity
            style={styles.clearTouch}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => onChange(null)}
          >
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {activeMode && (
        <DateTimePicker
          value={
            activeMode === "time" ? (pendingDate ?? value ?? new Date()) : (value ?? new Date())
          }
          mode={Platform.OS === "ios" ? "datetime" : activeMode}
          display="default"
          onChange={handleChange}
        />
      )}
    </View>
  );
}

function formatDateTime(date: Date): string {
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { fontSize: fontSize.meta, color: colors.textSecondary, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  valueButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  valueButtonDisabled: { opacity: disabledOpacity },
  icon: { width: 18 },
  valueText: { fontSize: fontSize.body, color: colors.textPrimary },
  placeholderText: { color: colors.textMuted },
  clearTouch: { padding: 2 },
});

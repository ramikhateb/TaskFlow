import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface DateTimeFieldProps {
  label: string;
  value: Date | null;
  onChange: (value: Date | null) => void;
  disabled?: boolean;
}

/**
 * A labeled "set/clear" control for an optional date+time value.
 *
 * @react-native-community/datetimepicker's Android implementation only
 * supports a single mode ("date" or "time") per dialog — it has no combined
 * "datetime" mode there, unlike iOS's compact picker which does. So iOS gets
 * one combined picker; Android does a two-step date-then-time flow, merging
 * the results into one Date. Confirmed compatible with Expo Go on SDK 57.
 */
export function DateTimeField({ label, value, onChange, disabled = false }: DateTimeFieldProps) {
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
          <Text style={styles.valueText}>{value ? formatDateTime(value) : "Not set"}</Text>
        </TouchableOpacity>
        {value && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => onChange(null)}
          >
            <Text style={styles.clearText}>Clear</Text>
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
  container: { gap: 4 },
  label: { fontSize: 13, color: "#666", fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  valueButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
  },
  valueButtonDisabled: { opacity: 0.5 },
  valueText: { fontSize: 16 },
  clearText: { color: "#c0392b", fontWeight: "600" },
});

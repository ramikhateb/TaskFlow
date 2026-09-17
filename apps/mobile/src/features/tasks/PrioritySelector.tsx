import type { TaskPriority } from "@taskflow/shared";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH"];

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  LOW: "#2e7d32",
  MEDIUM: "#b8860b",
  HIGH: "#c0392b",
};

// Priority must never be conveyed by color alone (REQUIREMENTS.md §4
// Accessibility) — this is the readable label shown alongside the color cue.
export function priorityLabel(priority: TaskPriority): string {
  return priority.charAt(0) + priority.slice(1).toLowerCase();
}

interface PrioritySelectorProps {
  value: TaskPriority;
  onChange: (value: TaskPriority) => void;
  disabled?: boolean;
}

export function PrioritySelector({ value, onChange, disabled = false }: PrioritySelectorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Priority</Text>
      <View style={styles.row}>
        {PRIORITIES.map((priority) => {
          const selected = priority === value;
          return (
            <TouchableOpacity
              key={priority}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              style={[
                styles.option,
                { borderColor: PRIORITY_COLORS[priority] },
                selected && { backgroundColor: PRIORITY_COLORS[priority] },
                disabled && styles.optionDisabled,
              ]}
              onPress={() => onChange(priority)}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {priority}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  label: { fontSize: 13, color: "#666", fontWeight: "600" },
  row: { flexDirection: "row", gap: 8 },
  option: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  optionText: { fontSize: 13, fontWeight: "600" },
  optionTextSelected: { color: "#fff" },
  optionDisabled: { opacity: 0.5 },
});

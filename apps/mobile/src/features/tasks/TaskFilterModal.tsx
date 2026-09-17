import type { TaskPriority, TaskStatus } from "@taskflow/shared";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTaskFilterStore } from "../../stores/taskFilterStore";
import { FilterChipRow } from "./FilterChipRow";
import { useAvailableCategories } from "./useTasks";

const STATUS_OPTIONS: { label: string; value: TaskStatus | null }[] = [
  { label: "All", value: null },
  { label: "To Do", value: "TODO" },
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "Done", value: "DONE" },
  { label: "Cancelled", value: "CANCELLED" },
];

const PRIORITY_OPTIONS: { label: string; value: TaskPriority | null }[] = [
  { label: "All", value: null },
  { label: "Low", value: "LOW" },
  { label: "Medium", value: "MEDIUM" },
  { label: "High", value: "HIGH" },
];

interface TaskFilterModalProps {
  visible: boolean;
  onClose: () => void;
}

export function TaskFilterModal({ visible, onClose }: TaskFilterModalProps) {
  const status = useTaskFilterStore((s) => s.status);
  const priority = useTaskFilterStore((s) => s.priority);
  const category = useTaskFilterStore((s) => s.category);
  const setStatus = useTaskFilterStore((s) => s.setStatus);
  const setPriority = useTaskFilterStore((s) => s.setPriority);
  const setCategory = useTaskFilterStore((s) => s.setCategory);
  const clearAll = useTaskFilterStore((s) => s.clearAll);

  // Free-text category (no Category table — REQUIREMENTS.md EC-12): options
  // come from the user's own existing task data, not a managed vocabulary.
  const availableCategories = useAvailableCategories();
  const categoryOptions: { label: string; value: string | null }[] = [
    { label: "All", value: null },
    ...availableCategories.map((c) => ({ label: c, value: c })),
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Filters</Text>
            <TouchableOpacity accessibilityRole="button" onPress={onClose}>
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView>
            <FilterChipRow
              label="Status"
              options={STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
            />
            <FilterChipRow
              label="Priority"
              options={PRIORITY_OPTIONS}
              value={priority}
              onChange={setPriority}
            />
            {availableCategories.length > 0 && (
              <FilterChipRow
                label="Category"
                options={categoryOptions}
                value={category}
                onChange={setCategory}
              />
            )}
          </ScrollView>

          <TouchableOpacity
            accessibilityRole="button"
            style={styles.clearButton}
            onPress={clearAll}
          >
            <Text style={styles.clearText}>Clear All Filters</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    maxHeight: "75%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: "700" },
  doneText: { color: "#1a7f37", fontWeight: "600", fontSize: 15 },
  clearButton: { alignItems: "center", paddingVertical: 12, marginTop: 4 },
  clearText: { color: "#c0392b", fontWeight: "600" },
});

import type { TaskPriority } from "@taskflow/shared";
import { SegmentedControl } from "../../ui/SegmentedControl";

const PRIORITY_OPTIONS: { label: string; value: TaskPriority }[] = [
  { label: "Low", value: "LOW" },
  { label: "Medium", value: "MEDIUM" },
  { label: "High", value: "HIGH" },
];

// Priority must never be conveyed by color alone (REQUIREMENTS.md §4
// Accessibility) — this readable label is what every priority pill/segment
// shows alongside its color.
export function priorityLabel(priority: TaskPriority): string {
  return priority.charAt(0) + priority.slice(1).toLowerCase();
}

interface PrioritySelectorProps {
  value: TaskPriority;
  onChange: (value: TaskPriority) => void;
  disabled?: boolean;
}

/** The interactive Low/Medium/High picker used in create/edit forms. */
export function PrioritySelector({ value, onChange, disabled = false }: PrioritySelectorProps) {
  return (
    <SegmentedControl
      options={PRIORITY_OPTIONS}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

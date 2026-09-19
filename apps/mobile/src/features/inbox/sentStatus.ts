import type { AssignmentStatus } from "@taskflow/shared";

// Readable labels for the Sent list (M10) — status must never be conveyed
// by color alone (REQUIREMENTS.md §4 Accessibility), so this label is
// always rendered alongside whatever color/badge styling is used.
export function sentStatusLabel(status: AssignmentStatus): string {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "ACCEPTED":
      return "Accepted";
    case "DECLINED":
      return "Declined";
    case "CANCELLED":
      return "Cancelled";
  }
}

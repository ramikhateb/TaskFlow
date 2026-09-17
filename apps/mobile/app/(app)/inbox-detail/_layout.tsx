import { Stack } from "expo-router";

// Wraps [id].tsx as its own nested stack, so the parent Tabs navigator can
// hide the whole subtree from the tab bar with a single href: null entry
// (see app/(app)/_layout.tsx) while it stays reachable via push — same
// pattern as app/(app)/tasks/_layout.tsx.
export default function InboxDetailStackLayout() {
  return <Stack screenOptions={{ headerBackTitle: "Back" }} />;
}

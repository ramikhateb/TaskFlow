import { Stack } from "expo-router";

// Wraps new.tsx/[id].tsx as one nested stack, so the parent Tabs navigator
// can hide the whole subtree from the tab bar with a single href: null entry
// (see app/(app)/_layout.tsx) while these screens stay reachable via push.
export default function TasksStackLayout() {
  return <Stack screenOptions={{ headerBackTitle: "Back" }} />;
}

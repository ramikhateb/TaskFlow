import { Tabs } from "expo-router";

// Today/Schedule/Tasks/Profile are the app's primary destinations (M5).
// "tasks" (the create/detail stack — app/(app)/tasks/) and "search-users"
// (M7's user-discovery screen, reached from a button on Profile) are
// intentionally hidden from the tab bar via href: null; both stay reachable
// via router.push(...) from any tab, per Expo Router's documented pattern
// for a pushed screen that shouldn't itself be a tab.
export default function AppLayout() {
  return (
    <Tabs initialRouteName="today">
      <Tabs.Screen name="today" options={{ title: "Today" }} />
      <Tabs.Screen name="schedule" options={{ title: "Schedule" }} />
      <Tabs.Screen name="index" options={{ title: "Tasks" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      <Tabs.Screen name="tasks" options={{ href: null }} />
      <Tabs.Screen name="search-users" options={{ href: null, title: "Find People" }} />
    </Tabs>
  );
}

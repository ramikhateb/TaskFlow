import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontSize } from "../../src/ui/theme";

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({
  active,
  inactive,
  focused,
  color,
  size,
}: {
  active: IconName;
  inactive: IconName;
  focused: boolean;
  color: ColorValue;
  size: number;
}) {
  return <Ionicons name={focused ? active : inactive} size={size} color={color as string} />;
}

// React Navigation's `tabBarIcon` is a render prop, not a component that
// needs its own display name — this factory just closes over which two
// glyphs a given tab uses.
function tabIcon(active: IconName, inactive: IconName) {
  // eslint-disable-next-line react/display-name
  return ({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) => (
    <TabIcon active={active} inactive={inactive} focused={focused} color={color} size={size} />
  );
}

const TAB_BAR_CONTENT_HEIGHT = 50;

// Exactly the five real destinations — Today/Schedule/Tasks/Inbox/Profile —
// and nothing else. Every screen reached by drilling into something (task
// details, assigning, an incoming request, editing your profile, ...) lives
// one level up as a root-level stack screen (see app/_layout.tsx), not as a
// hidden tab here — a hidden tab is its own persistent navigation slot
// shared by everyone who pushes into it regardless of origin, which doesn't
// compose with genuine back-history (Today → task → another task → back →
// back → Today). A plain stack screen above the tab bar does.
export default function AppLayout() {
  // A custom tabBarStyle.height replaces React Navigation's own
  // safe-area-aware default, so it has to add the bottom inset back in
  // itself — otherwise the bar is too short and its icons/labels crowd
  // against (or get clipped by) the home indicator / gesture-nav area on
  // notched devices.
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      initialRouteName="today"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: fontSize.tiny, fontWeight: "600" },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom,
        },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{ title: "Today", tabBarIcon: tabIcon("sunny", "sunny-outline") }}
      />
      <Tabs.Screen
        name="schedule"
        options={{ title: "Schedule", tabBarIcon: tabIcon("calendar", "calendar-outline") }}
      />
      <Tabs.Screen
        name="index"
        options={{ title: "Tasks", tabBarIcon: tabIcon("checkbox", "checkbox-outline") }}
      />
      <Tabs.Screen
        name="inbox"
        options={{ title: "Inbox", tabBarIcon: tabIcon("file-tray-full", "file-tray-outline") }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: tabIcon("person", "person-outline") }}
      />
    </Tabs>
  );
}

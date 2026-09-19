import type { ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "./theme";

/**
 * The one place the app's background color — and top safe-area inset — is
 * set. Every screen hides its native header (see app/(app)/_layout.tsx and
 * the tasks/inbox-detail stack layouts) in favor of its own title/ScreenHeader,
 * which means nothing else automatically keeps content clear of the status
 * bar / notch / Dynamic Island the way a native header would have. Without
 * this, every screen's title (and, worse, every pushed screen's back button)
 * renders underneath that area — unreachable and effectively invisible.
 * Only the top edge is inset here: the bottom tab bar already accounts for
 * its own bottom inset (app/(app)/_layout.tsx), and pushed screens' own
 * bottom content padding already clears the home indicator in practice.
 */
export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <SafeAreaView style={[styles.screen, style]} edges={["top"]}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
});

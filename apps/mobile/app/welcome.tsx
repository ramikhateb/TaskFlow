import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import heroIllustration from "../assets/icon_welcoming_page.png";
import { Button } from "../src/ui/Button";
import { Screen } from "../src/ui/Screen";
import { colors, fontFamily, fontSize, radius, spacing } from "../src/ui/theme";

/**
 * The very first thing an unauthenticated user sees — brand identity and a
 * choice of Sign In / Create Account, nothing else. The actual auth forms
 * (email/password) are untouched, separate screens (`sign-in.tsx`,
 * `register.tsx`) reached by pressing a button here; this screen owns no
 * auth logic itself, only navigation to them.
 *
 * Wrapped in a ScrollView (contentContainerStyle flexGrow: 1) rather than a
 * fixed View: on a tall screen the flex spacers alone center everything and
 * nothing ever scrolls, but on a short one (iPhone SE, or Dynamic Type bumped
 * up) the content becomes scrollable instead of clipping the buttons/footer
 * off the bottom of the screen.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.brandArea}>
          <View style={styles.brandMark}>
            <Ionicons name="checkmark-sharp" size={40} color={colors.textOnPrimary} />
            <View style={styles.brandMarkDot} />
          </View>
          <Text style={styles.wordmark}>Nudge</Text>
          <Text style={styles.tagline}>Small nudges.{"\n"}A more organized you.</Text>
        </View>

        <View style={styles.spacer} />

        <Image source={heroIllustration} style={styles.illustration} resizeMode="contain" />

        <View style={styles.spacer} />

        <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Button label="Sign In" style={styles.button} onPress={() => router.push("/sign-in")} />
          <Button
            label="Create Account"
            variant="outlinePrimary"
            style={styles.button}
            onPress={() => router.push("/register")}
          />
          <Text style={styles.footer}>A calmer, more productive you — together.</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: spacing.xl },
  brandArea: { alignItems: "center", marginTop: spacing.xxl },
  brandMark: {
    width: 84,
    height: 84,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  brandMarkDot: {
    position: "absolute",
    top: 19,
    right: 21,
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.textOnPrimary,
  },
  wordmark: {
    fontSize: 42,
    fontFamily: fontFamily.heading,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: fontSize.taskTitle,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginTop: spacing.md,
  },
  spacer: { flex: 1, minHeight: spacing.lg },
  illustration: { width: "100%", height: 230 },
  actions: { gap: spacing.md },
  button: { borderRadius: radius.pill, paddingVertical: 16 },
  footer: {
    fontSize: fontSize.small,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
  },
});

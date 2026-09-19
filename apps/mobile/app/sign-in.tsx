import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "../src/api/client";
import { useLogin } from "../src/features/auth/useAuth";
import { Button } from "../src/ui/Button";
import { TextField } from "../src/ui/FormField";
import { IconButton } from "../src/ui/IconButton";
import { colors, fontFamily, fontSize, radius, spacing } from "../src/ui/theme";

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();

  const errorMessage = login.isError
    ? login.error instanceof ApiError && login.error.status === 401
      ? "Invalid email or password"
      : "Something went wrong. Please try again."
    : null;

  const canSubmit = email.trim().length > 0 && password.length > 0 && !login.isPending;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <IconButton
        name="chevron-back"
        accessibilityLabel="Back to welcome"
        onPress={() => router.back()}
        style={[styles.backButton, { top: insets.top + spacing.sm }]}
      />

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.brand}>
          <View style={styles.brandMark}>
            <Ionicons name="flash" size={26} color={colors.textOnPrimary} />
          </View>
          <Text style={styles.wordmark}>Nudge</Text>
          <Text style={styles.tagline}>Small nudges. A more organized you.</Text>
        </View>

        <View style={styles.form}>
          <TextField
            label="Email"
            placeholder="you@example.com"
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            returnKeyType="next"
            value={email}
            onChangeText={setEmail}
          />
          <TextField
            label="Password"
            placeholder="••••••••"
            accessibilityLabel="Password"
            secureTextEntry
            autoComplete="password"
            returnKeyType="go"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => canSubmit && login.mutate({ email, password })}
          />

          {errorMessage && (
            <Text style={styles.error} accessibilityLabel="Sign in error" accessibilityRole="alert">
              {errorMessage}
            </Text>
          )}

          <Button
            label="Sign In"
            loading={login.isPending}
            disabled={!canSubmit}
            onPress={() => login.mutate({ email, password })}
            style={styles.submit}
          />
        </View>

        <Link href="/register" style={styles.link}>
          Need an account? Create one
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  backButton: { position: "absolute", left: spacing.lg, zIndex: 1 },
  container: { flexGrow: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.xxl },
  brand: { alignItems: "center", gap: spacing.xs },
  brandMark: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  wordmark: {
    fontSize: fontSize.screenTitle,
    fontFamily: fontFamily.heading,
    color: colors.textPrimary,
  },
  tagline: { fontSize: fontSize.body, color: colors.textSecondary },
  form: { gap: spacing.md },
  submit: { marginTop: spacing.sm },
  error: { color: colors.danger, fontSize: fontSize.meta },
  link: { textAlign: "center", color: colors.primary, fontWeight: "600", fontSize: fontSize.meta },
});

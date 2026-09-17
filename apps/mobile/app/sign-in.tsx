import { Link } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { ApiError } from "../src/api/client";
import { useLogin } from "../src/features/auth/useAuth";
import { colors, fontSize, radius, spacing } from "../src/ui/theme";

export default function SignInScreen() {
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
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.title}>TaskFlow</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          returnKeyType="next"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
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

        <TouchableOpacity
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={() => login.mutate({ email, password })}
        >
          {login.isPending ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>

        <Link href="/register" style={styles.link}>
          Need an account? Register
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: "700",
    marginBottom: spacing.md,
    textAlign: "center",
    color: colors.textPrimary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: 14,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: "600" },
  error: { color: colors.danger, fontSize: fontSize.body },
  link: { marginTop: spacing.lg, textAlign: "center", color: colors.primary },
});

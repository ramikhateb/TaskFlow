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
import { useRegister } from "../src/features/auth/useAuth";
import { colors, fontSize, radius, spacing } from "../src/ui/theme";

interface StructuredErrorDetails {
  field?: string;
  fieldErrors?: Record<string, string[]>;
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Something went wrong. Please try again.";
  }

  const details = error.details as StructuredErrorDetails | undefined;

  if (error.code === "CONFLICT") {
    if (details?.field === "username") return "That username is already taken.";
    if (details?.field === "email") return "An account with this email already exists.";
    return error.message;
  }

  if (error.code === "VALIDATION_ERROR") {
    const usernameError = details?.fieldErrors?.username?.[0];
    if (usernameError) return usernameError;
    const passwordError = details?.fieldErrors?.password?.[0];
    if (passwordError) return passwordError;
    const emailError = details?.fieldErrors?.email?.[0];
    if (emailError) return emailError;
    return "Please check your details and try again.";
  }

  return "Something went wrong. Please try again.";
}

export default function RegisterScreen() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const register = useRegister();

  const errorMessage = register.isError ? getErrorMessage(register.error) : null;
  const canSubmit =
    name.trim().length > 0 &&
    username.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length > 0 &&
    !register.isPending;

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
        <Text style={styles.title}>Create your account</Text>

        <TextInput
          style={styles.input}
          placeholder="Name"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Name"
          returnKeyType="next"
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Username"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          value={username}
          onChangeText={setUsername}
        />
        <Text style={styles.hint}>
          Your @handle — lowercase letters, numbers, underscore, or period, 3-20 characters.
        </Text>
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
          autoComplete="password-new"
          returnKeyType="go"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={() => canSubmit && register.mutate({ name, username, email, password })}
        />

        {errorMessage && (
          <Text
            style={styles.error}
            accessibilityLabel="Registration error"
            accessibilityRole="alert"
          >
            {errorMessage}
          </Text>
        )}

        <TouchableOpacity
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={() => register.mutate({ name, username, email, password })}
        >
          {register.isPending ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        <Link href="/sign-in" style={styles.link}>
          Already have an account? Sign in
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  title: {
    fontSize: fontSize.xl,
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
  hint: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: -6 },
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

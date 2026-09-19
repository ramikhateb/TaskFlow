import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError } from "../src/api/client";
import { useRegister } from "../src/features/auth/useAuth";
import { Button } from "../src/ui/Button";
import { TextField } from "../src/ui/FormField";
import { colors, fontFamily, fontSize, radius, spacing } from "../src/ui/theme";

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
        <View style={styles.brand}>
          <View style={styles.brandMark}>
            <Ionicons name="flash" size={24} color={colors.textOnPrimary} />
          </View>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.tagline}>Turn intentions into progress.</Text>
        </View>

        <View style={styles.form}>
          <TextField
            label="Name"
            placeholder="Your name"
            accessibilityLabel="Name"
            returnKeyType="next"
            value={name}
            onChangeText={setName}
          />
          <View>
            <TextField
              label="Username"
              placeholder="username"
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
          </View>
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
            autoComplete="password-new"
            returnKeyType="go"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() =>
              canSubmit && register.mutate({ name, username, email, password })
            }
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

          <Button
            label="Create Account"
            loading={register.isPending}
            disabled={!canSubmit}
            onPress={() => register.mutate({ name, username, email, password })}
            style={styles.submit}
          />
        </View>

        <Link href="/sign-in" style={styles.link}>
          Already have an account? Sign in
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.xl },
  brand: { alignItems: "center", gap: spacing.xs },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.sectionTitle + 3,
    fontFamily: fontFamily.heading,
    color: colors.textPrimary,
  },
  tagline: { fontSize: fontSize.body, color: colors.textSecondary },
  form: { gap: spacing.md },
  hint: { fontSize: fontSize.small, color: colors.textMuted, marginTop: spacing.xs },
  submit: { marginTop: spacing.sm },
  error: { color: colors.danger, fontSize: fontSize.meta },
  link: { textAlign: "center", color: colors.primary, fontWeight: "600", fontSize: fontSize.meta },
});

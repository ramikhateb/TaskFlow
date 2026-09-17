import { Link } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ApiError } from "../src/api/client";
import { useRegister } from "../src/features/auth/useAuth";

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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create your account</Text>

      <TextInput
        style={styles.input}
        placeholder="Name"
        accessibilityLabel="Name"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Username"
        accessibilityLabel="Username"
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
      />
      <Text style={styles.hint}>
        Your @handle — lowercase letters, numbers, underscore, or period, 3-20 characters.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        accessibilityLabel="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        accessibilityLabel="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {errorMessage && (
        <Text style={styles.error} accessibilityLabel="Registration error">
          {errorMessage}
        </Text>
      )}

      <TouchableOpacity
        style={styles.button}
        accessibilityRole="button"
        disabled={register.isPending}
        onPress={() => register.mutate({ name, username, email, password })}
      >
        {register.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Create Account</Text>
        )}
      </TouchableOpacity>

      <Link href="/sign-in" style={styles.link}>
        Already have an account? Sign in
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 12, textAlign: "center" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  hint: { fontSize: 12, color: "#666", marginTop: -6 },
  button: {
    backgroundColor: "#1a7f37",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  error: { color: "#c0392b" },
  link: { marginTop: 16, textAlign: "center", color: "#1a7f37" },
});

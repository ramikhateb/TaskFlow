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
import { useLogin } from "../src/features/auth/useAuth";

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();

  const errorMessage = login.isError
    ? login.error instanceof ApiError && login.error.status === 401
      ? "Invalid email or password"
      : "Something went wrong. Please try again."
    : null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TaskFlow</Text>

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
        <Text style={styles.error} accessibilityLabel="Sign in error">
          {errorMessage}
        </Text>
      )}

      <TouchableOpacity
        style={styles.button}
        accessibilityRole="button"
        disabled={login.isPending}
        onPress={() => login.mutate({ email, password })}
      >
        {login.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign In</Text>
        )}
      </TouchableOpacity>

      <Link href="/register" style={styles.link}>
        Need an account? Register
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 12, textAlign: "center" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
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

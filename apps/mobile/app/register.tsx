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

export default function RegisterScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const register = useRegister();

  const errorMessage = register.isError
    ? register.error instanceof ApiError && register.error.status === 409
      ? "An account with this email already exists"
      : register.error instanceof ApiError && register.error.status === 400
        ? "Please check your details — password needs 8+ characters with a letter and a number"
        : "Something went wrong. Please try again."
    : null;

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
        onPress={() => register.mutate({ name, email, password })}
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

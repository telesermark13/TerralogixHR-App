// screens/AcceptInviteScreen.js
import React, { useMemo, useState } from "react";
import {
  Alert,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import axios from "axios";
import { useNavigation, useRoute } from "@react-navigation/native";

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  "https://terralogixhr-app-production.up.railway.app";

export default function AcceptInviteScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const token = route?.params?.token;

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [secure, setSecure] = useState(true);
  const [loading, setLoading] = useState(false);

  const disabled = useMemo(() => {
    if (!token || !password || !confirm) return true;
    if (password !== confirm) return true;
    // simple baseline requirements: 8+ chars
    if (password.length < 8) return true;
    return false;
  }, [token, password, confirm]);

  const showError = (title, message) => Alert.alert(title, message);

  const accept = async () => {
    if (!token) {
      showError("Missing token", "Invitation token is required.");
      return;
    }
    if (password !== confirm) {
      showError("Password mismatch", "Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const client = axios.create({
        baseURL: API_BASE,
        timeout: 15000,
        headers: { "Content-Type": "application/json" },
      });

      await client.post("/api/accept-invite/", { token, password });

      Alert.alert("Registered!", "Your account has been created.", [
        {
          text: "OK",
          onPress: () => {
            // Adjust route name as per your navigator
            navigation.navigate("Login");
          },
        },
      ]);
    } catch (err) {
      const serverMsg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.response?.data?.error;
      showError(
        "Error",
        serverMsg?.toString() || "Invalid or expired token. Please request a new invite."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: "padding", android: undefined })}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Accept Invitation</Text>
        {!token ? (
          <Text style={styles.tokenWarn}>
            No token provided. Open this screen via your invite link.
          </Text>
        ) : null}

        <TextInput
          placeholder="New Password (min 8 chars)"
          secureTextEntry={secure}
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />

        <TextInput
          placeholder="Confirm Password"
          secureTextEntry={secure}
          value={confirm}
          onChangeText={setConfirm}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />

        <TouchableOpacity
          onPress={() => setSecure((s) => !s)}
          style={styles.toggle}
        >
          <Text style={styles.toggleText}>
            {secure ? "Show" : "Hide"} passwords
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, disabled || loading ? styles.buttonDisabled : null]}
          onPress={accept}
          disabled={disabled || loading}
        >
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.buttonText}>Register</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "#0b1220" },
  card: { width: "100%", maxWidth: 420, backgroundColor: "#111a2b", borderRadius: 16, padding: 20, gap: 12 },
  title: { fontSize: 20, fontWeight: "700", color: "#ffffff", marginBottom: 4 },
  tokenWarn: { color: "#ffcc00", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#2a3a5f",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#ffffff",
    backgroundColor: "#0f172a",
  },
  toggle: { alignSelf: "flex-end", paddingVertical: 6 },
  toggleText: { color: "#8ea9ff" },
  button: {
    marginTop: 6,
    backgroundColor: "#3b82f6",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#ffffff", fontWeight: "700" },
});

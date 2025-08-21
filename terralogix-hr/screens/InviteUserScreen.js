// screens/InviteUserScreen.js
import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  "https://terralogixhr-app-production.up.railway.app";

const EMAIL_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // simple/robust enough regex

export default function InviteUserScreen() {
  const { token } = useAuth();
  const [input, setInput] = useState(""); // supports single or multiple emails
  const [loading, setLoading] = useState(false);

  const cancelRef = useRef(null);

  const client = useMemo(() => {
    const instance = axios.create({
      baseURL: API_BASE,
      timeout: 15000,
      headers: { Authorization: `Bearer ${token}` },
    });
    return instance;
  }, [token]);

  const parsedEmails = useMemo(() => {
    // split by comma, space, or newline
    return input
      .split(/[\s,]+/)
      .map((e) => e.trim())
      .filter(Boolean);
  }, [input]);

  const invalids = parsedEmails.filter((e) => !EMAIL_RE.test(e));

  const invite = async () => {
    if (parsedEmails.length === 0) {
      Alert.alert("Required", "Enter at least one email.");
      return;
    }
    if (invalids.length) {
      Alert.alert(
        "Invalid email(s)",
        `Please fix: ${invalids.slice(0, 5).join(", ")}${invalids.length > 5 ? "…" : ""}`
      );
      return;
    }

    setLoading(true);
    try {
      cancelRef.current?.cancel?.("new invite request");
      cancelRef.current = axios.CancelToken.source();

      // If your API supports bulk, you can POST one array.
      // Otherwise, fire sequentially.
      let success = 0;
      for (const email of parsedEmails) {
        try {
          await client.post(
            "/api/invite/",
            { email },
            { cancelToken: cancelRef.current.token }
          );
          success += 1;
        } catch (e) {
          // Collect per-email failures but continue
          console.warn("Invite failed:", email, e?.response?.data || e.message);
        }
      }

      if (success === parsedEmails.length) {
        Alert.alert("Sent!", `Invitation${success > 1 ? "s" : ""} sent!`);
        setInput("");
      } else if (success > 0) {
        Alert.alert(
          "Partial success",
          `${success}/${parsedEmails.length} invite(s) sent. Some failed—check logs or try again.`
        );
      } else {
        Alert.alert("Error", "Failed to send any invitations.");
      }
    } catch (e) {
      if (!axios.isCancel(e)) {
        const msg =
          e?.response?.data?.detail ||
          e?.response?.data?.message ||
          e?.message ||
          "Failed to invite.";
        Alert.alert("Error", msg);
      }
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    return () => cancelRef.current?.cancel?.("InviteUserScreen unmount");
  }, []);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: "padding", android: undefined })}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Invite User(s)</Text>
        <Text style={styles.help}>
          Enter one or more email addresses. You can separate them with commas,
          spaces, or new lines.
        </Text>

        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="e.g. jane@company.com, john@company.com"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          style={styles.input}
        />

        {parsedEmails.length > 0 && (
          <Text style={styles.counter}>
            {parsedEmails.length} email{parsedEmails.length > 1 ? "s" : ""} parsed
            {invalids.length > 0 ? ` • ${invalids.length} invalid` : ""}
          </Text>
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={invite}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Invite</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "#0b1220" },
  title: { fontSize: 22, fontWeight: "800", color: "#fff", marginBottom: 8 },
  help: { color: "#9aa4b2", textAlign: "center", marginBottom: 12 },
  input: {
    width: "100%",
    minHeight: 110,
    backgroundColor: "#0f172a",
    borderColor: "#223453",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    color: "#e5e7eb",
    textAlignVertical: "top",
  },
  counter: { color: "#9aa4b2", marginTop: 8, alignSelf: "flex-start" },
  button: {
    marginTop: 14,
    backgroundColor: "#3b82f6",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: "center",
    minWidth: 160,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "800" },
});

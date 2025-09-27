// screens/AttendanceQRScreen.js
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from "react-native";
import axios from "axios";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useAuth } from "../AuthContext";
import { API_BASE_URL } from "../api";

export default function AttendanceQRScreen() {
  const { token } = useAuth();
  const [qr, setQr] = useState(null); // base64 (no prefix)
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const cancelSrcRef = useRef(null);

  const fetchQR = useCallback(
    async (isRefresh = false) => {
      if (!token) {
        setError("You're not authenticated.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      setError(null);

      try {
        // Cancel any in-flight request
        cancelSrcRef.current?.cancel?.("New request initiated");
        cancelSrcRef.current = axios.CancelToken.source();

        const res = await axios.get(`${API_BASE_URL}/attendance/qr/`, {
          headers: { Authorization: `Bearer ${token}` },
          cancelToken: cancelSrcRef.current.token,
          responseType: "json",
        });

        const code = res?.data?.qr_code;
        if (!code) {
          throw new Error("QR code not found in response.");
        }
        setQr(code);
      } catch (e) {
        if (!axios.isCancel(e)) {
          setQr(null);
          setError(
            e?.response?.data?.detail ||
              e?.message ||
              "Failed to load QR. Please try again."
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    fetchQR(false);
    return () => {
      cancelSrcRef.current?.cancel?.("Component unmounted");
    };
  }, [fetchQR]);

  const onRefresh = () => fetchQR(true);

  const shareQR = async () => {
    try {
      if (!qr) return;
      const fileUri = `${FileSystem.cacheDirectory}attendance_qr.png`;
      // Save base64 -> file
      await FileSystem.writeAsStringAsync(fileUri, qr, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await Sharing.shareAsync(fileUri, { mimeType: "image/png" });
    } catch (e) {
      Alert.alert("Share failed", e?.message || "Unable to share the QR image.");
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.container}>
        <Text style={styles.title}>Scan this QR to Time In</Text>

        {loading ? (
          <ActivityIndicator size="large" />
        ) : error ? (
          <>
            <Text style={styles.error}>{error}</Text>
            <TouchableOpacity style={styles.btn} onPress={() => fetchQR(false)}>
              <Text style={styles.btnText}>Try Again</Text>
            </TouchableOpacity>
          </>
        ) : qr ? (
          <>
            <Image
              source={{ uri: `data:image/png;base64,${qr}` }}
              style={styles.qr}
            />
            <View style={styles.row}>
              <TouchableOpacity style={[styles.btn, styles.primary]} onPress={onRefresh}>
                <Text style={styles.btnText}>Regenerate</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.dark]} onPress={shareQR}>
                <Text style={styles.btnText}>Save / Share</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <Text>No QR available.</Text>
            <TouchableOpacity style={styles.btn} onPress={() => fetchQR(false)}>
              <Text style={styles.btnText}>Reload</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: { fontWeight: "bold", fontSize: 20, marginBottom: 16 },
  qr: { width: 260, height: 260, marginVertical: 20 },
  btn: {
    backgroundColor: "#00BFFF",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  primary: { backgroundColor: "#00BFFF" },
  dark: { backgroundColor: "#111827", marginLeft: 12 },
  btnText: { color: "#fff", fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center" },
  error: { color: "#dc2626", textAlign: "center", marginBottom: 12 },
});
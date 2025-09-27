// screens/QRCheckinScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Linking, StyleSheet } from "react-native";
import { BarCodeScanner } from "expo-barcode-scanner";
import axios from "axios";
import { useAuth } from "../AuthContext";
import { API_BASE_URL } from "../api";

export default function QRCheckinScreen() {
  const { token } = useAuth();

  const [hasPermission, setHasPermission] = useState(null); // null | true | false
  const [scanned, setScanned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const cancelRef = useRef(null);
  const lastScanAt = useRef(0);

  // Ask for camera permission on mount
  useEffect(() => {
    (async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasPermission(status === "granted");
      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Camera access is required to scan the QR for attendance.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings?.() },
          ]
        );
      }
    })();
    return () => {
      // cancel pending request if user leaves the screen mid-submit
      cancelRef.current?.cancel?.("QRCheckinScreen unmounted");
    };
  }, []);

  const client = useMemo(() => {
    return axios.create({
      baseURL: API_BASE_URL,
      timeout: 15000,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }, [token]);

  const handleBarCodeScanned = useCallback(
    async ({ data, type }) => {
      // basic throttle to prevent duplicate hits (e.g., iOS rapid re-fire)
      const now = Date.now();
      if (now - lastScanAt.current < 1500) return;
      lastScanAt.current = now;

      setScanned(true);
      if (!token) {
        Alert.alert("Not logged in", "Please log in again.");
        return;
      }

      try {
        setSubmitting(true);
        cancelRef.current?.cancel?.("new request");
        cancelRef.current = axios.CancelToken.source();

        const res = await client.post(
          "/attendance/qr-checkin/",
          { qr_data: data },
          { cancelToken: cancelRef.current.token }
        );

        Alert.alert("Attendance", res?.data?.message || "Checked in!");
      } catch (e) {
        // Try to pull a friendly message
        const msg =
          e?.response?.data?.error ||
          e?.response?.data?.detail ||
          e?.message ||
          "Failed to check in.";
        Alert.alert("Error", msg);
      } finally {
        setSubmitting(false);
      }
    },
    [client, token]
  );

  if (hasPermission === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#00BFFF" />
        <Text style={{ marginTop: 8 }}>Requesting camera permission…</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.center}>
        <Text style={{ textAlign: "center", marginBottom: 12 }}>
          Camera permission is required to scan the QR code.
        </Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => Linking.openSettings?.()}
        >
          <Text style={styles.btnText}>Open Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <BarCodeScanner
        onBarCodeScanned={scanned || submitting ? undefined : handleBarCodeScanned}
        style={{ flex: 1 }}
      />

      {/* Overlay UI */}
      <View pointerEvents="none" style={styles.overlay}>
        <View style={styles.frame} />
        <Text style={styles.overlayText}>Align the QR code within the frame</Text>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {submitting ? (
          <View style={[styles.btn, { backgroundColor: "#6b7280" }]}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : scanned ? (
          <TouchableOpacity style={styles.btn} onPress={() => setScanned(false)}>
            <Text style={styles.btnText}>Tap to Scan Again</Text>
          </TouchableOpacity>
        ) : (
          <Text style={{ color: "#fff", textAlign: "center" }}>Scanning…</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "#000" },
  overlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    width: 240,
    height: 240,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: "#00BFFF",
    backgroundColor: "transparent",
  },
  overlayText: {
    color: "#fff",
    marginTop: 12,
    textAlign: "center",
  },
  controls: {
    position: "absolute",
    left: 0, right: 0, bottom: 20,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  btn: {
    backgroundColor: "#00BFFF",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    minWidth: 180,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "bold" },
});
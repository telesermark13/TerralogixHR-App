// screens/AttendanceScreen.js
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import { useFocusEffect } from "@react-navigation/native";

import {
  fetchAttendance,
  postTimeIn,
  postTimeOut,
  logout,
} from "../api";

import { queueAction, processQueue } from "../utils/offline";

export default function AttendanceScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [status, setStatus] = useState("Timed Out");
  const [timeIn, setTimeIn] = useState(null);
  const [timeOut, setTimeOut] = useState(null);
  const [history, setHistory] = useState([]);

  const [offlineMode, setOfflineMode] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [actionLoading, setActionLoading] = useState({ in: false, out: false });
  const [lastSync, setLastSync] = useState(null);

  // Local ISO date (YYYY-MM-DD) using local timezone
  const todayISO = new Date().toLocaleDateString("en-CA");

  // --- Helpers ---
  const getCurrentLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission denied",
        "Location permission is required for attendance."
      );
      return null;
    }
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced, // fast & good enough for attendance
      maximumAge: 15_000,
      timeout: 15_000,
    });
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  };

  const loadAttendance = useCallback(
    async (showAlert = false) => {
      setLoading(true);
      setRefreshing(true);
      try {
        const res = await fetchAttendance();
        const list = Array.isArray(res) ? res : [];
        setHistory(list);

        const todayRec = list.find((i) => i.date === todayISO);
        setTimeIn(todayRec?.time_in || null);
        setTimeOut(todayRec?.time_out || null);
        setStatus(
          todayRec?.time_out ? "Timed Out" : todayRec?.time_in ? "Present" : "Timed Out"
        );
        setLastSync(new Date());
        if (showAlert) Alert.alert("Success", "Attendance refreshed from server!");
      } catch (err) {
        setOfflineMode(true);
        if (showAlert) Alert.alert("Offline", "Showing last available attendance.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [todayISO]
  );

  // Initial load
  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  // Reload when screen gains focus (handy after returning from other screens)
  useFocusEffect(
    useCallback(() => {
      loadAttendance();
    }, [loadAttendance])
  );

  // Online/Offline subscription + auto-sync
  useEffect(() => {
    const unsub = NetInfo.addEventListener(async (state) => {
      const reachable =
        state.isConnected === true &&
        (state.isInternetReachable === null ? true : state.isInternetReachable);
      setOfflineMode(!reachable);

      // sync when we come back online
      if (reachable) {
        await processQueue();
        await loadAttendance();
      }
    });
    return () => unsub();
  }, [loadAttendance]);

  // Derived
  const todayRecord = history.find((item) => item.date === todayISO);

  // --- Actions ---
  const handleTimeIn = async () => {
    if (timeIn) {
      Alert.alert("Already Timed In", "You have already timed in for today.");
      return;
    }

    const location = await getCurrentLocation();
    if (!location) return;

    setActionLoading((s) => ({ ...s, in: true }));
    const net = await NetInfo.fetch();
    const reachable =
      net.isConnected === true &&
      (net.isInternetReachable === null ? true : net.isInternetReachable);

    if (reachable) {
      try {
        await postTimeIn(location);
        Alert.alert("Success", "Time In successful!");
        await loadAttendance(true);
      } catch (err) {
        Alert.alert("Error", err?.message || "Time In failed.");
      } finally {
        setActionLoading((s) => ({ ...s, in: false }));
      }
    } else {
      await queueAction("attendance", { type: "in", payload: { date: todayISO, location } });
      setTimeIn("OFFLINE");
      setStatus("Present");
      setActionLoading((s) => ({ ...s, in: false }));
      Alert.alert("Offline", "Time In saved locally. Will sync when online.");
    }
  };

  const handleTimeOut = async () => {
    if (!timeIn) {
      Alert.alert("Not Yet Timed In", "Please time in first.");
      return;
    }
    if (timeOut) {
      Alert.alert("Already Timed Out", "You have already timed out for today.");
      return;
    }

    const location = await getCurrentLocation();
    if (!location) return;

    setActionLoading((s) => ({ ...s, out: true }));
    const net = await NetInfo.fetch();
    const reachable =
      net.isConnected === true &&
      (net.isInternetReachable === null ? true : net.isInternetReachable);

    if (reachable) {
      try {
        await postTimeOut(location);
        Alert.alert("Success", "Time Out successful!");
        await loadAttendance(true);
      } catch (err) {
        Alert.alert("Error", err?.message || "Time Out failed.");
      } finally {
        setActionLoading((s) => ({ ...s, out: false }));
      }
    } else {
      await queueAction("attendance", { type: "out", payload: { date: todayISO, location } });
      setTimeOut("OFFLINE");
      setStatus("Timed Out");
      setActionLoading((s) => ({ ...s, out: false }));
      Alert.alert("Offline", "Time Out saved locally. Will sync when online.");
    }
  };

  // Logout (block if anything is pending)
  const handleLogout = async () => {
    await logout();
    navigation.replace("LoginScreen");
  };

  // Map
  const handleShowMap = () => {
    const withCoords = history.filter(
      (h) => Number.isFinite(h.latitude) && Number.isFinite(h.longitude)
    );
    if (withCoords.length === 0) {
      Alert.alert("No Location Data", "No check-ins have location data.");
      return;
    }
    navigation.navigate("AttendanceMap", { checkins: withCoords });
  };

  // Button enablement (only block if there’s *today’s* pending)
  const canTimeIn =
    !timeIn && !actionLoading.in && !(todayRecord?.time_in) && !(timeIn === "OFFLINE");

  const canTimeOut =
    !!(todayRecord?.time_in || timeIn) &&
    !timeOut &&
    !actionLoading.out &&
    !(timeOut === "OFFLINE");

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Attendance</Text>

      <TouchableOpacity style={styles.mapButton} onPress={handleShowMap}>
        <Text style={{ color: "#fff", fontWeight: "bold" }}>
          View Check-ins on Map
        </Text>
      </TouchableOpacity>

      {offlineMode && (
        <Text style={{ color: "orange", marginBottom: 8 }}>Offline Mode</Text>
      )}

      {lastSync && (
        <Text style={styles.syncNote}>
          Last sync: {lastSync.toLocaleString()}
        </Text>
      )}

      {loading ? (
        <ActivityIndicator color="#00BFFF" style={{ marginVertical: 32 }} />
      ) : (
        <>
          <Text style={styles.status}>Status: {status}</Text>
          <Text>Time In: {timeIn || "--"}</Text>
          <Text>Time Out: {timeOut || "--"}</Text>

          <TouchableOpacity
            style={[styles.button, (!canTimeIn || actionLoading.in) && styles.disabledButton]}
            onPress={handleTimeIn}
            disabled={!canTimeIn || actionLoading.in}
          >
            {actionLoading.in ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Time In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, (!canTimeOut || actionLoading.out) && styles.disabledButton]}
            onPress={handleTimeOut}
            disabled={!canTimeOut || actionLoading.out}
          >
            {actionLoading.out ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Time Out</Text>
            )}
          </TouchableOpacity>

          {/* Optional logout (kept commented)
          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#ccc' }]}
            onPress={handleLogout}
          >
            <Text style={{ color: '#222', fontWeight: 'bold' }}>Logout</Text>
          </TouchableOpacity>
          */}

          <Text style={styles.historyHeader}>Attendance History</Text>
          <FlatList
            data={history}
            keyExtractor={(item) => item.id?.toString() || item.date}
            renderItem={({ item }) => (
              <View style={styles.historyItem}>
                <Text>{item.date}</Text>
                <Text>
                  In: {item.time_in || "--"} | Out: {item.time_out || "--"}
                </Text>
              </View>
            )}
            style={{ marginTop: 16, width: "100%" }}
            contentContainerStyle={{ alignItems: "center" }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadAttendance(true)}
                colors={["#00BFFF"]}
              />
            }
            ListEmptyComponent={
              <Text
                style={{
                  color: "#999",
                  fontStyle: "italic",
                  textAlign: "center",
                }}
              >
                No attendance records yet.
              </Text>
            }
          />
        </>
      )}

      <Text style={styles.tagline}>© 2024 Terralogix. All Rights Reserved.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F8FB",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  header: { fontSize: 22, fontWeight: "bold", color: "#00BFFF", marginBottom: 18 },
  mapButton: {
    backgroundColor: "#00BFFF",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 8,
    width: "100%",
  },
  pendingBanner: {
    width: "100%",
    backgroundColor: "#f47c31",
    padding: 8,
    marginBottom: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  syncNote: { color: "#6b7280", marginBottom: 6, fontSize: 12 },
  status: { fontSize: 16, marginBottom: 8, color: "#222" },
  button: {
    width: "100%",
    height: 48,
    backgroundColor: "#00BFFF",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    marginTop: 12,
  },
  disabledButton: { backgroundColor: "#9CA3AF" },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 18 },
  historyHeader: {
    marginTop: 32,
    fontSize: 18,
    fontWeight: "bold",
    color: "#00BFFF",
    textAlign: "center",
  },
  historyItem: {
    padding: 8,
    backgroundColor: "#fff",
    marginVertical: 4,
    borderRadius: 6,
    width: "90%",
    alignItems: "center",
  },
  tagline: {
    color: "#888",
    fontSize: 12,
    marginTop: 24,
    textAlign: "center",
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    width: "100%",
  },
});
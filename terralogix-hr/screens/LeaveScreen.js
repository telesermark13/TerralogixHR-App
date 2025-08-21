// screens/LeaveScreen.js
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import DateTimePicker from "@react-native-community/datetimepicker";
import { getLeaves, createLeave } from "../api";

const PENDING_LEAVE_KEY = "leave:pending:v1";
const CACHED_LEAVES_KEY = "leave:cache:v1";

// --- Offline queue helpers (de-duped) ---
async function getQueuedLeaves() {
  const raw = await AsyncStorage.getItem(PENDING_LEAVE_KEY);
  return raw ? JSON.parse(raw) : [];
}
async function setQueuedLeaves(arr) {
  await AsyncStorage.setItem(PENDING_LEAVE_KEY, JSON.stringify(arr));
}
async function queueLeaveRequest(req) {
  const arr = await getQueuedLeaves();
  const exists = arr.some(
    (x) =>
      x.start_date === req.start_date &&
      x.end_date === req.end_date &&
      (x.reason || "").trim() === (req.reason || "").trim()
  );
  if (!exists) {
    arr.push(req);
    await setQueuedLeaves(arr);
  }
  return arr.length;
}
async function clearQueuedLeaves() {
  await AsyncStorage.removeItem(PENDING_LEAVE_KEY);
}

export default function LeaveScreen() {
  const [leaves, setLeaves] = useState([]);
  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState(""); // YYYY-MM-DD
  const [endDate, setEndDate] = useState(""); // YYYY-MM-DD

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [offline, setOffline] = useState(false);
  const [pendingLeaves, setPendingLeaves] = useState([]);

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const todayISO = useMemo(() => new Date().toLocaleDateString("en-CA"), []);

  const updatePendingLeaves = useCallback(
    () => getQueuedLeaves().then(setPendingLeaves),
    []
  );

  // Connectivity + auto-sync
  useEffect(() => {
    const unsub = NetInfo.addEventListener(async (state) => {
      const reachable =
        state.isConnected === true &&
        (state.isInternetReachable === null ? true : state.isInternetReachable);
      setOffline(!reachable);

      if (reachable) {
        // attempt sync
        const queued = await getQueuedLeaves();
        if (queued.length > 0) {
          let anyFailed = false;
          for (const req of queued) {
            try {
              await createLeave(req);
            } catch (e) {
              anyFailed = true;
              // keep failed items in the queue
              console.warn("Leave sync failed:", e?.response?.data || e.message);
            }
          }
          if (!anyFailed) {
            await clearQueuedLeaves();
          } else {
            // keep only failed ones by rechecking against server? Minimal approach: leave queue as-is
          }
          await loadLeaves();
        }
      }
      await updatePendingLeaves();
    });
    updatePendingLeaves();
    return () => unsub();
  }, [loadLeaves, updatePendingLeaves]);

  // Load leaves (server -> cache; else cache)
  const loadLeaves = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await getLeaves();
      const list = Array.isArray(data) ? data : [];
      setLeaves(list);
      await AsyncStorage.setItem(CACHED_LEAVES_KEY, JSON.stringify(list));
    } catch (e) {
      const cached = await AsyncStorage.getItem(CACHED_LEAVES_KEY);
      if (cached) {
        setLeaves(JSON.parse(cached));
        Alert.alert("Offline", "Showing last available leave data.");
      } else {
        setLeaves([]);
        Alert.alert("Error", e?.message || "Failed to load leaves.");
      }
      setOffline(true);
    } finally {
      setRefreshing(false);
      setLoading(false);
      updatePendingLeaves();
    }
  }, []);

  useEffect(() => {
    loadLeaves();
  }, [loadLeaves]);

  // Helpers
  const toISO = (d) => d.toISOString().slice(0, 10);
  const parseISO = (s) => (s ? new Date(s) : null);
  const daysCount = useMemo(() => {
    const s = parseISO(startDate);
    const e = parseISO(endDate);
    if (!s || !e) return 0;
    const ms = e.setHours(0, 0, 0, 0) - s.setHours(0, 0, 0, 0);
    return ms >= 0 ? Math.floor(ms / 86400000) + 1 : 0;
  }, [startDate, endDate]);

  const validate = () => {
    if (!startDate || !endDate || !reason.trim()) {
      Alert.alert("Missing info", "Start date, end date, and reason are required.");
      return false;
    }
    if (endDate < startDate) {
      Alert.alert("Invalid range", "End date cannot be earlier than start date.");
      return false;
    }
    // Optional: limit to future or today
    // if (startDate < todayISO) { ... }
    return true;
  };

  const resetForm = () => {
    setReason("");
    setStartDate("");
    setEndDate("");
  };

  // Submit (queues if offline)
  const submitLeave = async () => {
    if (!validate()) return;

    // Optional: avoid duplicates vs. existing leaves
    const dupExisting = leaves.some(
      (l) =>
        l.start_date === startDate &&
        l.end_date === endDate &&
        (l.reason || "").trim() === reason.trim()
    );
    if (dupExisting) {
      Alert.alert("Duplicate", "You already submitted the same leave.");
      return;
    }

    const leaveData = {
      start_date: startDate,
      end_date: endDate,
      reason: reason.trim(),
    };

    if (offline) {
      await queueLeaveRequest(leaveData);
      resetForm();
      Alert.alert(
        "Queued",
        "You are offline. Leave request will be submitted when you go online."
      );
      updatePendingLeaves();
      return;
    }

    setSubmitting(true);
    try {
      await createLeave(leaveData);
      resetForm();
      await loadLeaves();
      Alert.alert("Success", "Leave requested!");
    } catch (e) {
      Alert.alert("Failed", e?.message || "Could not submit leave.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;

  return (
    <View style={styles.container}>
      {offline && (
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineText}>Offline Mode</Text>
        </View>
      )}

      {/* Form */}
      <View style={styles.form}>
        {/* Start Date */}
        <TouchableOpacity onPress={() => setShowStartPicker(true)}>
          <TextInput
            value={startDate}
            placeholder="Start Date (YYYY-MM-DD)"
            style={styles.input}
            editable={false}
            pointerEvents="none"
          />
        </TouchableOpacity>
        {showStartPicker && (
          <DateTimePicker
            value={startDate ? new Date(startDate) : new Date()}
            mode="date"
            display="default"
            onChange={(event, date) => {
              setShowStartPicker(false);
              if (date) {
                const iso = toISO(date);
                setStartDate(iso);
                // auto-adjust end if empty or before start
                if (!endDate || endDate < iso) setEndDate(iso);
              }
            }}
          />
        )}

        {/* End Date */}
        <TouchableOpacity onPress={() => setShowEndPicker(true)}>
          <TextInput
            value={endDate}
            placeholder="End Date (YYYY-MM-DD)"
            style={styles.input}
            editable={false}
            pointerEvents="none"
          />
        </TouchableOpacity>
        {showEndPicker && (
          <DateTimePicker
            value={endDate ? new Date(endDate) : new Date()}
            mode="date"
            display="default"
            minimumDate={startDate ? new Date(startDate) : undefined}
            onChange={(event, date) => {
              setShowEndPicker(false);
              if (date) setEndDate(toISO(date));
            }}
          />
        )}

        {/* Reason */}
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="Reason for leave"
          style={styles.input}
        />

        {/* Days badge */}
        {!!daysCount && (
          <Text style={styles.daysNote}>
            {daysCount} day{daysCount > 1 ? "s" : ""} selected
          </Text>
        )}

        {/* Submit */}
        <TouchableOpacity
          onPress={submitLeave}
          style={[styles.button, submitting && styles.buttonDisabled]}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Submit Leave Request</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Leaves List */}
      <FlatList
        data={leaves}
        keyExtractor={(item) => String(item.id ?? `${item.start_date}-${item.end_date}-${item.reason}`)}
        renderItem={({ item }) => (
          <View style={styles.leaveItem}>
            <Text>From: {item.start_date}</Text>
            <Text>To: {item.end_date}</Text>
            <Text>Reason: {item.reason}</Text>
            <Text>Status: {item.status}</Text>
          </View>
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadLeaves} />
        }
        ListEmptyComponent={
          <Text style={{ color: "#999", textAlign: "center", fontStyle: "italic" }}>
            No leave records yet.
          </Text>
        }
      />

      {/* Pending Queue */}
      {pendingLeaves.length > 0 && (
        <View style={styles.queue}>
          <Text style={styles.queueTitle}>
            Pending Leave Requests ({pendingLeaves.length})
          </Text>
          {pendingLeaves.map((req, idx) => (
            <View key={`${req.start_date}-${req.end_date}-${idx}`} style={styles.queueItem}>
              <Text>
                {req.reason} ({req.start_date} to {req.end_date})
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 80, backgroundColor: "#fff" },
  offlineBadge: {
    position: "absolute",
    top: 16,
    right: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#f44336",
    borderRadius: 12,
    zIndex: 99,
  },
  offlineText: { color: "#fff", fontSize: 12 },
  form: { marginBottom: 24 },
  input: {
    height: 44,
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  daysNote: { color: "#374151", marginBottom: 8 },
  button: {
    backgroundColor: "#007bff",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "bold" },
  leaveItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  queue: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
  },
  queueTitle: { fontWeight: "bold", marginBottom: 6 },
  queueItem: { paddingVertical: 4 },
});

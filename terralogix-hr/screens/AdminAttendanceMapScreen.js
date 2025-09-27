// screens/AdminAttendanceMapScreen.js
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { fetchAllAttendanceLocations } from "../api";
import { useAuth } from "../AuthContext";

export default function AdminAttendanceMapScreen({ navigation }) {
  const { isStaff } = useAuth();
  const mapRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [filterUser, setFilterUser] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Load
  const load = useCallback(async () => {
    try {
      const data = await fetchAllAttendanceLocations(); // expected array of { id, user_name, date, latitude, longitude, time_in, time_out }
      setRecords(Array.isArray(data) ? data : []);
    } catch (e) {
      Alert.alert("Error", e?.message || "Failed to load attendance locations.");
    }
  }, []);

  useEffect(() => {
    if (!isStaff) {
      navigation.replace("Dashboard");
      return;
    }
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [isStaff, navigation, load]);

  // Distinct lists (sorted)
  const users = useMemo(() => {
    const set = new Set(records.map((r) => r.user_name).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [records]);

  const dates = useMemo(() => {
    const set = new Set(records.map((r) => r.date).filter(Boolean));
    // Sort desc (latest first)
    return Array.from(set).sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  }, [records]);

  // Filtered data
  const filtered = useMemo(
    () =>
      records.filter(
        (r) =>
          (!filterUser || r.user_name === filterUser) &&
          (!filterDate || r.date === filterDate) &&
          typeof r.latitude === "number" &&
          typeof r.longitude === "number"
      ),
    [records, filterUser, filterDate]
  );

  // Initial region (Davao fallback)
  const initialRegion = useMemo(
    () => ({
      latitude: filtered[0]?.latitude ?? 7.0717,
      longitude: filtered[0]?.longitude ?? 125.6017,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    }),
    [filtered]
  );

  // Fit map to markers any time filtered changes
  useEffect(() => {
    if (!mapRef.current) return;
    if (filtered.length === 0) return;
    const coords = filtered
      .filter((r) => isFinite(r.latitude) && isFinite(r.longitude))
      .map((r) => ({ latitude: r.latitude, longitude: r.longitude }));
    if (coords.length === 0) return;

    // Slight delay ensures map has measured
    const timeout = setTimeout(() => {
      try {
        mapRef.current?.fitToCoordinates(coords, {
          edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
          animated: true,
        });
      } catch {}
    }, 200);
    return () => clearTimeout(timeout);
  }, [filtered]);

  const cycleUser = () => {
    if (users.length === 0) return;
    if (!filterUser) {
      setFilterUser(users[0]);
      return;
    }
    const idx = users.indexOf(filterUser);
    setFilterUser(idx >= 0 && idx < users.length - 1 ? users[idx + 1] : "");
  };

  const cycleDate = () => {
    if (dates.length === 0) return;
    if (!filterDate) {
      setFilterDate(dates[0]);
      return;
    }
    const idx = dates.indexOf(filterDate);
    setFilterDate(idx >= 0 && idx < dates.length - 1 ? dates[idx + 1] : "");
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const fitToMarkers = () => {
    if (!mapRef.current || filtered.length === 0) return;
    const coords = filtered.map((r) => ({ latitude: r.latitude, longitude: r.longitude }));
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
      animated: true,
    });
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Filters */}
      <View style={styles.filterBar}>
        <View style={styles.filterGroup}>
          <Text style={styles.label}>User</Text>
          <TouchableOpacity style={styles.filterBtn} onPress={cycleUser}>
            <Text style={styles.filterValue}>{filterUser || "All"}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.filterGroup}>
          <Text style={styles.label}>Date</Text>
          <TouchableOpacity style={styles.filterBtn} onPress={cycleDate}>
            <Text style={styles.filterValue}>{filterDate || "All"}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.actionBtn]} onPress={onRefresh} disabled={refreshing}>
          <Text style={styles.actionText}>{refreshing ? "Refreshing…" : "Refresh"}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#00BFFF" size="large" style={{ flex: 1 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text>No check-ins to display.</Text>
          <Text style={{ color: "#666", marginTop: 6 }}>
            Try changing the filters or refreshing.
          </Text>
        </View>
      ) : (
        <>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={initialRegion}
            showsUserLocation={false}
            toolbarEnabled
          >
            {filtered.map((rec, idx) => (
              <Marker
                key={rec.id ?? `${rec.user_name}-${rec.date}-${idx}`}
                coordinate={{ latitude: rec.latitude, longitude: rec.longitude }}
                title={`${rec.user_name || "User"} — ${rec.date || ""}`}
                description={`Time In: ${rec.time_in || "--"}${rec.time_out ? ` | Time Out: ${rec.time_out}` : ""}`}
                pinColor="#eb4d4b"
              />
            ))}
          </MapView>

          {/* Floating "Fit" button */}
          <TouchableOpacity style={styles.fab} onPress={fitToMarkers}>
            <Text style={styles.fabText}>Fit</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height,
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    backgroundColor: "#fff",
    justifyContent: "space-between",
    zIndex: 99,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  filterGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { color: "#374151", marginRight: 4, fontWeight: "600" },
  filterBtn: {
    backgroundColor: "#f5f6fa",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  filterValue: { color: "#00BFFF", fontWeight: "bold" },
  actionBtn: {
    backgroundColor: "#0ea5e9",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  actionText: { color: "#fff", fontWeight: "700" },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 32,
    backgroundColor: "#111827",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    elevation: 3,
  },
  fabText: { color: "#fff", fontWeight: "700" },
});
// screens/DashboardScreen.js
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getEmployees, fetchAttendance, fetchPHHolidays } from "../api";

const CACHE_USER = "dash:user:v1";
const CACHE_ATT = "dash:attendance:v1";
const CACHE_HOLS = "dash:holidays:v1";
const DATE_FMT_LOCALE = "en-PH";

export default function DashboardScreen() {
  const [user, setUser] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [offline, setOffline] = useState(false);

  const [loadingDash, setLoadingDash] = useState(true);
  const [loadingHolidays, setLoadingHolidays] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const announcements = useMemo(
    () => [
      "HR Meeting at 3PM today",
      "Submit leave forms by Friday",
      "Holiday on June 12 (Independence Day)",
    ],
    []
  );

  // Monitor online/offline status with reachability
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const reachable =
        state.isConnected === true &&
        (state.isInternetReachable === null ? true : state.isInternetReachable);
      setOffline(!reachable);
    });
    return () => unsub();
  }, []);

  // ---- Load dashboard (employees + attendance) with cache fallback ----
  const loadDashboard = useCallback(
    async (notify = false) => {
      setLoadingDash(true);
      try {
        const employees = await getEmployees();
        const primary = Array.isArray(employees) ? employees[0] : null;
        setUser(primary || null);
        await AsyncStorage.setItem(CACHE_USER, JSON.stringify(primary || null));

        const attendance = await fetchAttendance();
        const list = Array.isArray(attendance) ? attendance : [];
        setAttendanceHistory(list);
        await AsyncStorage.setItem(CACHE_ATT, JSON.stringify(list));

        setLastUpdated(new Date());
        if (notify) Alert.alert("Success", "Data refreshed from server!");
      } catch (err) {
        setOffline(true);
        const cachedUser = await AsyncStorage.getItem(CACHE_USER);
        if (cachedUser) setUser(JSON.parse(cachedUser));
        const cachedAttendance = await AsyncStorage.getItem(CACHE_ATT);
        if (cachedAttendance) setAttendanceHistory(JSON.parse(cachedAttendance));
        if (notify) Alert.alert("Offline", "Showing last available dashboard data.");
      } finally {
        setLoadingDash(false);
      }
    },
    []
  );

  // ---- Load PH holidays (public only) with cache fallback ----
  const loadHolidays = useCallback(async () => {
    setLoadingHolidays(true);
    try {
      const data = await fetchPHHolidays();
      const filtered = (Array.isArray(data) ? data : []).filter((h) =>
        Array.isArray(h.types) ? h.types.includes("Public") : false
      );
      setHolidays(filtered);
      await AsyncStorage.setItem(CACHE_HOLS, JSON.stringify(filtered));
    } catch (err) {
      setOffline(true);
      const cached = await AsyncStorage.getItem(CACHE_HOLS);
      if (cached) setHolidays(JSON.parse(cached));
    } finally {
      setLoadingHolidays(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadDashboard();
    loadHolidays();
  }, [loadDashboard, loadHolidays]);

  // Pull-to-refresh both sections
  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard(true);
    await loadHolidays();
    setRefreshing(false);
  };

  // ---- Helpers ----
  const initials = (name) =>
    (name || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "U";

  const todayISO = new Date().toLocaleDateString("en-CA");
  const nextHoliday = useMemo(() => {
    const today = new Date(todayISO);
    const upcoming = holidays
      .map((h) => ({ ...h, _date: new Date(h.date) }))
      .filter((h) => !isNaN(h._date) && h._date >= today)
      .sort((a, b) => a._date - b._date)[0];
    return upcoming || null;
  }, [holidays, todayISO]);

  const renderAttendanceItem = ({ item }) => (
    <View style={styles.attendanceRow}>
      <Text style={{ flex: 1 }}>
        {new Date(item.date).toLocaleDateString(DATE_FMT_LOCALE, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </Text>
      <Text style={{ flex: 1, color: "#0097CD" }}>In: {item.time_in || "--"}</Text>
      <Text style={{ flex: 1, color: "#C25501" }}>Out: {item.time_out || "--"}</Text>
    </View>
  );

  const renderHolidayItem = ({ item }) => (
    <View style={styles.holidayRow}>
      <Text style={{ flex: 1 }}>
        {new Date(item.date).toLocaleDateString(DATE_FMT_LOCALE, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </Text>
      <Text style={{ flex: 2 }}>{item.localName}</Text>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={["#00BFFF"]}
        />
      }
    >
      {/* OFFLINE BADGE */}
      {offline && (
        <View style={styles.offlineBadge}>
          <Text style={{ color: "#fff", fontSize: 12 }}>Offline Mode</Text>
        </View>
      )}

      {/* Profile */}
      <View style={styles.profileContainer}>
        {user?.photo ? (
          <Image source={{ uri: user.photo }} style={styles.profilePhoto} />
        ) : (
          <View style={[styles.profilePhoto, styles.initialsAvatar]}>
            <Text style={{ color: "#0ea5e9", fontWeight: "800" }}>
              {initials(user?.full_name)}
            </Text>
          </View>
        )}
        <Text style={styles.profileName}>{user?.full_name || "—"}</Text>
        {lastUpdated && (
          <Text style={styles.lastUpdated}>
            Updated {lastUpdated.toLocaleString()}
          </Text>
        )}
      </View>

      {/* Announcements */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📢 Announcements</Text>
        {announcements.map((msg, idx) => (
          <Text style={styles.announcement} key={idx}>
            • {msg}
          </Text>
        ))}
      </View>

      {/* Upcoming Holiday (highlight) */}
      {nextHoliday && (
        <View style={[styles.card, styles.nextHoliday]}>
          <Text style={[styles.cardTitle, { color: "#065f46" }]}>🎉 Next Holiday</Text>
          <Text style={{ fontWeight: "700", marginBottom: 4 }}>
            {new Date(nextHoliday.date).toLocaleDateString(DATE_FMT_LOCALE, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </Text>
          <Text style={{ color: "#065f46" }}>{nextHoliday.localName}</Text>
        </View>
      )}

      {/* Holidays list */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          🇵🇭 Non-working Holidays {new Date().getFullYear()}
        </Text>
        {loadingHolidays ? (
          <ActivityIndicator color="#00BFFF" />
        ) : holidays.length === 0 ? (
          <Text style={styles.emptyText}>No data.</Text>
        ) : (
          <FlatList
            data={holidays}
            keyExtractor={(item) => item.date}
            renderItem={renderHolidayItem}
            style={{ marginTop: 4, marginBottom: 4 }}
            scrollEnabled={false}
          />
        )}
      </View>

      {/* Attendance History */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🗓️ Attendance History</Text>
        {loadingDash ? (
          <ActivityIndicator color="#00BFFF" style={{ marginVertical: 16 }} />
        ) : (
          <FlatList
            data={attendanceHistory}
            keyExtractor={(item) => item.id?.toString() || item.date}
            renderItem={renderAttendanceItem}
            ListEmptyComponent={<Text style={styles.emptyText}>No attendance records yet.</Text>}
            scrollEnabled={false}
            style={{ marginTop: 4 }}
          />
        )}
      </View>

      {/* Tagline */}
      <Text style={styles.tagline}>© 2024 Terralogix. All Rights Reserved.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F8FB", padding: 16 },
  offlineBadge: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: "#e67e22",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 99,
  },

  profileContainer: { alignItems: "center", marginBottom: 16 },
  profilePhoto: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 8,
    backgroundColor: "#eaeaea",
  },
  initialsAvatar: {
    backgroundColor: "#ecfeff",
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: { fontSize: 19, fontWeight: "bold", color: "#00BFFF" },
  lastUpdated: { marginTop: 4, color: "#6b7280", fontSize: 12 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  nextHoliday: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderWidth: 1,
  },
  cardTitle: { fontWeight: "bold", fontSize: 16, marginBottom: 8, color: "#00BFFF" },
  announcement: { fontSize: 14, color: "#333", marginBottom: 2 },

  attendanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  holidayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
  },
  emptyText: { color: "#999", textAlign: "center", fontStyle: "italic", marginVertical: 8 },

  tagline: {
    color: "#888",
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 4,
  },
});

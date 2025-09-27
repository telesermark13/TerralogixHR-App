// screens/AdminDashboardScreen.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
} from "react-native";
import { BarChart, PieChart, LineChart } from "react-native-chart-kit";
import {
  fetchDashboardStats,
  fetchAllEmployees,
  fetchAllLeaves,
  decideLeave,
  fetchAttendanceTrend,
  exportAttendanceFile,
  sharePayslipFile,
} from "../api";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useAuth } from "../AuthContext";

export default function AdminDashboardScreen({ navigation }) {
  const { isStaff } = useAuth();
  const [stats, setStats] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [attendanceTrend, setAttendanceTrend] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState({});

  const screenWidth = Dimensions.get("window").width;

  const chartConfig = {
    backgroundGradientFrom: "#fff",
    backgroundGradientTo: "#fff",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    style: { borderRadius: 16 },
    propsForDots: { r: "6", strokeWidth: "2", stroke: "#ffa726" },
  };

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [statsRes, empRes, leaveRes, trendRes] = await Promise.all([
        fetchDashboardStats(),
        fetchAllEmployees(),
        fetchAllLeaves(),
        fetchAttendanceTrend(), // expects { dates: [], counts: [] }
      ]);

      setStats(statsRes);
      setEmployees(Array.isArray(empRes) ? empRes : []);
      setLeaves(Array.isArray(leaveRes) ? leaveRes : []);
      setAttendanceTrend(trendRes || {});
    } catch (e) {
      Alert.alert("Error", e?.message || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isStaff) {
      navigation.replace("Dashboard");
      return;
    }
    loadData();
  }, [isStaff, navigation]);

  const handleDecideLeave = async (leaveId, status) => {
    setActionLoading((l) => ({ ...l, [leaveId]: true }));
    try {
      await decideLeave(leaveId, status);
      Alert.alert("Success", `Leave ${status}`);
      await loadData(true);
    } catch (e) {
      Alert.alert("Error", e?.message || "Failed to process leave request.");
    } finally {
      setActionLoading((l) => ({ ...l, [leaveId]: false }));
    }
  };

  async function shareAttendanceFile(type = "csv") {
    try {
      const blob = await exportAttendanceFile(type);
      const ext = type === "excel" ? "xlsx" : "csv";
      const fileUri = `${FileSystem.cacheDirectory}attendance_export.${ext}`;

      // If your export API returns binary, adapt to saving bytes instead of text
      const text = await blob.text();
      await FileSystem.writeAsStringAsync(fileUri, text, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      await Sharing.shareAsync(fileUri, {
        mimeType:
          type === "excel"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "text/csv",
        UTI: type === "excel" ? "com.microsoft.excel.xlsx" : "public.comma-separated-values-text", // iOS hint
      });
    } catch (err) {
      Alert.alert("Export Failed", err?.message || "Unable to export file.");
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00BFFF" />
      </View>
    );
  }

  // Charts data
  const barData = {
    labels: ["Employees", "Attendance", "Pending Leaves"],
    datasets: [
      {
        data: [
          stats?.total_employees || 0,
          stats?.today_attendance || 0,
          stats?.pending_leaves || 0,
        ],
      },
    ],
  };

  const pieData = [
    {
      name: "Employees",
      count: stats?.total_employees || 0,
      color: "#4e73df",
      legendFontColor: "#333",
      legendFontSize: 14,
    },
    {
      name: "Attendance",
      count: stats?.today_attendance || 0,
      color: "#1cc88a",
      legendFontColor: "#333",
      legendFontSize: 14,
    },
    {
      name: "Pending Leaves",
      count: stats?.pending_leaves || 0,
      color: "#f6c23e",
      legendFontColor: "#333",
      legendFontSize: 14,
    },
  ];

  const trendData =
    attendanceTrend &&
    Array.isArray(attendanceTrend.dates) &&
    Array.isArray(attendanceTrend.counts)
      ? {
          labels: attendanceTrend.dates,
          datasets: [{ data: attendanceTrend.counts }],
        }
      : null;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />
      }
    >
      <Text style={styles.header}>Admin Dashboard</Text>

      <View style={styles.statsRow}>
        <View style={styles.statsBox}>
          <Text style={styles.statsNum}>{stats?.total_employees ?? 0}</Text>
          <Text style={styles.statsLabel}>Employees</Text>
        </View>
        <View style={styles.statsBox}>
          <Text style={styles.statsNum}>{stats?.today_attendance ?? 0}</Text>
          <Text style={styles.statsLabel}>Today's Attendance</Text>
        </View>
        <View style={styles.statsBox}>
          <Text style={styles.statsNum}>{stats?.pending_leaves ?? 0}</Text>
          <Text style={styles.statsLabel}>Pending Leaves</Text>
        </View>
      </View>

      {/* Navigation to Attendance Map */}
      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: "#00BFFF" }]}
        onPress={() => navigation.navigate("AdminAttendanceMap")}
      >
        <Text style={styles.actionBtnText}>View All Check-ins on Map</Text>
      </TouchableOpacity>

      {/* Exports */}
      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: "#11c46c" }]}
        onPress={() => shareAttendanceFile("csv")}
      >
        <Text style={styles.actionBtnText}>Export Attendance as CSV</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: "#f6c23e" }]}
        onPress={() => shareAttendanceFile("excel")}
      >
        <Text style={styles.actionBtnText}>Export Attendance as Excel</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: "#007AFF" }]}
        onPress={async () => {
          try {
            await sharePayslipFile("csv");
          } catch (e) {
            Alert.alert("Export Failed", e?.message || "Unable to export payslips.");
          }
        }}
      >
        <Text style={styles.actionBtnText}>Export Payslips as CSV</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: "#8e44ad" }]}
        onPress={async () => {
          try {
            await sharePayslipFile("excel");
          } catch (e) {
            Alert.alert("Export Failed", e?.message || "Unable to export payslips.");
          }
        }}
      >
        <Text style={styles.actionBtnText}>Export Payslips as Excel</Text>
      </TouchableOpacity>

      {/* Analytics */}
      <Text style={styles.analyticsHeader}>Analytics</Text>
      <BarChart
        data={barData}
        width={screenWidth - 40}
        height={220}
        yAxisLabel=""
        chartConfig={chartConfig}
        style={styles.chart}
      />
      <PieChart
        data={pieData}
        width={screenWidth - 40}
        height={200}
        chartConfig={chartConfig}
        accessor={"count"}
        backgroundColor={"transparent"}
        paddingLeft={"15"}
        style={styles.chart}
      />

      {trendData && trendData.datasets[0].data.length > 0 ? (
        <>
          <Text style={styles.trendHeader}>Attendance Trend (7 days)</Text>
          <LineChart
            data={trendData}
            width={screenWidth - 40}
            height={220}
            chartConfig={chartConfig}
            style={styles.chart}
          />
        </>
      ) : (
        <Text style={styles.trendEmpty}>No attendance trend data available.</Text>
      )}

      {/* Employees */}
      <Text style={styles.sectionTitle}>Employees</Text>
      <View style={styles.card}>
        {employees.length === 0 ? (
          <Text>No employees found.</Text>
        ) : (
          employees.map((emp) => (
            <View key={emp.id} style={styles.row}>
              <Text>
                {emp.full_name} ({emp.position})
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Leave Requests */}
      <Text style={styles.sectionTitle}>Leave Requests</Text>
      <View style={styles.card}>
        {leaves.length === 0 ? (
          <Text>No leave requests.</Text>
        ) : (
          leaves.map((lv) => (
            <View key={lv.id} style={[styles.row, styles.leaveRow]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.leaveName}>{lv.employee.full_name}</Text>
                <Text>Status: {lv.status}</Text>
                <Text>
                  Date: {lv.start_date} to {lv.end_date}
                </Text>
                <Text>Reason: {lv.reason}</Text>
              </View>
              {lv.status === "Pending" && (
                <View style={styles.actionCol}>
                  <TouchableOpacity
                    style={[styles.smallBtn, styles.approve]}
                    onPress={() => handleDecideLeave(lv.id, "Approved")}
                    disabled={!!actionLoading[lv.id]}
                  >
                    <Text style={styles.smallBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallBtn, styles.reject]}
                    onPress={() => handleDecideLeave(lv.id, "Rejected")}
                    disabled={!!actionLoading[lv.id]}
                  >
                    <Text style={styles.smallBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </View>

      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: "#00BFFF", marginTop: 12 }]}
        onPress={() => loadData(true)}
      >
        <Text style={styles.actionBtnText}>
          {refreshing ? "Refreshing..." : "Reload"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#f5f6fa" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#00BFFF",
    textAlign: "center",
  },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  statsBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    flex: 1,
    marginHorizontal: 5,
    alignItems: "center",
    elevation: 2,
  },
  statsNum: { fontSize: 22, fontWeight: "bold", color: "#222" },
  statsLabel: { fontSize: 14, color: "#666" },

  analyticsHeader: { fontSize: 20, fontWeight: "bold", marginVertical: 10 },
  chart: { marginVertical: 10, borderRadius: 16, alignSelf: "center" },
  trendHeader: { fontSize: 18, fontWeight: "bold", marginVertical: 10 },
  trendEmpty: { color: "#666", textAlign: "center", marginVertical: 10 },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 28,
    marginBottom: 10,
    color: "#00BFFF",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    elevation: 2,
    marginBottom: 10,
  },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  leaveRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    paddingBottom: 8,
  },
  leaveName: { fontWeight: "bold", fontSize: 16 },

  // small action buttons (approve/reject)
  actionCol: { justifyContent: "center" },
  smallBtn: {
    marginVertical: 2,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    minWidth: 90,
    alignItems: "center",
  },
  smallBtnText: { color: "#fff", fontWeight: "bold" },
  approve: { backgroundColor: "#11c46c" },
  reject: { backgroundColor: "#eb4d4b" },

  // large action buttons (map/exports/reload)
  actionBtn: {
    marginBottom: 16,
    backgroundColor: "#00BFFF",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  actionBtnText: { color: "#fff", fontWeight: "bold" },
});
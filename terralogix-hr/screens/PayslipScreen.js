// screens/PayslipScreen.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRoute } from "@react-navigation/native";
import { getPayslipById, savePayslipCache, getPayslipCache, BASE_URL } from "../api";

const peso = (n) => {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 2,
    }).format(Number(n || 0));
  } catch {
    const num = Number(n || 0);
    return `₱${num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  }
};

export default function PayslipScreen() {
  const route = useRoute();
  const payslipId = route.params?.payslipId;

  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [payslip, setPayslip] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Fetch payslip: online → cache, fallback to cache
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const data = await getPayslipById(payslipId);
        if (!mounted) return;
        setPayslip(data);
        await savePayslipCache(data);
        setOffline(false);
      } catch (e) {
        const cached = await getPayslipCache(payslipId);
        if (!mounted) return;
        if (cached) {
          setPayslip(cached);
          setOffline(true);
        } else {
          setPayslip(null);
          setOffline(true);
          Alert.alert("Error", "No payslip data found online or offline.");
        }
      } finally {
        mounted && setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [payslipId]);

  const earnings = useMemo(() => Array.isArray(payslip?.earnings) ? payslip.earnings : [], [payslip]);
  const deductions = useMemo(() => Array.isArray(payslip?.deductions) ? payslip.deductions : [], [payslip]);

  const totalEarnings = useMemo(
    () => earnings.reduce((sum, e) => sum + Number(e?.value || 0), 0),
    [earnings]
  );
  const totalDeductions = useMemo(
    () => deductions.reduce((sum, d) => sum + Number(d?.value || 0), 0),
    [deductions]
  );
  const netPay = totalEarnings - totalDeductions;

  const html = useMemo(
    () => `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Payslip</title>
  <style>
    body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:#111; padding:24px; }
    h1 { margin:0 0 4px; color:#0ea5e9; }
    h2 { margin:16px 0 8px; }
    .muted { color:#6b7280; }
    .card { border:1px solid #e5e7eb; border-radius:12px; padding:12px; margin:10px 0; }
    table { width:100%; border-collapse:collapse; }
    th, td { padding:8px 10px; border-bottom:1px solid #f1f5f9; text-align:left; }
    th { background:#f8fafc; color:#334155; font-weight:600; }
    .right { text-align:right; }
    .total { font-weight:700; }
    .net { font-size:18px; font-weight:800; color:#059669; }
    .footer { color: #6b7280; font-size:12px; margin-top:24px; }
  </style>
</head>
<body>
  <h1>Payslip</h1>
  <div class="muted">Period: ${payslip?.period ?? "-"}</div>
  <div class="muted">Name: ${payslip?.name ?? "-"}</div>
  <div class="muted">Position: ${payslip?.position ?? "-"}</div>

  <div class="card">
    <h2>Earnings</h2>
    <table>
      <thead><tr><th>Description</th><th class="right">Amount</th></tr></thead>
      <tbody>
        ${
          earnings.length
            ? earnings
                .map(
                  (e) =>
                    `<tr><td>${e?.label ?? "-"}</td><td class="right">${peso(e?.value)}</td></tr>`
                )
                .join("")
            : `<tr><td class="muted">No earnings</td><td></td></tr>`
        }
        <tr>
          <td class="total">Total Earnings</td>
          <td class="right total">${peso(totalEarnings)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="card">
    <h2>Deductions</h2>
    <table>
      <thead><tr><th>Description</th><th class="right">Amount</th></tr></thead>
      <tbody>
        ${
          deductions.length
            ? deductions
                .map(
                  (d) =>
                    `<tr><td>${d?.label ?? "-"}</td><td class="right">${peso(d?.value)}</td></tr>`
                )
                .join("")
            : `<tr><td class="muted">No deductions</td><td></td></tr>`
        }
        <tr>
          <td class="total">Total Deductions</td>
          <td class="right total">${peso(totalDeductions)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="card">
    <table>
      <tbody>
        <tr>
          <td class="net">Net Pay</td>
          <td class="right net">${peso(netPay)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="footer">Generated by Terralogix</div>
</body>
</html>`,
    [payslip, earnings, deductions, totalEarnings, totalDeductions, netPay]
  );

  const handleExportPDF = useCallback(async () => {
    setExporting(true);
    try {
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, { mimeType: "application/pdf" });
    } catch (e) {
      Alert.alert("Export failed", e?.message || "PDF export failed.");
    } finally {
      setExporting(false);
    }
  }, [html]);

  // Optional: Download server-generated official PDF (requires auth token)
  const handleDownloadOfficial = useCallback(async () => {
    setDownloading(true);
    try {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) throw new Error("Not authenticated.");

      // Your Django URL pattern includes: /admin/payslips/<int:payslip_id>/pdf/
      const url = `${BASE_URL}admin/payslips/${payslipId}/pdf/`;

      const fileUri = FileSystem.cacheDirectory + `payslip_${payslipId}.pdf`;
      const res = await FileSystem.downloadAsync(url, fileUri, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status !== 200) {
        throw new Error(`Download failed (HTTP ${res.status}).`);
      }

      await Sharing.shareAsync(res.uri, { mimeType: "application/pdf" });
    } catch (e) {
      Alert.alert("Download failed", e?.message || "Could not download the official PDF.");
    } finally {
      setDownloading(false);
    }
  }, [payslipId]);

  if (loading || !payslip) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color="#00BFFF" size="large" />
        <Text style={{ marginTop: 12 }}>{offline ? "Offline" : "Loading"}...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {offline && <Text style={{ color: "orange", marginBottom: 8 }}>Offline – cached payslip</Text>}

      <Text style={styles.header}>Payslip</Text>
      <Text style={styles.period}>{payslip.period ?? "-"}</Text>
      <Text style={styles.name}>
        {payslip.name ?? "—"} {payslip.position ? `– ${payslip.position}` : ""}
      </Text>

      {/* Earnings */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Earnings</Text>
        {earnings.length ? (
          earnings.map((item, idx) => (
            <View key={`e-${idx}`} style={styles.row}>
              <Text style={styles.label}>{item?.label ?? "-"}</Text>
              <Text style={styles.value}>{peso(item?.value)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.empty}>No earnings</Text>
        )}
        <View style={styles.row}>
          <Text style={[styles.label, { fontWeight: "bold" }]}>Total Earnings</Text>
          <Text style={[styles.value, { fontWeight: "bold" }]}>{peso(totalEarnings)}</Text>
        </View>
      </View>

      {/* Deductions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Deductions</Text>
        {deductions.length ? (
          deductions.map((item, idx) => (
            <View key={`d-${idx}`} style={styles.row}>
              <Text style={styles.label}>{item?.label ?? "-"}</Text>
              <Text style={styles.value}>{peso(item?.value)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.empty}>No deductions</Text>
        )}
        <View style={styles.row}>
          <Text style={[styles.label, { fontWeight: "bold" }]}>Total Deductions</Text>
          <Text style={[styles.value, { fontWeight: "bold" }]}>{peso(totalDeductions)}</Text>
        </View>
      </View>

      {/* Net Pay */}
      <View style={styles.netPayCard}>
        <Text style={styles.netPayLabel}>Net Pay</Text>
        <Text style={styles.netPayValue}>{peso(netPay)}</Text>
      </View>

      {/* Actions */}
      <TouchableOpacity
        style={[styles.btn, styles.primary, exporting && styles.btnDisabled]}
        onPress={handleExportPDF}
        disabled={exporting}
      >
        {exporting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Export PDF / Share</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, styles.secondary, downloading && styles.btnDisabled]}
        onPress={handleDownloadOfficial}
        disabled={downloading}
      >
        {downloading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Download Official PDF</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: "#F4F8FB", padding: 16 },
  header: { fontSize: 22, fontWeight: "bold", color: "#00BFFF", marginBottom: 4, textAlign: "center" },
  period: { color: "#222", marginBottom: 4, textAlign: "center" },
  name: { color: "#666", marginBottom: 16, textAlign: "center" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    elevation: 1,
  },
  cardTitle: { fontWeight: "bold", fontSize: 15, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", marginVertical: 2 },
  label: { color: "#222", fontSize: 15 },
  value: { color: "#00BFFF", fontWeight: "bold" },
  empty: { color: "#6b7280", fontStyle: "italic", marginBottom: 4 },

  netPayCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    elevation: 1,
    marginTop: 16,
  },
  netPayLabel: { color: "#222", fontWeight: "bold", fontSize: 16 },
  netPayValue: { color: "#088e50", fontWeight: "bold", fontSize: 22, marginTop: 4 },

  btn: {
    marginTop: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    height: 48,
  },
  primary: { backgroundColor: "#00BFFF" },
  secondary: { backgroundColor: "#111827" },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  btnDisabled: { opacity: 0.7 },
});

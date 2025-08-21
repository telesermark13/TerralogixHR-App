// screens/PayslipListScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import { getPayslips } from "../api";

const CACHE_KEY = "pay:cache:v1";

export default function PayslipListScreen() {
  const navigation = useNavigation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true); // initial
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchingRef = useRef(false);

  const normalize = (data) => {
    if (Array.isArray(data)) return { results: data, next: null };
    return { results: data?.results ?? [], next: data?.next ?? null };
    // If your API returns {count, next, previous, results}
  };

  const safePeso = (n) => {
    try {
      if (typeof Intl !== "undefined" && Intl.NumberFormat) {
        return new Intl.NumberFormat("en-PH", {
          style: "currency",
          currency: "PHP",
          maximumFractionDigits: 2,
        }).format(Number(n || 0));
      }
    } catch {}
    // Fallback
    const num = Number(n || 0);
    return `₱${num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  };

  // Try to parse period to a sortable date (supports "YYYY-MM", "YYYY-MM-DD", etc.)
  const periodKey = (p) => {
    if (!p) return 0;
    const s = String(p);
    const ymd = /^\d{4}-\d{2}(-\d{2})?$/;
    if (ymd.test(s)) return Date.parse(s.length === 7 ? `${s}-01` : s);
    // Fallback: try Date.parse or put at end
    const t = Date.parse(s);
    return isNaN(t) ? 0 : t;
  };

  const sortPayslips = useCallback((arr) => {
    return [...arr].sort((a, b) => periodKey(b.period) - periodKey(a.period));
  }, []);

  const loadFromServer = useCallback(
    async ({ reset = false, showAlert = false } = {}) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      if (reset) {
        setLoading(true);
        setPage(1);
        setHasNext(true);
      }

      try {
        const data = await getPayslips({ page: reset ? 1 : page });
        const { results, next } = normalize(data);

        if (reset) {
          const sorted = sortPayslips(results);
          setItems(sorted);
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(sorted));
        } else {
          setItems((prev) => {
            const merged = [...prev, ...results];
            // de-dupe by id if present
            const map = new Map();
            for (const it of merged) map.set(it.id ?? JSON.stringify(it), it);
            return sortPayslips(Array.from(map.values()));
          });
          // do not overwrite cache on incremental loads to avoid partial cache
        }

        setHasNext(Boolean(next));
        if (!reset) setPage((p) => p + 1);
        setOffline(false);
        setLastUpdated(new Date());
        if (showAlert) Alert.alert("Success", "Payslips updated!");
      } catch (err) {
        // Fallback to cache
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          setItems(JSON.parse(cached));
          setOffline(true);
          if (showAlert) Alert.alert("Offline", "Showing cached payslips.");
        } else {
          setItems([]);
          setOffline(true);
          if (showAlert) Alert.alert("Error", "No payslips found online or offline.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
        fetchingRef.current = false;
      }
    },
    [page, sortPayslips]
  );

  // Initial load
  useEffect(() => {
    loadFromServer({ reset: true });
  }, [loadFromServer]);

  // Auto-refresh when coming back online
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const reachable =
        state.isConnected === true &&
        (state.isInternetReachable === null ? true : state.isInternetReachable);
      setOffline(!reachable);
      if (reachable) {
        // Soft refresh from server
        loadFromServer({ reset: true });
      }
    });
    return () => unsub();
  }, [loadFromServer]);

  const onRefresh = () => {
    setRefreshing(true);
    loadFromServer({ reset: true, showAlert: true });
  };

  const loadMore = () => {
    if (loading || refreshing || fetchingRef.current || !hasNext) return;
    loadFromServer({ reset: false });
  };

  const keyExtractor = useCallback((item, idx) => String(item.id ?? idx), []);

  const renderItem = useCallback(
    ({ item }) => (
      <TouchableOpacity
        style={styles.item}
        onPress={() => navigation.navigate("PayslipScreen", { payslipId: item.id })}
      >
        <Text style={styles.period}>{item.period || "Period"}</Text>
        <Text style={styles.amount}>Net Pay: {safePeso(item.net_pay)}</Text>
      </TouchableOpacity>
    ),
    [navigation]
  );

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: "#F4F8FB" }}>
        <ActivityIndicator color="#00BFFF" size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#F4F8FB" }}>
      {offline && (
        <Text style={styles.offlineText}>Offline — showing last cached payslips</Text>
      )}
      {lastUpdated && (
        <Text style={styles.updatedText}>Last updated: {lastUpdated.toLocaleString()}</Text>
      )}
      <FlatList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        onEndReachedThreshold={0.25}
        onEndReached={loadMore}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#00BFFF"]} />
        }
        ListEmptyComponent={
          <Text style={{ textAlign: "center", color: "#999", marginTop: 20 }}>
            No payslips found.
          </Text>
        }
        ListFooterComponent={
          hasNext ? (
            <View style={{ paddingVertical: 14 }}>
              <ActivityIndicator color="#00BFFF" />
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingVertical: 4 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    padding: 16,
    backgroundColor: "#fff",
    marginHorizontal: 8,
    marginVertical: 6,
    borderRadius: 8,
    elevation: 1,
  },
  period: { fontWeight: "bold", fontSize: 16 },
  amount: { color: "#088e50", marginTop: 4 },
  offlineText: { textAlign: "center", color: "orange", marginTop: 8 },
  updatedText: { textAlign: "center", color: "#6b7280", marginVertical: 6, fontSize: 12 },
});

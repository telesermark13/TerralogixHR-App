// screens/AuditLogScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import axios from "axios";
import { useAuth } from "../AuthContext";
import { API_BASE_URL } from "../api";

export default function AuditLogScreen() {
  const { token } = useAuth();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);       // first load
  const [refreshing, setRefreshing] = useState(false); // pull-to-refresh
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(true);
  const [error, setError] = useState(null);

  // Search (debounced)
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""); // debounced value
  const debounceRef = useRef(null);

  // Cancel in-flight requests
  const cancelRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(search.trim()), 350);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [search]);

  const normalize = (data) => {
    if (Array.isArray(data)) return { results: data, next: null };
    return { results: data?.results ?? [], next: data?.next ?? null };
  };

  const client = useMemo(() => {
    const instance = axios.create({
      baseURL: API_BASE_URL,
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return instance;
  }, [token]);

  const formatTs = (ts) => {
    try {
      if (!ts) return "";
      const d = new Date(ts);
      if (isNaN(d.getTime())) return String(ts);
      return d.toLocaleString();
    } catch {
      return String(ts ?? "");
    }
  };

  const load = useCallback(
    async ({ reset = false } = {}) => {
      if (!token) return;

      if (reset) {
        setLoading(true);
        setPage(1);
        setError(null);
      }

      try {
        cancelRef.current?.cancel?.("New audit-logs request");
        cancelRef.current = axios.CancelToken.source();

        // If your API supports ?page & ?search, pass them. If not, backend will ignore.
        const res = await client.get("/audit-logs/", {
          params: { page: reset ? 1 : page, search: query || undefined },
          cancelToken: cancelRef.current.token,
        });

        const { results, next } = normalize(res.data);

        if (reset) {
          setItems(results);
        } else {
          // merge-dedupe by id if present, else append
          setItems((prev) => {
            if (results.every((r) => r.id == null)) return [...prev, ...results];
            const map = new Map(prev.map((x) => [x.id, x]));
            for (const r of results) map.set(r.id, r);
            return Array.from(map.values());
          });
        }
        setHasNext(Boolean(next));
        if (!reset) setPage((p) => p + 1);
      } catch (e) {
        if (!axios.isCancel(e)) {
          setError(e?.response?.data?.detail || e?.message || "Failed to load audit logs");
          if (reset) setItems([]);
        }
      } finally {
        if (reset) setLoading(false);
      }
    },
    [client, page, query, token]
  );

  // initial + when query changes
  useEffect(() => {
    load({ reset: true });
    return () => cancelRef.current?.cancel?.("AuditLogScreen unmount");
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load({ reset: true });
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const loadMore = useCallback(() => {
    if (loading || refreshing || !hasNext) return;
    load({ reset: false });
  }, [loading, refreshing, hasNext, load]);

  const keyExtractor = useCallback((item, idx) => {
    if (item.id != null) return String(item.id);
    // fallback key if API doesn't include IDs
    return `${item.timestamp || "ts"}-${item.user || "u"}-${item.action || "a"}-${idx}`;
    // or Math.random() but that breaks list virtualization
  }, []);

  const renderItem = useCallback(({ item }) => {
    return (
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTop}>
            <Text style={styles.user}>{item.user || "Unknown"}</Text>
            <Text> • </Text>
            <Text style={styles.action}>{item.action || "Action"}</Text>
          </Text>
          {!!item.detail && <Text style={styles.detail}>{item.detail}</Text>}
        </View>
        <Text style={styles.timestamp}>{formatTs(item.timestamp)}</Text>
      </View>
    );
  }, []);

  const ListEmpty = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.emptyWrap}>
          <ActivityIndicator color="#00BFFF" />
        </View>
      );
    }
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>
          {error ? "Couldn’t load logs" : "No audit logs"}
        </Text>
        {!!error && <Text style={styles.emptySub}>{error}</Text>}
        <TouchableOpacity style={styles.retryBtn} onPress={() => load({ reset: true })}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }, [loading, error, load]);

  const ListFooter = useMemo(
    () =>
      hasNext ? (
        <View style={{ paddingVertical: 16 }}>
          <ActivityIndicator color="#00BFFF" />
        </View>
      ) : null,
    [hasNext]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Audit Logs</Text>

      <TextInput
        style={styles.input}
        placeholder="Search by user, action, or detail…"
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        autoCapitalize="none"
      />

      <FlatList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={ListFooter}
        onEndReachedThreshold={0.2}
        onEndReached={loadMore}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#f7f8fa" },
  header: { fontWeight: "bold", fontSize: 22, marginBottom: 10 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dce1e6",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
  },

  row: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    elevation: 1,
  },
  rowTop: { fontSize: 14, marginBottom: 4 },
  user: { fontWeight: "700", color: "#111827" },
  action: { fontWeight: "600", color: "#2563eb" },
  detail: { color: "#374151", marginTop: 2 },
  timestamp: { color: "#6b7280", fontSize: 12 },

  emptyWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 36 },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: "#333" },
  emptySub: { color: "#666", marginTop: 4, textAlign: "center", paddingHorizontal: 16 },

  retryBtn: {
    marginTop: 12,
    backgroundColor: "#00BFFF",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: "#fff", fontWeight: "700" },
});
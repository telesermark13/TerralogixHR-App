// screens/AnnouncementsScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from "react-native";
import { getAnnouncements } from "../api";

export default function AnnouncementsScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);       // initial load
  const [refreshing, setRefreshing] = useState(false); // pull-to-refresh
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(true);
  const [error, setError] = useState(null);

  // Normalize API: support DRF pagination or array
  const normalize = (data) => {
    if (Array.isArray(data)) return { results: data, next: null };
    return { results: data?.results ?? [], next: data?.next ?? null };
  };

  const formatWhen = (dt) => {
    try {
      if (!dt) return "";
      const d = new Date(dt);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleString();
    } catch {
      return "";
    }
  };

  const load = useCallback(
    async ({ reset = false } = {}) => {
      if (reset) {
        setLoading(true);
        setPage(1);
        setError(null);
      }
      try {
        const data = await getAnnouncements({ page: reset ? 1 : page });
        const { results, next } = normalize(data);

        if (reset) {
          setItems(results);
        } else {
          // merge + dedupe by id
          setItems((prev) => {
            const map = new Map(prev.map((x) => [x.id, x]));
            for (const r of results) map.set(r.id, r);
            return Array.from(map.values());
          });
        }
        setHasNext(Boolean(next));
        if (!reset) setPage((p) => p + 1);
      } catch (e) {
        setError(e?.message || "Failed to load announcements");
        if (reset) setItems([]);
      } finally {
        if (reset) setLoading(false);
      }
    },
    [page]
  );

  useEffect(() => {
    load({ reset: true });
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

  const keyExtractor = useCallback((item) => String(item.id), []);

  const ListEmpty = useMemo(
    () => (
      <View style={styles.emptyWrap}>
        {error ? (
          <>
            <Text style={styles.emptyTitle}>Couldn’t load announcements</Text>
            <Text style={styles.emptySub}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => load({ reset: true })}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </>
        ) : loading ? (
          <ActivityIndicator size="large" color="#00BFFF" />
        ) : (
          <>
            <Text style={styles.emptyTitle}>No announcements</Text>
            <Text style={styles.emptySub}>Please check back later.</Text>
          </>
        )}
      </View>
    ),
    [loading, error, load]
  );

  const renderItem = useCallback(
    ({ item }) => (
      <View style={styles.announcementBox}>
        <Text style={styles.title}>{item.title}</Text>
        {!!item.message && <Text>{item.message}</Text>}
        <Text style={styles.meta}>
          {(item.created_by?.username || "Admin") + (item.created_at ? " | " + formatWhen(item.created_at) : "")}
        </Text>
      </View>
    ),
    []
  );

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
      <Text style={styles.header}>Announcements</Text>

      <FlatList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={ListEmpty}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
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
  container: { flex: 1, padding: 18, backgroundColor: "#f7f8fa" },
  header: { fontSize: 22, fontWeight: "bold", marginBottom: 12 },
  announcementBox: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  title: { fontWeight: "bold", fontSize: 17, marginBottom: 6 },
  meta: { color: "#666", marginTop: 8, fontSize: 12 },

  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: "#333" },
  emptySub: { marginTop: 4, color: "#666", textAlign: "center", paddingHorizontal: 16 },

  retryBtn: {
    marginTop: 12,
    backgroundColor: "#00BFFF",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: "#fff", fontWeight: "700" },
});

// screens/AdminAnnouncementsScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Button,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from "../api";
import { useAuth } from "../AuthContext";

export default function AdminAnnouncementsScreen({ navigation }) {
  const { isStaff } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // create form
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  // edit form
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editMessage, setEditMessage] = useState("");

  // pagination + search
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(true);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState(""); // debounced

  const debounceTimer = useRef(null);

  // debounce search
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setSearch(query.trim()), 400);
    return () => debounceTimer.current && clearTimeout(debounceTimer.current);
  }, [query]);

  // initial + search change
  useEffect(() => {
    if (!isStaff) {
      navigation.replace("Dashboard");
      return;
    }
    load({ reset: true }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, isStaff, navigation]);

  const normalizeResponse = (data) => {
    // Supports DRF pagination {results, next} or plain array
    if (Array.isArray(data)) {
      return { results: data, next: null };
    }
    return {
      results: data?.results ?? [],
      next: data?.next ?? null,
    };
  };

  const load = useCallback(
    async ({ reset = false } = {}) => {
      if (reset) {
        setLoading(true);
        setPage(1);
      }
      try {
        const params = { page: reset ? 1 : page, search };
        const data = await getAnnouncements(params); // ok if ignored by API
        const { results, next } = normalizeResponse(data);

        if (reset) {
          setItems(results);
        } else {
          setItems((prev) => {
            // dedupe by id if any
            const map = new Map(prev.map((x) => [x.id, x]));
            results.forEach((r) => map.set(r.id, r));
            return Array.from(map.values());
          });
        }
        setHasNext(Boolean(next));
        if (!reset) setPage((p) => p + 1);
      } catch (e) {
        Alert.alert("Error", "Failed to load announcements");
      } finally {
        if (reset) setLoading(false);
      }
    },
    [page, search]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load({ reset: true });
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const loadMore = useCallback(() => {
    if (loading || saving || refreshing || !hasNext) return;
    load({ reset: false });
  }, [loading, saving, refreshing, hasNext, load]);

  async function handleCreate() {
    if (!title.trim() || !message.trim()) {
      Alert.alert("Required", "Please fill in title and message");
      return;
    }
    setSaving(true);
    try {
      await createAnnouncement({ title: title.trim(), message: message.trim() });
      setTitle("");
      setMessage("");
      await load({ reset: true });
      Alert.alert("Success", "Announcement created!");
    } catch {
      Alert.alert("Error", "Failed to create announcement");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditMessage(item.message);
  }

  async function handleEditSave(id) {
    if (!editTitle.trim() || !editMessage.trim()) {
      Alert.alert("Required", "Please fill in title and message");
      return;
    }
    setSaving(true);
    try {
      await updateAnnouncement(id, {
        title: editTitle.trim(),
        message: editMessage.trim(),
      });
      setEditingId(null);
      setEditTitle("");
      setEditMessage("");
      await load({ reset: true });
      Alert.alert("Success", "Announcement updated!");
    } catch {
      Alert.alert("Error", "Failed to update announcement");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    Alert.alert("Delete", "Delete this announcement?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            await deleteAnnouncement(id);
            await load({ reset: true });
          } catch {
            Alert.alert("Error", "Failed to delete announcement");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  const renderItem = useCallback(
    ({ item }) => (
      <View style={styles.announcementBox}>
        {editingId === item.id ? (
          <>
            <TextInput
              style={[styles.input, { marginBottom: 8 }]}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Title"
            />
            <TextInput
              style={[styles.input, { marginBottom: 8, height: 80 }]}
              value={editMessage}
              onChangeText={setEditMessage}
              placeholder="Message"
              multiline
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, saving && styles.btnDisabled]}
                onPress={() => handleEditSave(item.id)}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={styles.btnText}>Save</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnNeutral]}
                onPress={() => setEditingId(null)}
                disabled={saving}
              >
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title}>{item.title}</Text>
            {!!item.message && <Text style={styles.body}>{item.message}</Text>}
            <Text style={styles.meta}>
              {(item.created_by?.username || "Admin") +
                " | " +
                (item.created_at
                  ? new Date(item.created_at).toLocaleString()
                  : "")}
            </Text>
            <View style={{ flexDirection: "row", marginTop: 8, gap: 10 }}>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={() => startEdit(item)}
              >
                <Text style={styles.btnText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnDanger]}
                onPress={() => handleDelete(item.id)}
              >
                <Text style={styles.btnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    ),
    [editingId, editTitle, editMessage, saving]
  );

  const keyExtractor = useCallback((item) => String(item.id), []);

  const listEmpty = useMemo(
    () => (
      <View style={styles.emptyWrap}>
        {loading ? (
          <ActivityIndicator size="large" />
        ) : (
          <>
            <Text style={styles.emptyTitle}>No announcements</Text>
            {search ? (
              <Text style={styles.emptySub}>
                Try clearing or changing your search.
              </Text>
            ) : (
              <Text style={styles.emptySub}>
                Create one using the form above.
              </Text>
            )}
          </>
        )}
      </View>
    ),
    [loading, search]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Manage Announcements</Text>

      {/* Search */}
      <TextInput
        style={styles.input}
        placeholder="Search announcements…"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        autoCapitalize="none"
      />

      {/* Create */}
      <TextInput
        style={styles.input}
        placeholder="Announcement Title"
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={[styles.input, { height: 80 }]}
        placeholder="Message"
        value={message}
        onChangeText={setMessage}
        multiline
      />
      <Button
        title={saving ? "Saving..." : "Create Announcement"}
        onPress={handleCreate}
        disabled={saving}
      />

      {/* List */}
      <FlatList
        style={{ marginTop: 16 }}
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={listEmpty}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        onEndReachedThreshold={0.2}
        onEndReached={loadMore}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18, backgroundColor: "#f7f8fa" },
  header: { fontSize: 22, fontWeight: "bold", marginBottom: 12 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#dce1e6",
    marginBottom: 12,
    padding: 10,
    fontSize: 16,
  },
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
  body: { fontSize: 15, color: "#222" },
  meta: { color: "#666", marginTop: 8, fontSize: 12 },
  btn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 6,
  },
  btnText: { color: "#fff", fontWeight: "600" },
  btnPrimary: { backgroundColor: "#007aff" },
  btnDanger: { backgroundColor: "#ff3b30" },
  btnNeutral: { backgroundColor: "#8e8e93" },
  btnDisabled: { opacity: 0.6 },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: "#333" },
  emptySub: { marginTop: 4, color: "#666" },
});
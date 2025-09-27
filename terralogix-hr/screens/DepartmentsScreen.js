// screens/DepartmentsScreen.js
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import axios from "axios";
import { useAuth } from "../AuthContext";
import { API_BASE_URL } from "../api";

export default function DepartmentsScreen() {
  const { token } = useAuth();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // create form
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // edit state
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [rowBusy, setRowBusy] = useState({}); // { [id]: bool }

  const cancelRef = useRef(null);

  const client = useMemo(() => {
    const instance = axios.create({
      baseURL: API_BASE_URL,
      timeout: 15000,
      headers: { Authorization: `Bearer ${token}` },
    });
    return instance;
  }, [token]);

  const setBusy = (id, val) =>
    setRowBusy((m) => ({
      ...m,
      [id]: val,
    }));

  const load = useCallback(
    async (reset = true) => {
      if (reset) setLoading(true);
      try {
        cancelRef.current?.cancel?.("new departments request");
        cancelRef.current = axios.CancelToken.source();
        const res = await client.get("/departments/", {
          cancelToken: cancelRef.current.token,
        });
        const data = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
        setItems(data);
      } catch (e) {
        if (!axios.isCancel(e)) {
          Alert.alert(
            "Error",
            e?.response?.data?.detail || e?.message || "Failed to load departments."
          );
        }
      } finally {
        if (reset) setLoading(false);
        setRefreshing(false);
      }
    },
    [client]
  );

  useEffect(() => {
    load(true);
    return () => cancelRef.current?.cancel?.("unmount DepartmentsScreen");
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(false);
  };

  const resetCreateForm = () => {
    setName("");
    setDesc("");
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditName(item.name ?? "");
    setEditDesc(item.description ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditDesc("");
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert("Required", "Department name is required.");
      return;
    }
    setCreating(true);
    try {
      await client.post("/departments/", {
        name: name.trim(),
        description: desc.trim(),
      });
      resetCreateForm();
      await load(false);
      Alert.alert("Success", "Department created.");
    } catch (e) {
      Alert.alert(
        "Error",
        e?.response?.data?.detail ||
          e?.response?.data?.name?.[0] ||
          e?.message ||
          "Failed to create department."
      );
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (id) => {
    if (!editName.trim()) {
      Alert.alert("Required", "Department name is required.");
      return;
    }
    setBusy(id, true);
    try {
      // Prefer PATCH so other fields not wiped
      await client.patch(`/departments/${id}/`, {
        name: editName.trim(),
        description: editDesc.trim(),
      });
      cancelEdit();
      await load(false);
      Alert.alert("Success", "Department updated.");
    } catch (e) {
      Alert.alert(
        "Error",
        e?.response?.data?.detail ||
          e?.response?.data?.name?.[0] ||
          e?.message ||
          "Failed to update department."
      );
    } finally {
      setBusy(id, false);
    }
  };

  const handleDelete = async (id) => {
    Alert.alert("Delete", "Delete this department?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy(id, true);
          try {
            await client.delete(`/departments/${id}/`);
            if (editingId === id) cancelEdit();
            await load(false);
          } catch (e) {
            Alert.alert(
              "Error",
              e?.response?.data?.detail || e?.message || "Failed to delete department."
            );
          } finally {
            setBusy(id, false);
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }) => {
    const busy = !!rowBusy[item.id];

    if (editingId === item.id) {
      return (
        <View style={styles.item}>
          <Text style={styles.itemLabel}>Editing Department</Text>
          <TextInput
            style={styles.input}
            placeholder="Name"
            value={editName}
            onChangeText={setEditName}
          />
          <TextInput
            style={[styles.input, { height: 70 }]}
            placeholder="Description"
            value={editDesc}
            onChangeText={setEditDesc}
            multiline
          />
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btn, styles.primary, busy && styles.disabled]}
              onPress={() => handleSave(item.id)}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.neutral]} onPress={cancelEdit}>
              <Text style={styles.btnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.item}>
        <Text style={styles.itemTitle}>{item.name}</Text>
        {!!item.description && <Text style={styles.itemDesc}>{item.description}</Text>}
        <View style={styles.row}>
          <TouchableOpacity style={[styles.btn, styles.primary]} onPress={() => startEdit(item)}>
            <Text style={styles.btnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.danger, busy && styles.disabled]}
            onPress={() => handleDelete(item.id)}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Delete</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.header}>Departments</Text>

      {/* Create */}
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          placeholder="Department name"
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={[styles.input, { height: 70 }]}
          placeholder="Description (optional)"
          value={desc}
          onChangeText={setDesc}
          multiline
        />
        <TouchableOpacity
          style={[styles.btn, styles.primary, creating && styles.disabled]}
          onPress={handleCreate}
          disabled={creating}
        >
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Add Department</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* List */}
      <View style={styles.card}>
        {loading ? (
          <ActivityIndicator color="#00BFFF" />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(d) => String(d.id)}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListEmptyComponent={
              <Text style={{ textAlign: "center", color: "#6b7280" }}>
                No departments yet.
              </Text>
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, backgroundColor: "#f7f8fa" },
  header: { fontWeight: "bold", fontSize: 20, marginBottom: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    elevation: 1,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dce1e6",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 10,
  },
  item: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    elevation: 1,
  },
  itemTitle: { fontWeight: "700", fontSize: 16, color: "#111827" },
  itemDesc: { color: "#374151", marginTop: 4 },
  itemLabel: { fontWeight: "700", color: "#2563eb", marginBottom: 8 },

  row: { flexDirection: "row", gap: 10, marginTop: 8, flexWrap: "wrap" },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "700" },
  primary: { backgroundColor: "#00BFFF" },
  neutral: { backgroundColor: "#6b7280" },
  danger: { backgroundColor: "#ef4444" },
  disabled: { opacity: 0.6 },
});
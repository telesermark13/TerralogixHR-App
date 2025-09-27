// screens/AdminUserManagementScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Button,
  Alert,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import {
  fetchUsers,
  promoteUser,
  demoteUser,
  resetUserPassword,
} from "../api";
import { useAuth } from "../AuthContext";

export default function AdminUserManagementScreen({ navigation }) {
  const { isStaff } = useAuth();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""); // debounced
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Row states
  const [rowBusy, setRowBusy] = useState({}); // { [userId]: boolean }
  const [resetPwId, setResetPwId] = useState(null);
  const [resetPwVal, setResetPwVal] = useState("");
  const [resetPwVisible, setResetPwVisible] = useState(false);

  const debounceRef = useRef(null);

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(search.trim()), 350);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [search]);

  const loadUsers = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await fetchUsers(); // expects array [{id, username, email, is_staff, is_superuser}]
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      Alert.alert("Error", "Could not load users.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isStaff) {
      navigation.replace("Dashboard");
      return;
    }
    loadUsers();
  }, [isStaff, navigation, loadUsers]);

  // Filter + sort (by role then name)
  const filtered = useMemo(() => {
    const list = users.filter((u) => {
      const s = query.toLowerCase();
      return (
        u.username?.toLowerCase().includes(s) ||
        (u.email && u.email.toLowerCase().includes(s))
      );
    });
    return list.sort((a, b) => {
      const rank = (u) => (u.is_superuser ? 0 : u.is_staff ? 1 : 2);
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return (a.username || "").localeCompare(b.username || "");
    });
  }, [users, query]);

  const setBusy = (id, val) => setRowBusy((m) => ({ ...m, [id]: val }));

  const confirm = (title, message) =>
    new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "OK", onPress: () => resolve(true) },
      ]);
    });

  const handlePromote = async (userId) => {
    if (!(await confirm("Promote", "Make this user an admin?"))) return;
    setBusy(userId, true);
    try {
      await promoteUser(userId);
      await loadUsers(true);
    } catch {
      Alert.alert("Error", "Failed to promote user.");
    } finally {
      setBusy(userId, false);
    }
  };

  const handleDemote = async (userId) => {
    if (!(await confirm("Demote", "Remove this user's admin role?"))) return;
    setBusy(userId, true);
    try {
      await demoteUser(userId);
      await loadUsers(true);
    } catch {
      Alert.alert("Error", "Failed to demote user.");
    } finally {
      setBusy(userId, false);
    }
  };

  const handleResetPassword = async (userId) => {
    if (!resetPwVal || resetPwVal.length < 8) {
      Alert.alert("Invalid Password", "Please enter at least 8 characters.");
      return;
    }
    if (
      !(await confirm(
        "Reset Password",
        "Are you sure you want to reset this user's password?"
      ))
    )
      return;

    setBusy(userId, true);
    try {
      await resetUserPassword(userId, resetPwVal);
      setResetPwId(null);
      setResetPwVal("");
      setResetPwVisible(false);
      Alert.alert("Success", "Password has been reset.");
    } catch {
      Alert.alert("Error", "Failed to reset password.");
    } finally {
      setBusy(userId, false);
    }
  };

  const RoleBadge = ({ user }) => {
    const label = user.is_superuser
      ? "Superuser"
      : user.is_staff
      ? "Admin"
      : "Employee";
    const bg =
      user.is_superuser ? "#6d28d9" : user.is_staff ? "#0ea5e9" : "#6b7280";
    return (
      <View style={[styles.badge, { backgroundColor: bg }]}>
        <Text style={styles.badgeText}>{label}</Text>
      </View>
    );
  };

  const renderItem = ({ item }) => {
    const busy = !!rowBusy[item.id];

    return (
      <View style={styles.userBox}>
        <View style={styles.userHeader}>
          <Text style={styles.username}>{item.username}</Text>
          <RoleBadge user={item} />
        </View>
        {!!item.email && <Text style={styles.email}>{item.email}</Text>}

        <View style={styles.actionsRow}>
          {!item.is_superuser && (
            <>
              {item.is_staff ? (
                <TouchableOpacity
                  style={[styles.btn, styles.demote, busy && styles.btnDisabled]}
                  onPress={() => handleDemote(item.id)}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnText}>Demote</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.btn, styles.promote, busy && styles.btnDisabled]}
                  onPress={() => handlePromote(item.id)}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnText}>Promote</Text>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}

          <TouchableOpacity
            style={[styles.btn, styles.reset, busy && styles.btnDisabled]}
            onPress={() => {
              if (resetPwId === item.id) {
                setResetPwId(null);
                setResetPwVal("");
                setResetPwVisible(false);
              } else {
                setResetPwId(item.id);
                setResetPwVal("");
                setResetPwVisible(false);
              }
            }}
            disabled={busy}
          >
            <Text style={styles.btnText}>Reset Password</Text>
          </TouchableOpacity>
        </View>

        {resetPwId === item.id && (
          <View style={styles.resetWrap}>
            <TextInput
              style={styles.input}
              secureTextEntry={!resetPwVisible}
              placeholder="New Password (min 8 chars)"
              value={resetPwVal}
              onChangeText={setResetPwVal}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.resetRow}>
              <TouchableOpacity
                style={[styles.btn, styles.togglePw]}
                onPress={() => setResetPwVisible((v) => !v)}
              >
                <Text style={styles.toggleText}>
                  {resetPwVisible ? "Hide" : "Show"}
                </Text>
              </TouchableOpacity>
              <Button
                title={rowBusy[item.id] ? "Saving..." : "Confirm Reset"}
                onPress={() => handleResetPassword(item.id)}
                disabled={rowBusy[item.id]}
              />
            </View>
          </View>
        )}
      </View>
    );
  };

  const listEmpty = () => (
    <View style={styles.emptyWrap}>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <>
          <Text style={styles.emptyTitle}>No users found</Text>
          <Text style={styles.emptySub}>Try changing your search.</Text>
        </>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>User Management</Text>
      <TextInput
        style={styles.input}
        placeholder="Search by username or email"
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        autoCapitalize="none"
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={listEmpty}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadUsers(true)} />
        }
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fa", padding: 16 },
  header: { fontSize: 22, fontWeight: "bold", marginBottom: 14 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#dce1e6",
    marginBottom: 10,
    padding: 10,
    fontSize: 16,
  },

  userBox: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 8,
    elevation: 1,
  },
  userHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  username: { fontWeight: "bold", fontSize: 16 },
  email: { color: "#666", fontSize: 13, marginBottom: 5 },

  actionsRow: { flexDirection: "row", marginTop: 6, gap: 10, flexWrap: "wrap" },

  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  btnText: { color: "#fff", fontWeight: "600" },
  btnDisabled: { opacity: 0.6 },

  promote: { backgroundColor: "#00BFFF" },
  demote: { backgroundColor: "#FF6600" },
  reset: { backgroundColor: "#222" },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: { color: "#fff", fontWeight: "700", fontSize: 12 },

  resetWrap: { marginTop: 10 },
  resetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  togglePw: { backgroundColor: "#E5E7EB" },
  toggleText: { color: "#111827", fontWeight: "600" },

  emptyWrap: { alignItems: "center", paddingVertical: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: "#333" },
  emptySub: { marginTop: 4, color: "#666" },
});
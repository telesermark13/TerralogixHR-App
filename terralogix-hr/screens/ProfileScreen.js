// screens/ProfileScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import {
  getProfile,
  updateProfile,
  uploadProfilePhoto,
  changePassword,
  getPendingAttendance,
  logout,
} from "../api";
import { useAuth } from "../AuthContext";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ProfileScreen() {
  const { refreshProfile, signOut } = useAuth();
  const navigation = useNavigation();

  const [editing, setEditing] = useState(false);

  const [loading, setLoading] = useState(true);            // screen load
  const [saving, setSaving] = useState(false);             // profile save
  const [changing, setChanging] = useState(false);         // password change
  const [loggingOut, setLoggingOut] = useState(false);

  const [profile, setProfile] = useState({
    id: null,
    full_name: "",
    email: "",
    photo: null,
  });
  const [originalProfile, setOriginalProfile] = useState(null);
  const [unsynced, setUnsynced] = useState(false);

  const [photoAsset, setPhotoAsset] = useState(null);       // local asset chosen (to upload)
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // ---- Load / Refresh profile ----
  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProfile();
      const normalized = {
        id: data.id,
        full_name: data.full_name || "",
        email: data.email || "",
        photo: data.profile_photo_url || data.photo || null,
      };
      setProfile(normalized);
      setOriginalProfile(normalized);
    } catch (err) {
      const msg = err?.message || "Profile error";
      if (msg.includes("Session expired")) {
        Alert.alert("Session expired", "Please login again.", [
          {
            text: "OK",
            onPress: async () => {
              await logout();
              navigation.reset({ index: 0, routes: [{ name: "LoginScreen" }] });
            },
          },
        ]);
      } else {
        Alert.alert("Failed to load profile", msg);
      }
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  // ---- Check unsynced queue ----
  const checkUnsynced = useCallback(async () => {
    try {
      const pending = await getPendingAttendance();
      setUnsynced(Array.isArray(pending) && pending.length > 0);
    } catch {
      setUnsynced(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    checkUnsynced();
  }, [loadProfile, checkUnsynced]);

  // Refresh when screen focuses (e.g., after returning from other screens)
  useFocusEffect(
    useCallback(() => {
      checkUnsynced();
    }, [checkUnsynced])
  );

  // ---- Helpers ----
  const validateEmail = (email) => EMAIL_RE.test(email);
  const canSave = useMemo(() => {
    const changed =
      profile.full_name !== originalProfile?.full_name ||
      profile.email !== originalProfile?.email ||
      !!photoAsset;
    return (
      changed &&
      profile.full_name.trim().length >= 2 &&
      validateEmail(profile.email)
    );
  }, [profile, originalProfile, photoAsset]);

  const pickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Permission needed", "Allow photo library access to select a picture.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset) return;

      // simple file type/size guard (size may be undefined on some platforms)
      const isImage =
        asset.mimeType?.startsWith?.("image/") || /\.(png|jpe?g|webp)$/i.test(asset.uri);
      if (!isImage) {
        Alert.alert("Unsupported file", "Please select a PNG/JPG/WEBP image.");
        return;
      }

      setProfile((p) => ({ ...p, photo: asset.uri }));
      setPhotoAsset(asset);
    } catch (e) {
      Alert.alert("Image pick failed", e?.message || "Unable to select image.");
    }
  };

  const removePhoto = () => {
    setProfile((p) => ({ ...p, photo: null }));
    setPhotoAsset({ remove: true }); // signal backend to clear photo if you support it
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      // 1) Upload photo if a new asset is chosen
      if (photoAsset && !photoAsset.remove) {
        const uploaded = await uploadProfilePhoto(photoAsset); // expect { photo_url }
        if (uploaded?.photo_url) {
          setProfile((prev) => ({ ...prev, photo: uploaded.photo_url }));
        }
      }
      // If remove requested and your API supports it, pass a null/empty flag
      const payload = {
        id: originalProfile.id, // Use originalProfile.id to ensure it's not null
        full_name: profile.full_name.trim(),
        email: profile.email.trim(),
        ...(photoAsset?.remove ? { photo: null } : {}),
      };

      await updateProfile(payload);

      setOriginalProfile((prev) => ({ ...prev, ...payload }));
      setPhotoAsset(null);
      setEditing(false);
      Alert.alert("Success", "Profile updated!");
      if (refreshProfile) await refreshProfile();
      checkUnsynced();
    } catch (err) {
      const msg = err?.message || "Profile update error";
      if (msg.includes("Session expired")) {
        Alert.alert("Session expired", "Please login again.", [
          {
            text: "OK",
            onPress: async () => {
              await logout();
              navigation.reset({ index: 0, routes: [{ name: "LoginScreen" }] });
            },
          },
        ]);
      } else {
        Alert.alert("Failed to update", msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setProfile(originalProfile);
    setPhotoAsset(null);
    setEditing(false);
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword) {
      Alert.alert("Input required", "Please fill out both fields.");
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert("Weak password", "New password must be at least 8 characters.");
      return;
    }
    if (newPassword === oldPassword) {
      Alert.alert("Try a different password", "New password must differ from old password.");
      return;
    }

    setChanging(true);
    try {
      await changePassword(oldPassword, newPassword);
      Alert.alert("Success", "Password changed successfully!");
      setOldPassword("");
      setNewPassword("");
      Keyboard.dismiss();
    } catch (e) {
      const msg = e?.message || "Password error";
      if (msg.includes("Session expired")) {
        Alert.alert("Session expired", "Please login again.", [
          {
            text: "OK",
            onPress: async () => {
              await logout();
              navigation.reset({ index: 0, routes: [{ name: "LoginScreen" }] });
            },
          },
        ]);
      } else {
        Alert.alert("Error", msg);
      }
    } finally {
      setChanging(false);
    }
  };

  const handleLogout = async () => {
    if (unsynced) {
      Alert.alert(
        "Unsynced Attendance",
        "You have unsynced attendance actions. Please sync before logging out."
      );
      return;
    }
    setLoggingOut(true);
    try {
      await logout();
      navigation.reset({ index: 0, routes: [{ name: "LoginScreen" }] });
      if (signOut) await signOut();
    } finally {
      setLoggingOut(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#00BFFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={editing ? pickImage : undefined} activeOpacity={editing ? 0.7 : 1}>
        <Image
          source={profile.photo ? { uri: profile.photo } : require("../assets/logo.png")}
          style={styles.avatar}
        />
        {editing && (
          <View style={styles.editBadge}>
            <Text style={{ color: "#fff", fontSize: 12 }}>Edit</Text>
          </View>
        )}
      </TouchableOpacity>

      {editing ? (
        <>
          <TextInput
            style={styles.input}
            value={profile.full_name}
            onChangeText={(full_name) => setProfile({ ...profile, full_name })}
            placeholder="Full Name"
          />
          <TextInput
            style={styles.input}
            value={profile.email}
            onChangeText={(email) => setProfile({ ...profile, email })}
            placeholder="Email"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <View style={{ flexDirection: "row", width: "100%", marginBottom: 8 }}>
            <TouchableOpacity
              style={[styles.smallBtn, { backgroundColor: "#ef4444" }]}
              onPress={removePhoto}
            >
              <Text style={styles.smallBtnText}>Remove Photo</Text>
            </TouchableOpacity>
            <View style={{ width: 10 }} />
            <TouchableOpacity
              style={[styles.smallBtn, { backgroundColor: "#4b5563" }]}
              onPress={pickImage}
            >
              <Text style={styles.smallBtnText}>Change Photo</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", width: "100%" }}>
            <TouchableOpacity
              style={[styles.button, { flex: 1, marginRight: 4 }, (!canSave || saving) && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={!canSave || saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, { flex: 1, marginLeft: 4, backgroundColor: "#eee" }]}
              onPress={handleCancelEdit}
              disabled={saving}
            >
              <Text style={[styles.buttonText, { color: "#00BFFF" }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.header}>{profile.full_name}</Text>
          <Text style={styles.text}>{profile.email}</Text>
          <TouchableOpacity style={styles.button} onPress={() => setEditing(true)}>
            <Text style={styles.buttonText}>Edit Profile</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Change Password */}
      <Text style={styles.sectionTitle}>Change Password</Text>
      <TextInput
        placeholder="Old Password"
        value={oldPassword}
        onChangeText={setOldPassword}
        secureTextEntry
        style={styles.input}
        editable={!changing}
      />
      <TextInput
        placeholder="New Password (min 8 chars)"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        style={styles.input}
        editable={!changing}
      />
      <TouchableOpacity
        style={[styles.button, changing && styles.buttonDisabled]}
        onPress={handleChangePassword}
        disabled={changing}
      >
        <Text style={styles.buttonText}>{changing ? "Changing..." : "Change Password"}</Text>
      </TouchableOpacity>

      {/* Logout + warning */}
      <TouchableOpacity
        style={[
          styles.button,
          unsynced ? styles.logoutDisabled : { backgroundColor: "#ccc" },
          loggingOut && styles.buttonDisabled,
        ]}
        onPress={handleLogout}
        disabled={unsynced || loggingOut}
      >
        {loggingOut ? (
          <ActivityIndicator color={unsynced ? "#fff" : "#222"} />
        ) : (
          <Text style={{ color: unsynced ? "#fff" : "#222", fontWeight: "bold" }}>
            {unsynced ? "Logout (Disabled: Unsynced)" : "Logout"}
          </Text>
        )}
      </TouchableOpacity>

      {unsynced && (
        <Text style={styles.unsyncedWarning}>
          You have unsynced attendance. Logout is disabled until you sync.
        </Text>
      )}

      <Text style={styles.tagline}>© 2024 Terralogix. All Rights Reserved.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F8FB", alignItems: "center", justifyContent: "center", padding: 16 },
  avatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 24, backgroundColor: "#eaeaea" },
  editBadge: {
    position: "absolute",
    bottom: 18,
    right: 10,
    backgroundColor: "#00BFFF",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    zIndex: 2,
  },
  header: { fontSize: 22, fontWeight: "bold", color: "#00BFFF", marginBottom: 8 },
  text: { fontSize: 16, color: "#333", marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: "bold", marginTop: 32, alignSelf: "flex-start" },

  input: {
    width: "100%",
    height: 44,
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
    fontSize: 16,
    borderColor: "#E0E0E0",
    borderWidth: 1,
  },

  button: {
    width: "100%",
    height: 44,
    backgroundColor: "#00BFFF",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 18 },

  smallBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  smallBtnText: { color: "#fff", fontWeight: "700" },

  logoutDisabled: { backgroundColor: "#e67e22" },
  unsyncedWarning: { color: "#e67e22", fontSize: 13, marginBottom: 8, textAlign: "center" },

  tagline: {
    color: "#888",
    fontSize: 12,
    marginTop: 24,
    textAlign: "center",
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    width: "100%",
  },
});

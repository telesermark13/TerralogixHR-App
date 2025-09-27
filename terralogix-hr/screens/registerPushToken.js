// utils/registerPushToken.js
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform, Alert } from "react-native";
import axios from "axios";
import { API_BASE_URL } from "../api";

export async function registerPushToken(authToken) {
  try {
    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      Alert.alert("Permission Denied", "Push notifications permission is required.");
      return;
    }

    // Android-specific channel setup
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#00BFFF",
      });
    }

    // Get Expo push token
    const expoPushTokenData = await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId 
        ?? Constants.easConfig?.projectId 
        ?? undefined,
    });

    const expoPushToken = expoPushTokenData.data;
    if (!expoPushToken) {
      Alert.alert("Token Error", "Could not retrieve Expo push token.");
      return;
    }

    // Save token to backend
    await axios.post(
      `${API_BASE_URL}/save-push-token/`,
      { expo_push_token: expoPushToken },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    console.log("✅ Push token registered:", expoPushToken);
  } catch (err) {
    console.error("❌ registerPushToken error:", err);
    Alert.alert("Error", err?.message || "Failed to register push token.");
  }
}
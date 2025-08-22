
import { Alert, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { savePushToken } from "../api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync(userId) {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      Alert.alert("Notifications", "Permission not granted for push notifications.");
      return;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId:
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId ??
        undefined,
    });
    const expoToken = tokenData?.data;
    if (expoToken && userId) {
      await savePushToken(userId, expoToken);
      await AsyncStorage.setItem("expo_push_token", expoToken);
    }
  } catch (err) {
    console.log("registerForPushNotificationsAsync error:", err?.message || err);
  }
}

export function setupNotificationListeners() {
  const notificationListener = Notifications.addNotificationReceivedListener((notification) => {
    Alert.alert(
      notification.request?.content?.title || "Notification",
      notification.request?.content?.body || ""
    );
  });

  const responseListener = Notifications.addNotificationResponseReceivedListener(() => {});

  return () => {
    if (notificationListener) {
      Notifications.removeNotificationSubscription(notificationListener);
    }
    if (responseListener) {
      Notifications.removeNotificationSubscription(responseListener);
    }
  };
}

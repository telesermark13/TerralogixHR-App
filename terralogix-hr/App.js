// App.js
import React, { useEffect, useRef } from "react";
import { Alert, Platform } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

import { AuthProvider, useAuth } from "./AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { savePushToken } from "./api";

// Screens
import LoginScreen from "./screens/LoginScreen";
import DashboardScreen from "./screens/DashboardScreen";
import AttendanceScreen from "./screens/AttendanceScreen";
import LeaveScreen from "./screens/LeaveScreen";
import ProfileScreen from "./screens/ProfileScreen";
import PayslipStack from "./screens/PayslipStack";
import AttendanceMapScreen from "./screens/AttendanceMapScreen";
import AdminDashboardScreen from "./screens/AdminDashboardScreen";
import AdminAttendanceMapScreen from "./screens/AdminAttendanceMapScreen";
import AnnouncementsScreen from "./screens/AnnouncementsScreen";
import AdminAnnouncementsScreen from "./screens/AdminAnnouncementsScreen";
import AdminUserManagementScreen from "./screens/AdminUserManagementScreen";

// ---------------- Notifications config ----------------
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

async function registerForPushNotificationsAsync(userId) {
  try {
    // Ask permissions
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

    // Android channel
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    // Get Expo push token
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

// ---------------- Tabs ----------------
function MainTabs() {
  const { user, isStaff } = useAuth();

  useEffect(() => {
    // Keep a boolean string for legacy checks you already do elsewhere
    AsyncStorage.setItem("is_staff", isStaff ? "1" : "0");
  }, [isStaff]);

  // Register push once we have a user
  useEffect(() => {
    if (user?.id) registerForPushNotificationsAsync(user.id);
  }, [user?.id]);

  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#00BFFF",
        tabBarInactiveTintColor: "#999",
        tabBarStyle: { backgroundColor: "#fff" },
        tabBarIcon: ({ color, size }) => {
          let icon = "ellipse-outline";
          if (route.name === "Dashboard") icon = "home-outline";
          else if (route.name === "Announcements") icon = "notifications-outline";
          else if (route.name === "Attendance") icon = "calendar-outline";
          else if (route.name === "Leave") icon = "paper-plane-outline";
          else if (route.name === "Payslip") icon = "cash-outline";
          else if (route.name === "Profile") icon = "person-outline";
          else if (route.name === "Admin") icon = "shield-outline";
          else if (route.name === "ManageAnnouncements") icon = "megaphone-outline";
          else if (route.name === "Users") icon = "people-outline";
          return <Ionicons name={icon} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Announcements" component={AnnouncementsScreen} />
      <Tab.Screen name="Attendance" component={AttendanceScreen} />
      <Tab.Screen name="Leave" component={LeaveScreen} />
      <Tab.Screen name="Payslip" component={PayslipStack} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
      {isStaff && (
        <>
          <Tab.Screen name="Admin" component={AdminDashboardScreen} />
          <Tab.Screen name="ManageAnnouncements" component={AdminAnnouncementsScreen} />
          <Tab.Screen name="Users" component={AdminUserManagementScreen} />
        </>
      )}
    </Tab.Navigator>
  );
}

// ---------------- Root Navigation (guards by auth state) ----------------
function RootNavigator() {
  const { isAuthenticated, loading } = useAuth();
  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      Alert.alert(
        notification.request?.content?.title || "Notification",
        notification.request?.content?.body || ""
      );
    });
    responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {});

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  if (loading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={isAuthenticated ? "MainTabs" : "LoginScreen"}>
        {!isAuthenticated ? (
          <Stack.Screen name="LoginScreen" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen
              name="AttendanceMap"
              component={AttendanceMapScreen}
              options={{ headerShown: true, title: "Attendance Map" }}
            />
            <Stack.Screen
              name="AdminAttendanceMap"
              component={AdminAttendanceMapScreen}
              options={{ headerShown: true, title: "All Check-ins Map" }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ---------------- App ----------------
export default function App() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}


import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useAuth } from "../AuthContext";
import { setupNotificationListeners } from "../services/notificationService";

// Screens
import LoginScreen from "../screens/LoginScreen";
import AttendanceMapScreen from "../screens/AttendanceMapScreen";
import AdminAttendanceMapScreen from "../screens/AdminAttendanceMapScreen";
import MainTabs from "./MainTabs";

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    const cleanupListeners = setupNotificationListeners();
    return cleanupListeners;
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

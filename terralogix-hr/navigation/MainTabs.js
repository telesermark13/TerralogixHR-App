
import React, { useEffect } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAuth } from "../AuthContext";
import { registerForPushNotificationsAsync } from "../services/notificationService";

// Screens
import DashboardScreen from "../screens/DashboardScreen";
import AttendanceScreen from "../screens/AttendanceScreen";
import LeaveScreen from "../screens/LeaveScreen";
import ProfileScreen from "../screens/ProfileScreen";
import PayslipStack from "../screens/PayslipStack";
import AdminDashboardScreen from "../screens/AdminDashboardScreen";
import AnnouncementsScreen from "../screens/AnnouncementsScreen";
import AdminAnnouncementsScreen from "../screens/AdminAnnouncementsScreen";
import AdminUserManagementScreen from "../screens/AdminUserManagementScreen";

const Tab = createBottomTabNavigator();

const TABS = {
  Dashboard: {
    component: DashboardScreen,
    icon: "home-outline",
  },
  Announcements: {
    component: AnnouncementsScreen,
    icon: "notifications-outline",
  },
  Attendance: {
    component: AttendanceScreen,
    icon: "calendar-outline",
  },
  Leave: {
    component: LeaveScreen,
    icon: "paper-plane-outline",
  },
  Payslip: {
    component: PayslipStack,
    icon: "cash-outline",
  },
  Profile: {
    component: ProfileScreen,
    icon: "person-outline",
  },
};

const ADMIN_TABS = {
  Admin: {
    component: AdminDashboardScreen,
    icon: "shield-outline",
  },
  ManageAnnouncements: {
    component: AdminAnnouncementsScreen,
    icon: "megaphone-outline",
  },
  Users: {
    component: AdminUserManagementScreen,
    icon: "people-outline",
  },
};

export default function MainTabs() {
  const { user, isStaff } = useAuth();

  useEffect(() => {
    AsyncStorage.setItem("is_staff", isStaff ? "1" : "0");
  }, [isStaff]);

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
          const iconName = TABS[route.name]?.icon || ADMIN_TABS[route.name]?.icon || "ellipse-outline";
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      {Object.entries(TABS).map(([name, { component }]) => (
        <Tab.Screen key={name} name={name} component={component} />
      ))}
      {isStaff &&
        Object.entries(ADMIN_TABS).map(([name, { component }]) => (
          <Tab.Screen key={name} name={name} component={component} />
        ))}
    </Tab.Navigator>
  );
}

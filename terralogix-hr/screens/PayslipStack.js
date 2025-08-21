// screens/PayslipStack.js
import React from "react";
import { Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import PayslipListScreen from "./PayslipListScreen";
import PayslipScreen from "./PayslipScreen";

/**
 * @typedef {Object} PayslipStackParamList
 * @property {undefined} PayslipList
 * @property {{ payslipId: number }} PayslipScreen
 */

/** @type {import('@react-navigation/native-stack').NativeStackNavigatorProps} */
const Stack = createNativeStackNavigator();

/**
 * A small helper to keep header styles consistent across the stack.
 */
const commonScreenOptions = {
  headerShadowVisible: false,
  headerTitleStyle: {
    fontWeight: Platform.OS === "ios" ? "600" : "700",
    color: "#0b1220",
  },
  headerBackTitleVisible: false,
  animation: Platform.select({ ios: "default", android: "slide_from_right" }),
  gestureEnabled: true,
};

export default function PayslipStack() {
  return (
    <Stack.Navigator
      initialRouteName="PayslipList"
      screenOptions={{
        ...commonScreenOptions,
        headerLargeTitle: Platform.OS === "ios", // iOS large titles
        headerStyle: { backgroundColor: "#F4F8FB" },
      }}
    >
      <Stack.Screen
        name="PayslipList"
        component={PayslipListScreen}
        options={{ title: "Payslips" }}
      />

      <Stack.Screen
        name="PayslipScreen"
        component={PayslipScreen}
        options={{
          title: "Payslip Detail",
          // You can flip this to 'modal' on iOS if you prefer:
          // presentation: Platform.OS === 'ios' ? 'formSheet' : 'card',
        }}
      />
    </Stack.Navigator>
  );
}

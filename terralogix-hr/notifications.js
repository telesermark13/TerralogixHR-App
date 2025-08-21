// pushNotifications.js
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { savePushToken } from './api';

// Registers device for push notifications and stores token locally & remotely
export async function registerForPushNotificationsAsync(userId) {
  try {
    if (!Constants.isDevice) {
      alert('Must use physical device for push notifications');
      return null;
    }

    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      alert('Failed to get push token for notifications!');
      return null;
    }

    // Get Expo push token
    const token = (await Notifications.getExpoPushTokenAsync()).data;

    // Save locally
    await AsyncStorage.setItem('expoPushToken', token);

    // Save to backend
    if (userId) {
      await savePushToken(userId, token);
    }

    return token;
  } catch (error) {
    console.error('Error registering for push notifications:', error);
    return null;
  }
}

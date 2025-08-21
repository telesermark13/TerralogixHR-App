// utils/showToast.js
import { ToastAndroid, Platform, Alert } from 'react-native';

/**
 * Cross-platform toast/alert helper.
 * @param {string} msg - The message to show.
 * @param {object} options - Optional settings.
 * @param {"short"|"long"} [options.duration="short"] - Toast duration (Android only).
 * @param {"top"|"center"|"bottom"} [options.gravity="bottom"] - Position (Android only).
 * @param {string} [options.title=""] - Title for iOS Alert.
 */
export function showToast(
  msg,
  { duration = "short", gravity = "bottom", title = "" } = {}
) {
  if (!msg) return;

  if (Platform.OS === "android") {
    let toastDuration =
      duration === "long" ? ToastAndroid.LONG : ToastAndroid.SHORT;
    let toastGravity;
    switch (gravity) {
      case "top":
        toastGravity = ToastAndroid.TOP;
        break;
      case "center":
        toastGravity = ToastAndroid.CENTER;
        break;
      default:
        toastGravity = ToastAndroid.BOTTOM;
    }
    ToastAndroid.showWithGravity(msg, toastDuration, toastGravity);
  } else {
    Alert.alert(title, msg);
  }
}

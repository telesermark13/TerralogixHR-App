// config.js
import { Platform, NativeModules } from "react-native";
import Constants from "expo-constants";

/**
 * Try to derive the Metro/LAN host when running in Expo dev.
 * Works with classic + EAS dev builds.
 */
function getDevHost() {
  // 1) Newer Expo (EAS/Runtime)
  const easProjectHost =
    Constants?.expoConfig?.extra?.easProjectHost ||
    Constants?.expoConfig?.hostUri ||
    Constants?.expoConfig?.developer?.host;

  // 2) Classic Expo manifest (legacy)
  const classicHost =
    Constants?.manifest2?.extra?.expoClient?.hostUri ||
    Constants?.manifest?.hostUri ||
    Constants?.manifest?.debuggerHost;

  // 3) RN script URL (bare/standalone dev)
  const scriptURL = NativeModules?.SourceCode?.scriptURL;

  const hostCandidate =
    easProjectHost ||
    classicHost ||
    (scriptURL ? scriptURL.split("://")[1] : null); // e.g. "192.168.1.10:19000/index.bundle?..."

  if (!hostCandidate) return null;

  // Extract "192.168.x.x" from something like "192.168.x.x:19000" or "...:8081/index.bundle"
  const match = hostCandidate.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
  return match ? match[0] : null;
}

/**
 * Normalize and ensure it ends with `/api/`.
 */
function normalizeBase(url) {
  if (!url) return null;
  // Remove trailing slashes
  let u = url.replace(/\/+$/, "");
  // If user passed the domain only, add /api
  if (!u.endsWith("/api")) u += "/api";
  // Ensure single trailing slash
  return `${u}/`;
}

/**
 * 1) Prefer explicit env (best for production/EAS)
 * 2) If dev, auto-wire to your LAN IP (Django on :8000)
 * 3) Fallback to production Railway
 */

// FORCE: Always use Render backend for all builds

/**
 * Optional helper if you ever need to override at runtime.
 */
export function setBaseURL(next) {
  const normalized = normalizeBase(next);
  if (!normalized) throw new Error("Invalid base URL");
  // eslint-disable-next-line no-console
  console.log("[config] BASE_URL updated:", normalized);
  // In modules this simple reassign is fine (reference is updated on next import/use)
  // If you need reactive updates, consider a ConfigContext instead.
  // @ts-ignore
  exports.BASE_URL = normalized;
}

/**
 * Small helper to build endpoint URLs safely.
 * Usage: apiUrl("employees/") -> `${BASE_URL}employees/`
 */
export function apiUrl(path = "") {
  const trimmed = String(path).replace(/^\/+/, "");
  return `${API_BASE_URL}${trimmed}`;
}
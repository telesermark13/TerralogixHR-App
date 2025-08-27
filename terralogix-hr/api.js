// api/index.js (or wherever you keep this module)
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

/** Base URLs */
/** Base URLs */
export const API_BASE = "http://127.0.0.1:8000";
export const BASE_URL = `${API_BASE}/api/`;

/* ------------------------------------------------
   Helpers
-------------------------------------------------*/

async function jsonOrText(res) {
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return txt; }
}

export async function getAccessToken() {
  return AsyncStorage.getItem("access_token");
}

export async function saveTokens({ access, refresh }) {
  if (access) await AsyncStorage.setItem("access_token", access);
  if (refresh) await AsyncStorage.setItem("refresh_token", refresh);
}

export async function logout() {
  await AsyncStorage.multiRemove(["access_token", "refresh_token"]);
}

export async function refreshAccessToken() {
  const refresh = await AsyncStorage.getItem("refresh_token");
  if (!refresh) throw new Error("No refresh token");
  const response = await fetch(`${BASE_URL}token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!response.ok) throw new Error("Refresh failed");
  const data = await response.json();
  if (!data?.access) throw new Error("No access token in refresh");
  await AsyncStorage.setItem("access_token", data.access);
  return data.access;
}

/** One-stop fetch with JWT + auto-refresh */
export async function fetchWithAuth(url, options = {}) {
  let token = await getAccessToken();
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // Auto-set content type for JSON bodies if caller didn't set it and body isn't FormData
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  let res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    try {
      token = await refreshAccessToken();
      headers.set("Authorization", `Bearer ${token}`);
      res = await fetch(url, { ...options, headers });
    } catch (e) {
      await logout();
      throw new Error("Session expired, please login again.");
    }
  }
  if (!res.ok) {
    const err = await jsonOrText(res);
    throw new Error(typeof err === "string" ? err : (err.detail || err.message || "Request failed"));
  }
  // Some endpoints return 204 No Content
  if (res.status === 204) return null;
  return res.json();
}

/* ------------------------------------------------
   Auth
-------------------------------------------------*/

export async function login(username, password) {
  const response = await fetch(`${BASE_URL}token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error("Login failed");
  return response.json(); // { access, refresh }
}

/* ------------------------------------------------
   Profile / Employees
-------------------------------------------------*/

/** Get the authenticated user profile (expect a single object) */
export async function getProfile() {
  return fetchWithAuth(`${BASE_URL}profile/`);
}

/** If you need the full employee list separately */
export async function getEmployees() {
  return fetchWithAuth(`${BASE_URL}employees/`);
}

export async function getEmployeeById(id) {
  return fetchWithAuth(`${BASE_URL}employees/${id}/`);
}

export async function updateProfile(data) {
  // data: { id, full_name, email }  (PATCH /employees/:id/)
  return fetchWithAuth(`${BASE_URL}employees/${data.id}/`, {
    method: "PATCH",
    body: JSON.stringify({
      full_name: data.full_name,
      email: data.email,
    }),
  });
}

export async function uploadProfilePhoto(photoAsset) {
  const token = await getAccessToken();
  const formData = new FormData();
  formData.append("photo", {
    uri: photoAsset.uri,
    name: "profile.jpg",
    type: photoAsset.type || "image/jpeg",
  });

  const res = await fetch(`${BASE_URL}employee/profile-photo/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const err = await jsonOrText(res);
    throw new Error(typeof err === "string" ? err : (err.detail || "Photo upload failed"));
  }
  return res.json(); // expect { photo_url }
}

/** User self-service change password */
export async function changePassword(oldPassword, newPassword) {
  return fetchWithAuth(`${BASE_URL}change-password/`, {
    method: "POST",
    body: JSON.stringify({
      old_password: oldPassword,
      new_password: newPassword,
    }),
  });
}

/* ------------------------------------------------
   Attendance
-------------------------------------------------*/

export async function fetchAttendance() {
  return fetchWithAuth(`${BASE_URL}attendances/`);
}

export async function postTimeIn(location = {}) {
  return fetchWithAuth(`${BASE_URL}attendance/time-in/`, {
    method: "POST",
    body: JSON.stringify(location),
  });
}

export async function postTimeOut(location = {}) {
  return fetchWithAuth(`${BASE_URL}attendance/time-out/`, {
    method: "POST",
    body: JSON.stringify(location),
  });
}

/** Offline helpers (local only) */
export async function addPendingAttendance(action) {
  const raw = await AsyncStorage.getItem("pendingAttendance");
  const pending = raw ? JSON.parse(raw) : [];
  pending.push(action);
  await AsyncStorage.setItem("pendingAttendance", JSON.stringify(pending));
}
export async function getPendingAttendance() {
  const raw = await AsyncStorage.getItem("pendingAttendance");
  return raw ? JSON.parse(raw) : [];
}
export async function clearPendingAttendance() {
  await AsyncStorage.removeItem("pendingAttendance");
}

export async function saveAttendanceCache(history) {
  await AsyncStorage.setItem("attendanceCache", JSON.stringify(history));
}
export async function getAttendanceCache() {
  const raw = await AsyncStorage.getItem("attendanceCache");
  return raw ? JSON.parse(raw) : [];
}

/** Admin: all attendance locations (for map) */
export async function fetchAllAttendanceLocations() {
  return fetchWithAuth(`${BASE_URL}attendance/all/`);
}

/* ------------------------------------------------
   Leaves
-------------------------------------------------*/

export async function getLeaves() {
  return fetchWithAuth(`${BASE_URL}leaves/`);
}

export async function getLeaveById(id) {
  return fetchWithAuth(`${BASE_URL}leaves/${id}/`);
}

/** Create leave using common shape used in your screens */
export async function createLeave({ start_date, end_date, reason, employee }) {
  const payload = { start_date, end_date, reason };
  if (employee) payload.employee = employee;
  return fetchWithAuth(`${BASE_URL}leaves/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Offline leave queue (local only) */
export async function addPendingLeave(action) {
  const raw = await AsyncStorage.getItem("pendingLeave");
  const pending = raw ? JSON.parse(raw) : [];
  pending.push(action);
  await AsyncStorage.setItem("pendingLeave", JSON.stringify(pending));
}
export async function getPendingLeave() {
  const raw = await AsyncStorage.getItem("pendingLeave");
  return raw ? JSON.parse(raw) : [];
}
export async function clearPendingLeave() {
  await AsyncStorage.removeItem("pendingLeave");
}

/* ------------------------------------------------
   Payslips
-------------------------------------------------*/

export async function getPayslips(params) {
  // Optional pagination support: pass { page: 1 } etc.
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchWithAuth(`${BASE_URL}payslips/${qs}`);
}

export async function getPayslipById(id) {
  return fetchWithAuth(`${BASE_URL}payslips/${id}/`);
}

export async function savePayslipCache(payslip) {
  const key = `payslipCache_${payslip.id}`;
  await AsyncStorage.setItem(key, JSON.stringify(payslip));
}
export async function getPayslipCache(id) {
  const raw = await AsyncStorage.getItem(`payslipCache_${id}`);
  return raw ? JSON.parse(raw) : null;
}

/** Admin exports */
export async function exportPayslipFile(type = "csv") {
  const token = await AsyncStorage.getItem("access_token");
  const url = `${BASE_URL}admin/payslips/export/${type}/`;
  const ext = type === "excel" ? "xlsx" : "csv";
  const fileUri = FileSystem.cacheDirectory + `payslips_export.${ext}`;
  const res = await FileSystem.downloadAsync(url, fileUri, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) throw new Error("Export download failed");
  return fileUri;
}
export async function sharePayslipFile(type = "csv") {
  const fileUri = await exportPayslipFile(type);
  await Sharing.shareAsync(fileUri, {
    mimeType:
      type === "excel"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv",
  });
}

/* ------------------------------------------------
   Announcements
-------------------------------------------------*/

export async function getAnnouncements() {
  return fetchWithAuth(`${BASE_URL}announcements/`);
}
export async function createAnnouncement({ title, message }) {
  return fetchWithAuth(`${BASE_URL}announcements/`, {
    method: "POST",
    body: JSON.stringify({ title, message }),
  });
}
export async function updateAnnouncement(id, { title, message }) {
  return fetchWithAuth(`${BASE_URL}announcements/${id}/`, {
    method: "PATCH",
    body: JSON.stringify({ title, message }),
  });
}
export async function deleteAnnouncement(id) {
  return fetchWithAuth(`${BASE_URL}announcements/${id}/`, { method: "DELETE" });
}

/* ------------------------------------------------
   Holidays (external API)
-------------------------------------------------*/

export async function fetchPHHolidays(year = new Date().getFullYear()) {
  const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/PH`);
  if (!res.ok) throw new Error("Failed to fetch PH holidays");
  return res.json();
}

/* ------------------------------------------------
   Push tokens / Notifications
-------------------------------------------------*/

export async function savePushToken(userId, expoPushToken) {
  return fetchWithAuth(`${BASE_URL}save-push-token/`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, expo_push_token: expoPushToken }),
  });
}

export async function getNotifications() {
  return fetchWithAuth(`${BASE_URL}notifications/`);
}
export async function markNotificationRead(id) {
  return fetchWithAuth(`${BASE_URL}notifications/${id}/read/`, { method: "POST" });
}

/* ------------------------------------------------
   Admin
-------------------------------------------------*/

export async function fetchDashboardStats() {
  return fetchWithAuth(`${BASE_URL}admin/dashboard-stats/`);
}
export async function fetchAllEmployees() {
  return fetchWithAuth(`${BASE_URL}admin/employees/`);
}
export async function fetchAllLeaves() {
  return fetchWithAuth(`${BASE_URL}admin/leaves/`);
}
export async function decideLeave(leaveId, status, remarks = "") {
  return fetchWithAuth(`${BASE_URL}admin/leave/${leaveId}/decide/`, {
    method: "POST",
    body: JSON.stringify({ status, remarks }),
  });
}
export async function changePasswordAdmin(new_password, old_password) {
  return fetchWithAuth(`${BASE_URL}change-password/`, {
    method: "POST",
    body: JSON.stringify({ old_password, new_password }),
  });
}
export async function fetchAttendanceTrend() {
  return fetchWithAuth(`${BASE_URL}admin/attendance-trend/`);
}

/* ------------------------------------------------
   Attendance export (Admin)
-------------------------------------------------*/

export async function exportAttendanceFile(type = "csv") {
  const token = await AsyncStorage.getItem("access_token");
  const url = `${BASE_URL}admin/attendance/export/?type=${type}`;
  const ext = type === "excel" ? "xlsx" : "csv";
  const fileUri = FileSystem.cacheDirectory + `attendance_export.${ext}`;
  const res = await FileSystem.downloadAsync(url, fileUri, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) throw new Error("Export download failed");
  return fileUri;
}
export async function shareAttendanceFile(type = "csv") {
  const fileUri = await exportAttendanceFile(type);
  await Sharing.shareAsync(fileUri, {
    mimeType:
      type === "excel"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv",
  });
}

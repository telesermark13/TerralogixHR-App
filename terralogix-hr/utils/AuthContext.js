// AuthContext.js
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AppState, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { login as apiLogin, getProfile, logout as apiLogout, BASE_URL } from "./api";

const AuthContext = createContext();

async function refreshAccessToken() {
  try {
    const refresh = await AsyncStorage.getItem("refresh_token");
    if (!refresh) return null;

    const res = await fetch(`${BASE_URL}api/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });

    if (!res.ok) {
      // Refresh token invalid/expired
      return null;
    }
    const data = await res.json();
    if (!data?.access) return null;

    await AsyncStorage.setItem("access_token", data.access);
    return data.access;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);      // profile object
  const [token, setToken] = useState(null);    // access token
  const [loading, setLoading] = useState(true);

  // ---- Bootstrap session on mount ----
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const access = await AsyncStorage.getItem("access_token");
        const refresh = await AsyncStorage.getItem("refresh_token");

        let useAccess = access;

        // Try to fetch profile; if it fails (e.g., expired), try refreshing
        if (useAccess) {
          try {
            const profile = await getProfile();
            if (!mounted) return;
            setUser(profile);
            setToken(useAccess);
          } catch {
            // Try refresh flow
            if (refresh) {
              const newAccess = await refreshAccessToken();
              if (newAccess) {
                if (!mounted) return;
                setToken(newAccess);
                try {
                  const profile = await getProfile();
                  if (!mounted) return;
                  setUser(profile);
                } catch {
                  if (!mounted) return;
                  setUser(null);
                  setToken(null);
                }
              } else {
                // refresh invalid
                await AsyncStorage.multiRemove(["access_token", "refresh_token"]);
                if (!mounted) return;
                setUser(null);
                setToken(null);
              }
            } else {
              // no refresh token
              await AsyncStorage.multiRemove(["access_token", "refresh_token"]);
              if (!mounted) return;
              setUser(null);
              setToken(null);
            }
          }
        } else {
          // no access token saved
          setUser(null);
          setToken(null);
        }
      } catch {
        setUser(null);
        setToken(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, []);

  // ---- Foreground refresh (helps recover after app idle) ----
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;
      try {
        // Ping profile; if unauthorized, try refresh:
        await getProfile();
      } catch {
        const newAccess = await refreshAccessToken();
        if (newAccess) {
          setToken(newAccess);
          try {
            const profile = await getProfile();
            setUser(profile);
          } catch {
            // ignore; user will re-login if needed
          }
        }
      }
    });
    return () => sub.remove();
  }, []);

  // ---- Auth API exposed to the app ----
  const signIn = async (username, password) => {
    try {
      const data = await apiLogin(username, password); // { access, refresh }
      if (!data?.access) throw new Error("No access token returned.");
      await AsyncStorage.setItem("access_token", data.access);
      if (data.refresh) await AsyncStorage.setItem("refresh_token", data.refresh);
      setToken(data.access);

      // Load profile after login
      const profile = await getProfile();
      setUser(profile);

      return { success: true };
    } catch (err) {
      await AsyncStorage.multiRemove(["access_token", "refresh_token"]);
      setToken(null);
      setUser(null);
      return { success: false, error: err?.message || "Login failed" };
    }
  };

  const signOut = async () => {
    try { await apiLogout(); } catch {}
    await AsyncStorage.multiRemove(["access_token", "refresh_token"]);
    setToken(null);
    setUser(null);
  };

  const refreshProfile = async () => {
    try {
      const profile = await getProfile();
      setUser(profile);
      return profile;
    } catch {
      // Try refresh token if profile fetch failed (e.g., 401)
      const newAccess = await refreshAccessToken();
      if (newAccess) {
        setToken(newAccess);
        try {
          const profile = await getProfile();
          setUser(profile);
          return profile;
        } catch {
          setUser(null);
          return null;
        }
      }
      setUser(null);
      return null;
    }
  };

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: !!token,
      isStaff: !!user?.is_staff,
      signIn,
      signOut,
      refreshProfile,
      setUser,    // optional for screens that optimistically update
      setToken,   // optional if you need to force-set (rare)
    }),
    [user, token, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

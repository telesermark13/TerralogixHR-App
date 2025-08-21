// AuthContext.js
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  login as apiLogin,
  getProfile,
  logout as apiLogout,
  refreshAccessToken as apiRefresh,
  BASE_URL,
} from "./api";

const AuthContext = createContext();

async function tryRefresh() {
  try {
    const newAccess = await apiRefresh();
    return newAccess || null;
  } catch {
    return null;
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);     // profile object
  const [token, setToken] = useState(null);   // access token
  const [loading, setLoading] = useState(true);

  // Bootstrap session on mount
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const access = await AsyncStorage.getItem("access_token");
        if (!access) return;
        setToken(access);
        try {
          const profile = await getProfile();
          if (!alive) return;
          setUser(profile);
        } catch {
          // access may be expired → try refresh
          const newAccess = await tryRefresh();
          if (newAccess) {
            setToken(newAccess);
            const profile = await getProfile().catch(() => null);
            if (alive) setUser(profile);
          } else {
            await AsyncStorage.multiRemove(["access_token", "refresh_token"]);
            if (alive) {
              setToken(null);
              setUser(null);
            }
          }
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Sign in with username/password using your API
  const signIn = async (username, password) => {
    try {
      const data = await apiLogin(username, password); // { access, refresh }
      await AsyncStorage.setItem("access_token", data.access);
      if (data.refresh) await AsyncStorage.setItem("refresh_token", data.refresh);
      setToken(data.access);
      const profile = await getProfile();
      setUser(profile);
      return { success: true };
    } catch (e) {
      await AsyncStorage.multiRemove(["access_token", "refresh_token"]);
      setToken(null);
      setUser(null);
      return { success: false, error: e?.message || "Login failed" };
    }
  };

  // Sign out everywhere
  const signOut = async () => {
    try { await apiLogout(); } catch {}
    await AsyncStorage.multiRemove(["access_token", "refresh_token"]);
    setToken(null);
    setUser(null);
  };

  // Manual profile refresh (useful after edits)
  const refreshProfile = async () => {
    try {
      const profile = await getProfile();
      setUser(profile);
      return profile;
    } catch {
      const newAccess = await tryRefresh();
      if (newAccess) {
        setToken(newAccess);
        const profile = await getProfile().catch(() => null);
        setUser(profile);
        return profile;
      }
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
      setUser,  // optional: allow optimistic updates
      setToken, // optional: if you add axios interceptors later
    }),
    [user, token, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);

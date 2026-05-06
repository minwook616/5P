import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = logged out, object = logged in
  const [loading, setLoading] = useState(true);

  const checkSession = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      // If cookie-based session failed, try token-based (mobile clients)
      const token = localStorage.getItem("access_token");
      if (token) {
        api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
        try {
          const { data } = await api.get("/auth/me");
          setUser(data);
          return;
        } catch {
          // fallthrough to logged out
        }
      }
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkSession(); }, [checkSession]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    // persist tokens for mobile clients that don't accept cookies
    if (data.access_token) {
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token || "");
      api.defaults.headers.common["Authorization"] = `Bearer ${data.access_token}`;
    }
    setUser(data.user);
    return data.user;
  };

  const registerIsu = async (payload) => {
    const { data } = await api.post("/auth/register/isu", payload);
    if (data.access_token) {
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token || "");
      api.defaults.headers.common["Authorization"] = `Bearer ${data.access_token}`;
    }
    setUser(data.user);
    return data.user;
  };

  const registerInvite = async (payload) => {
    const { data } = await api.post("/auth/register/invite", payload);
    if (data.access_token) {
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token || "");
      api.defaults.headers.common["Authorization"] = `Bearer ${data.access_token}`;
    }
    setUser(data.user);
    return data.user;
  };

  const verifyOtp = async (code) => {
    const { data } = await api.post("/auth/verify-otp", { code });
    // verify-otp returns the public user object
    setUser(data);
    return data;
  };

  const resendOtp = async () => api.post("/auth/resend-otp");

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    // clear token fallback and auth header
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    delete api.defaults.headers.common["Authorization"];
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, registerIsu, registerInvite, logout, verifyOtp, resendOtp, refresh: checkSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

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
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkSession(); }, [checkSession]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setUser(data.user);
    return data.user;
  };

  const registerIsu = async (payload) => {
    const { data } = await api.post("/auth/register/isu", payload);
    setUser(data.user);
    return data.user;
  };

  const registerInvite = async (payload) => {
    const { data } = await api.post("/auth/register/invite", payload);
    setUser(data.user);
    return data.user;
  };

  const verifyOtp = async (code) => {
    const { data } = await api.post("/auth/verify-otp", { code });
    setUser(data);
    return data;
  };

  const resendOtp = async () => api.post("/auth/resend-otp");

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, registerIsu, registerInvite, logout, verifyOtp, resendOtp, refresh: checkSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

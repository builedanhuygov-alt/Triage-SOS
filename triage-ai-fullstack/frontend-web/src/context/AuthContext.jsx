import React, { createContext, useContext, useState, useMemo, useCallback } from "react";
import { api, apiLogin, apiMe, setToken } from "../services/api.js";
import { authenticateSocket } from "../services/socket.js";

const AuthContext = createContext(null);
const KEY = "triage-auth";

// Map role demo (RoleSwitcher) -> tài khoản demo thật
const ROLE_EMAIL = {
  ceo: "ceo@hospital.demo",
  admin: "admin@hospital.demo",
  er: "doctor.er@hospital.demo",
  cardio: "doctor.cardio@hospital.demo",
  trauma: "doctor.er@hospital.demo",
  respiratory: "doctor.er@hospital.demo",
  neuro: "doctor.er@hospital.demo",
  icu: "doctor.er@hospital.demo",
  nurse: "nurse@hospital.demo",
};

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

/** Session thật (JWT demo) — thay cho role giả lập trước đây. */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(load);

  const apply = useCallback((s) => {
    setSession(s);
    setToken(s?.token || null);
    authenticateSocket(s?.token || null);
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch {}
  }, []);

  const loginAs = useCallback(async (roleId) => {
    const email = ROLE_EMAIL[roleId] || "ceo@hospital.demo";
    const r = await apiLogin(email, "demo123");
    apply(r);
    return r;
  }, [apply]);

  // Đăng nhập Demo Portal DEMO1 bằng username hoặc email + mật khẩu demo
  const loginWith = useCallback(async (identifier, password) => {
    const id = String(identifier || "").trim();
    const body = id.includes("@") ? { email: id, password } : { username: id, password };
    const r = await api.post("/api/auth/login", body).then((x) => x.data.data);
    apply(r);
    return r;
  }, [apply]);

  const refresh = useCallback(async () => {
    try {
      const me = await apiMe();
      setSession((s) => (s ? { ...s, user: me } : s));
    } catch {
      apply(null);
    }
  }, [apply]);

  const logout = useCallback(() => apply(null), [apply]);
  const value = useMemo(
    () => ({ session, user: session?.user || null, token: session?.token || null, loginAs, loginWith, logout, refresh }),
    [session, loginAs, loginWith, logout, refresh]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}

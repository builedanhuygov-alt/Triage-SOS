import React, { createContext, useContext, useState, useMemo, useCallback } from "react";
import { apiLogin, setToken } from "../services/api.js";
import { socket } from "../services/realtime.js";

const SessionContext = createContext(null);
const KEY = "triage-session";

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

/** Session patient/caregiver — gate trước khi vào 7 tabs. */
export function SessionProvider({ children }) {
  const [session, setSession] = useState(load);

  const apply = useCallback((s) => {
    setSession(s);
    setToken(s?.token || null);
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch {}
  }, []);

  const login = useCallback(async (email, password = "demo123") => {
    const r = await apiLogin(email, password);
    apply(r);
    // Socket auth để server biết đây là ai (reconnect 1 lần)
    try {
      socket.auth = { token: r.token };
      if (socket.connected) socket.disconnect().connect();
    } catch {}
    return r;
  }, [apply]);

  const logout = useCallback(() => apply(null), [apply]);
  const value = useMemo(
    () => ({ session, user: session?.user || null, login, logout }),
    [session, login, logout]
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be inside SessionProvider");
  return ctx;
}

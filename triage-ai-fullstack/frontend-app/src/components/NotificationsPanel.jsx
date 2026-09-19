import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, CheckCheck } from "lucide-react";
import { api, fetchMyNotifications } from "../services/api.js";
import { socket } from "../services/realtime.js";

const CAT_ICON = { Emergency: "🚑", Appointment: "📅", Medication: "💊", Lab: "🧪", "Doctor update": "🩺", Security: "🛡️", System: "⚙️" };
// Điều hướng tới tab chứa tài nguyên liên quan
const TAB_FOR = { Emergency: "sos", Appointment: "profile", Medication: "meds", Lab: "medicalid", "Doctor update": "sos" };

function dayGroup(at) {
  const d = new Date(at);
  const now = new Date();
  return d.toDateString() === now.toDateString() ? "TODAY" : "EARLIER";
}

/**
 * NotificationsPanel — chuông + panel, realtime merge theo id, offline đọc cache.
 * Backend là source of truth (GET latest + merge, không duplicate).
 */
export function NotifBell({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  const pull = useCallback(async () => {
    try {
      const d = await fetchMyNotifications();
      // /api/me/* trả mảng thô (tương thích cũ); /api/notifications trả {items, unread}
      const arr = Array.isArray(d) ? d : d.items || [];
      setItems((prev) => {
        const map = new Map(prev.map((n) => [n.id, n]));
        arr.forEach((n) => map.set(n.id, { ...(map.get(n.id) || {}), ...n }));
        const next = [...map.values()].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 50);
        try {
          localStorage.setItem("triage-notifs", JSON.stringify(next));
        } catch {}
        return next;
      });
      setUnread(Array.isArray(d) ? arr.filter((n) => !n.read).length : d.unread || 0);
    } catch {
      try {
        setItems(JSON.parse(localStorage.getItem("triage-notifs") || "[]"));
      } catch {}
    }
  }, []);

  useEffect(() => {
    pull();
    const onNew = (n) => {
      if (!n?.id) return;
      setItems((prev) => {
        if (prev.some((x) => x.id === n.id)) return prev;
        const next = [n, ...prev].slice(0, 50);
        try {
          localStorage.setItem("triage-notifs", JSON.stringify(next));
        } catch {}
        return next;
      });
      setUnread((u) => u + 1);
    };
    socket.on("NOTIFICATION_CREATED", onNew);
    socket.on("connect", pull);
    return () => {
      socket.off("NOTIFICATION_CREATED", onNew);
      socket.off("connect", pull);
    };
  }, [pull]);

  const openRes = async (n) => {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      try {
        await api.post(`/api/notifications/${n.id}/read`);
      } catch {}
    }
    if (onNavigate && TAB_FOR[n.category]) {
      setOpen(false);
      onNavigate(TAB_FOR[n.category]);
    }
  };

  const readAll = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
    try {
      await api.post("/api/notifications/read-all");
    } catch {}
  };

  const today = items.filter((n) => dayGroup(n.at) === "TODAY");
  const earlier = items.filter((n) => dayGroup(n.at) !== "TODAY");

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label="Thông báo"
        className="relative flex h-9 w-9 items-center justify-center rounded-2xl bg-white/20">
        <Bell className="h-5 w-5 text-white" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-yellow-300 px-1 font-mono text-[10px] font-black text-zinc-900">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
            className="absolute right-0 top-11 z-50 max-h-[380px] w-[300px] overflow-y-auto rounded-3xl bg-white p-3 text-zinc-900 shadow-2xl ring-1 ring-black/10">
            <div className="flex items-center justify-between px-1">
              <p className="text-sm font-black tracking-tight">Thông báo</p>
              <button onClick={readAll} className="flex items-center gap-1 text-[11px] font-bold text-blue-600">
                <CheckCheck className="h-3.5 w-3.5" /> Đọc hết
              </button>
            </div>
            {[["TODAY", today], ["EARLIER", earlier]].map(([label, list]) => (
              <div key={label}>
                {list.length > 0 && <p className="px-1 pb-1 pt-2 text-[10px] font-black tracking-widest text-zinc-400">{label}</p>}
                {list.map((n) => (
                  <button key={n.id} onClick={() => openRes(n)}
                    className={`mb-1.5 flex w-full items-start gap-2 rounded-2xl p-2.5 text-left ${n.read ? "bg-zinc-50" : "bg-blue-50/70 ring-1 ring-blue-100"}`}>
                    <span className="text-lg">{CAT_ICON[n.category] || "🔔"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">{n.title}</span>
                      <span className="block truncate text-[11px] text-zinc-500">{n.body}</span>
                    </span>
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                  </button>
                ))}
              </div>
            ))}
            {items.length === 0 && <p className="p-4 text-center text-xs text-zinc-400">Chưa có thông báo nào.</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

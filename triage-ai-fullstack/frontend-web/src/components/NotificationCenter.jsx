import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BellRing, CheckCheck } from "lucide-react";
import { fetchNotifications, markNotifRead, markAllNotifRead } from "../services/api.js";
import { socket } from "../services/socket.js";

const CATS = ["All", "Emergency", "Appointment", "Medication", "Doctor update", "Security", "System"];
const CAT_ICON = { Emergency: "🚨", Appointment: "📅", Medication: "💊", Lab: "🧪", "Doctor update": "🩺", Security: "🛡️", System: "⚙️" };

/** NotificationCenter web — RBAC từ server, realtime, unread badge. */
export default function NotificationCenter() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState("All");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await fetchNotifications();
      setItems(d.items || []);
      setUnread(d.unread || 0);
    } catch {
      setError("Cần đăng nhập staff.");
    }
  }, []);

  useEffect(() => {
    load();
    const onNew = (n) => {
      setItems((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev].slice(0, 50)));
      if (!n.read) setUnread((u) => u + 1);
    };
    socket.on("NOTIFICATION_CREATED", onNew);
    socket.on("connect", load);
    return () => {
      socket.off("NOTIFICATION_CREATED", onNew);
      socket.off("connect", load);
    };
  }, [load]);

  const readOne = async (id) => {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      await markNotifRead(id);
    } catch {}
  };
  const readAll = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
    try {
      await markAllNotifRead();
    } catch {}
  };

  const shown = filter === "All" ? items : items.filter((n) => n.category === filter);

  return (
    <div className="rounded-2xl bg-black/40 p-3.5 ring-1 ring-white/10">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-black text-white">
          <BellRing className="h-4 w-4 text-amber-300" /> Thông báo {unread > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 font-mono text-[10px] text-white">{unread}</span>
          )}
        </p>
        <button onClick={readAll} className="flex items-center gap-1 text-[11px] font-bold text-cyan-300 hover:text-cyan-200">
          <CheckCheck className="h-3.5 w-3.5" /> Đọc hết
        </button>
      </div>
      {error && <p className="mt-1.5 text-[11px] text-red-300">{error}</p>}
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
        {CATS.map((c) => (
          <button key={c} onClick={() => setFilter(c)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${filter === c ? "bg-white text-zinc-900" : "bg-white/10 text-zinc-300"}`}>
            {c}
          </button>
        ))}
      </div>
      <div className="mt-1.5 max-h-64 space-y-1.5 overflow-y-auto">
        <AnimatePresence initial={false}>
          {shown.map((n) => (
            <motion.button key={n.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              onClick={() => !n.read && readOne(n.id)}
              className={`flex w-full items-start gap-2 rounded-xl p-2.5 text-left ring-1 ${n.read ? "bg-white/[0.03] ring-white/5" : "bg-white/[0.07] ring-cyan-400/20"}`}>
              <span className="text-base">{CAT_ICON[n.category] || "🔔"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-white">{n.title}</span>
                <span className="block truncate text-[11px] text-zinc-400">{n.body}</span>
                <span className="font-mono text-[10px] text-zinc-500">{n.at ? new Date(n.at).toLocaleTimeString("vi-VN") : ""} • {n.category}</span>
              </span>
              {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-cyan-400" />}
            </motion.button>
          ))}
        </AnimatePresence>
        {shown.length === 0 && <p className="p-3 text-center text-[11px] text-zinc-500">Không có thông báo.</p>}
      </div>
    </div>
  );
}

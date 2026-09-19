import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Siren, CalendarCheck, Pill, Bell, HeartPulse, ChevronRight } from "lucide-react";
import { useAppointmentSync } from "../hooks/useAppointmentSync.js";

function readCache(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Chào buổi sáng";
  if (h < 13) return "Chào buổi trưa";
  if (h < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

/**
 * HomeView — trang chủ Super App: SOS + lịch sắp tới + thuốc hôm nay
 * + thông báo mới + snapshot sức khỏe. Mọi tile đều điều hướng ≤2 chạm.
 */
export default function HomeView({ user, onNavigate }) {
  const { serverAppts } = useAppointmentSync(!!user);
  const [meds] = useState(() => readCache("triage-meds-v2", []));
  const [notifs] = useState(() => readCache("triage-notifs", []));
  const [metrics] = useState(() => readCache("triage-metrics-v2", readCache("triage-metrics", [])));
  const todayStr = new Date().toISOString().slice(0, 10);

  const nextAppt = serverAppts
    .filter((a) => !["COMPLETED", "CANCELLED"].includes(a.status) && (a.date || "") >= todayStr)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
  const medsDue = meds.filter((m) => m.takenDate !== todayStr).length;
  const latestNotif = notifs[0];
  const lastMetric = metrics[metrics.length - 1];

  const tiles = [
    nextAppt && {
      icon: CalendarCheck, tint: "bg-blue-50 text-blue-700",
      title: "Lịch hẹn sắp tới",
      sub: `${nextAppt.date?.slice(8, 10)}/${nextAppt.date?.slice(5, 7)} • ${nextAppt.time} — ${nextAppt.type}`,
      tab: "profile",
    },
    {
      icon: Pill, tint: "bg-emerald-50 text-emerald-700",
      title: "Thuốc hôm nay",
      sub: meds.length === 0 ? "Chưa có đơn nào" : medsDue === 0 ? "Đã uống đủ 🎉" : `Còn ${medsDue} lượt chưa uống`,
      tab: "meds",
    },
    latestNotif && {
      icon: Bell, tint: "bg-amber-50 text-amber-700",
      title: "Thông báo mới nhất",
      sub: latestNotif.title,
      tab: "sos",
    },
    lastMetric && {
      icon: HeartPulse, tint: "bg-rose-50 text-rose-600",
      title: "Sức khỏe",
      sub: `♥ ${lastMetric.hr ?? "?"} bpm • SpO2 ${lastMetric.spo2 ?? "?"}%`,
      tab: "metrics",
    },
  ].filter(Boolean);

  return (
    <div className="h-full overflow-y-auto px-4 pb-32 pt-5">
      <p className="text-xs text-zinc-500">{greeting()},</p>
      <h1 className="text-xl font-black tracking-tight text-zinc-900">
        {user?.name || "Nguyễn Văn A"}
      </h1>

      {/* SOS hero */}
      <motion.button whileTap={{ scale: 0.97 }} onClick={() => onNavigate("sos")} aria-label="Mở màn hình SOS khẩn cấp"
        className="mt-3 flex w-full items-center gap-3 rounded-3xl bg-gradient-to-r from-red-600 to-orange-500 p-4 text-left text-white shadow-lg shadow-red-500/25">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20">
          <Siren className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-black tracking-tight">🚨 EMERGENCY / SOS</span>
          <span className="block text-xs text-white/85">Cần giúp đỡ khẩn cấp? Nhấn giữ 1 giây</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0" />
      </motion.button>

      {/* Tiles */}
      <div className="mt-3 space-y-2.5">
        {tiles.map((t, i) => (
          <motion.button key={t.title} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            transition={{ delay: Math.min(i * 0.06, 0.3) }}
            whileTap={{ scale: 0.98 }} onClick={() => onNavigate(t.tab)}
            className="flex w-full items-center gap-3 rounded-3xl bg-white p-3.5 text-left shadow-sm ring-1 ring-black/5">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${t.tint}`}>
              <t.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black tracking-tight text-zinc-900">{t.title}</span>
              <span className="block truncate text-xs text-zinc-500">{t.sub}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />
          </motion.button>
        ))}
        {tiles.length === 0 && (
          <p className="rounded-3xl bg-white p-5 text-center text-xs text-zinc-400 ring-1 ring-black/5">
            Chưa có dữ liệu nào — khám phá các tab bên dưới nhé.
          </p>
        )}
      </div>

      {/* Quick actions */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          ["Viện gần", "hospitals"],
          ["Hồ sơ", "medicalid"],
          ["AI Chat", "chat"],
        ].map(([label, tab]) => (
          <button key={tab} onClick={() => onNavigate(tab)}
            className="rounded-2xl bg-zinc-950 py-3 text-xs font-black text-white">
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

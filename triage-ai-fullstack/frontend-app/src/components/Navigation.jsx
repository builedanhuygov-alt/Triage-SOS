import React from "react";
import { motion } from "framer-motion";
import { Siren, MapPin, Pill, Activity, IdCard, Bot, User } from "lucide-react";

export const TABS = [
  { id: "sos", label: "SOS", icon: Siren },
  { id: "hospitals", label: "Viện", icon: MapPin },
  { id: "meds", label: "Thuốc", icon: Pill },
  { id: "metrics", label: "Sức khỏe", icon: Activity },
  { id: "medicalid", label: "BHYT", icon: IdCard },
  { id: "chat", label: "AI Chat", icon: Bot },
  { id: "profile", label: "Tôi", icon: User },
];

/**
 * Navigation — Floating Dock 7 tabs, cuộn ngang khi hẹp.
 * Giữ khung max-w-md: dock bo tròn nổi trên nền, pill active trượt spring.
 */
export default function Navigation({ tab, setTab, accent = "red" }) {
  const activeText = accent === "blue" ? "text-blue-600" : accent === "green" ? "text-emerald-600" : "text-red-600";
  const activeBg = accent === "blue" ? "bg-blue-50 ring-blue-100" : accent === "green" ? "bg-emerald-50 ring-emerald-100" : "bg-red-50 ring-red-100";
  return (
    <nav className="absolute inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
      <div className="flex gap-0.5 overflow-x-auto rounded-[1.75rem] border border-zinc-200/70 bg-white/90 px-1.5 py-1.5 shadow-2xl shadow-zinc-900/10 backdrop-blur-xl">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex min-w-[52px] flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[9px] font-bold tracking-tight transition ${
                active ? activeText : "text-zinc-400 hover:text-zinc-600"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="dock-pill"
                  transition={{ type: "spring", stiffness: 450, damping: 32 }}
                  className={`absolute inset-0 rounded-2xl ring-1 ${activeBg}`}
                />
              )}
              <span className="relative">
                <Icon className="h-5 w-5" />
                {t.id === "sos" && (
                  <span className="absolute -right-1 -top-1 flex h-2 w-2">
                    <span className="absolute h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                  </span>
                )}
              </span>
              <span className="relative">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

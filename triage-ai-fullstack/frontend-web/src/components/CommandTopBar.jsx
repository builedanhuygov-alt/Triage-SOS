import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Building2, ShieldAlert, Radio, Bell } from "lucide-react";
import RoleSwitcher from "./RoleSwitcher.jsx";
import NotificationCenter from "./NotificationCenter.jsx";

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now.toLocaleTimeString("vi-VN");
}

/** TopBar enterprise: command header + online + last update + alerts + role + override. */
export default function CommandTopBar({ connected, override, setOverride, patientCount, isCeo, lastUpdate }) {
  const [showNotif, setShowNotif] = useState(false);
  return (
    <div className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600">
            <Building2 className="h-5 w-5 text-white" />
          </span>
          <div>
            <p className="text-sm font-black tracking-tight text-white">
              HOSPITAL COMMAND CENTER{" "}
              <span className="rounded bg-white/10 px-1.5 py-0.5 align-middle text-[9px] font-black tracking-widest text-zinc-400">DEMO DATA</span>{" "}
              <span className={`text-[11px] ${connected ? "text-emerald-400" : "text-red-400"}`}>
                ● {connected ? "SYSTEM ONLINE" : "OFFLINE"}
              </span>
            </p>
            <p className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-400">
              <Radio className="h-3 w-3" />
              Last update: {lastUpdate || "—"} • {useClock()} • {patientCount} ca trong tầm quyền
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowNotif((s) => !s)} title="Trung tâm thông báo"
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/10 hover:bg-white/15">
            <Bell className="h-4 w-4 text-zinc-200" />
          </button>
          <RoleSwitcher />
          {isCeo && (
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => setOverride((o) => !o)}
              className={`rounded-full bg-gradient-to-r px-5 py-2.5 text-xs font-black uppercase tracking-tight text-white ${override ? "animate-pulse from-red-600 to-red-500 shadow-[0_0_25px_rgba(239,68,68,.6)]" : "from-red-500/80 to-orange-500/80 ring-1 ring-white/20"}`}>
              <span className="flex items-center gap-1.5"><ShieldAlert className="h-4 w-4" />{override ? "Đang chặn luồng" : "Emergency Override"}</span>
            </motion.button>
          )}
        </div>
      </div>
      {showNotif && <div className="mt-3"><NotificationCenter /></div>}
    </div>
  );
}

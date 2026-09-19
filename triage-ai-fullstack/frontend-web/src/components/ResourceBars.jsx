import React from "react";
import { motion } from "framer-motion";
import { Droplets } from "lucide-react";

function ThinBar({ label, free, total }) {
  const pct = total === 0 ? 0 : Math.round((free / total) * 100);
  const crit = pct < 20;
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3.5 ring-1 ring-white/10 backdrop-blur-xl">
      <div className="flex justify-between text-xs">
        <span className="font-semibold tracking-tight text-zinc-300">{label}</span>
        <motion.span key={`${free}/${total}`} initial={{ scale: 1.25 }} animate={{ scale: 1 }}
          className={`font-mono font-bold ${crit ? "text-red-400" : "text-zinc-100"}`}>{free}/{total}</motion.span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <motion.div animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 200, damping: 25 }}
          className={`h-full rounded-full ${crit ? "animate-pulse bg-red-500" : pct < 50 ? "bg-amber-400" : "bg-emerald-400"}`} />
      </div>
      {crit && <p className="mt-1.5 animate-pulse text-[11px] font-bold text-red-400">Dưới 20% — cần bổ sung</p>}
    </div>
  );
}

/** ResourceBars: ICU / máy thở / máu — nảy số khi UPDATE_RESOURCES về. */
export default function ResourceBars({ stats }) {
  if (!stats) return null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ThinBar label="Giường ICU" free={stats.icu.free} total={stats.icu.total} />
        <ThinBar label="Máy thở rảnh" free={stats.ventilators.free} total={stats.ventilators.total} />
        <div className="rounded-2xl bg-white/[0.04] p-3.5 ring-1 ring-white/10 backdrop-blur-xl">
          <div className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-zinc-300">
            <Droplets className="h-3.5 w-3.5 text-rose-400" /> Dự trữ máu
          </div>
          <p className="mt-1 font-mono text-lg font-black text-zinc-100">{stats.blood}%</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <motion.div animate={{ width: `${stats.blood}%` }} className="h-full rounded-full bg-rose-400" />
          </div>
        </div>
      </div>
    </div>
  );
}

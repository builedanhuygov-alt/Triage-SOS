import React from "react";
import { motion } from "framer-motion";
import { Droplets } from "lucide-react";
import Card from "../ui/Card.jsx";

function ThinBar({ label, free, total }) {
  const pct = Math.round((free / total) * 100);
  const crit = pct < 20;
  return (
    <Card className="p-3.5">
      <div className="flex justify-between text-xs">
        <span className="font-semibold tracking-tight text-zinc-300">{label}</span>
        <span className={`font-mono font-bold ${crit ? "text-red-400" : "text-zinc-100"}`}>{free}/{total}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
          className={`h-full rounded-full ${crit ? "animate-pulse bg-red-500" : pct < 50 ? "bg-amber-400" : "bg-emerald-400"}`} />
      </div>
      {crit && <p className="mt-1.5 animate-pulse text-[11px] font-bold text-red-400">Dưới 20% — cần bổ sung</p>}
    </Card>
  );
}

/** ResourceStatus: ICU / máy thở / nhân sự + kho máu O-A-B-AB. */
export default function ResourceStatus({ resources }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ThinBar label="Giường ICU" free={resources.icu.free} total={resources.icu.total} />
        <ThinBar label="Máy thở rảnh" free={resources.vent.free} total={resources.vent.total} />
        <ThinBar label="Bác sĩ trực" free={resources.doctors.free} total={resources.doctors.total} />
        <ThinBar label="Điều dưỡng trực" free={resources.nurses.free} total={resources.nurses.total} />
      </div>
      <Card className="p-4">
        <p className="flex items-center gap-2 text-sm font-bold tracking-tight text-white"><Droplets className="h-4 w-4 text-rose-400" /> Dự trữ máu theo nhóm</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {resources.blood.map((b) => {
            const crit = b.pct < 20;
            return (
              <div key={b.type}>
                <div className="flex justify-between text-xs font-bold text-zinc-300"><span>Nhóm {b.type}</span><span className={crit ? "text-red-400" : ""}>{b.pct}%</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-white/10">
                  <div className={`h-full rounded-full ${crit ? "animate-pulse bg-red-500" : b.pct < 50 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${b.pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

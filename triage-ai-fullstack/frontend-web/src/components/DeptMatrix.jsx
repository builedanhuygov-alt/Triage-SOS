import React from "react";
import { motion } from "framer-motion";
import { LayoutGrid } from "lucide-react";
import { DEPTS, DEPT_BEDS, deptOf } from "../rbac/roles.js";

/**
 * DeptMatrix — góc nhìn toàn cục cho CEO:
 * ma trận ca chờ + giường từng khoa trên cùng một màn hình.
 */
export default function DeptMatrix({ patients, deptBeds }) {
  const counts = {};
  Object.keys(DEPTS).forEach((d) => {
    counts[d] = patients.filter(
      (p) => deptOf(p) === d && ["PENDING_TRIAGE", "DEPARTMENT_ROUTED", "waiting"].includes(p.status)
    ).length;
  });

  return (
    <div className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10 backdrop-blur-xl">
      <h2 className="flex items-center gap-2 text-sm font-black tracking-tight text-white">
        <LayoutGrid className="h-4 w-4 text-amber-300" /> Ma trận toàn viện — ca chờ & giường theo khoa
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {Object.values(DEPTS).map((d, i) => {
          const beds = (deptBeds || DEPT_BEDS)[d.id] || { free: 0, total: 1 };
          const occ = Math.round(((beds.total - beds.free) / beds.total) * 100);
          const hot = counts[d.id] > 0 && occ >= 75;
          return (
            <motion.div
              key={d.id}
              initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.05 }}
              className={`rounded-2xl p-3 ring-1 backdrop-blur-xl ${hot ? "bg-red-500/10 ring-red-500/30" : "bg-white/[0.04] ring-white/10"}`}
            >
              <p className="text-xs font-black tracking-tight text-zinc-200">{d.label}</p>
              <p className="mt-1 font-mono text-xl font-black text-white">
                {counts[d.id]} <span className="text-[10px] font-bold text-zinc-500">ca chờ</span>
              </p>
              <p className={`font-mono text-[11px] ${occ >= 80 ? "text-red-400" : "text-zinc-400"}`}>
                🛏️ {beds.free}/{beds.total} • {occ}%
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

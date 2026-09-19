import React from "react";
import { motion } from "framer-motion";
import { Siren, BedDouble, Clock, Activity } from "lucide-react";
import { DEPT_BEDS, DEPTS, OPEN_STATES, scopeDept } from "../rbac/roles.js";
import { useRole } from "../context/RoleContext.jsx";

function Kpi({ icon: Icon, label, value, sub, accent }) {
  return (
    <motion.div whileHover={{ scale: 1.02 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-tight text-zinc-400">
        <Icon className={`h-4 w-4 ${accent}`} />{label}
      </div>
      <motion.p key={value} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="mt-1 text-2xl font-black tracking-tight text-white">{value}</motion.p>
      <p className="text-[11px] text-zinc-500">{sub}</p>
    </motion.div>
  );
}

/** Metrics lọc theo role: CEO xem toàn viện, BS xem khoa mình. */
export default function MetricsGrid({ stats, patients, deptBeds }) {
  const { roleId, visible } = useRole();
  const mine = visible(patients);

  if (roleId === "ceo" || roleId === "admin") {
    const waiting = patients.filter((p) => OPEN_STATES.includes(p.status)).length;
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi icon={Siren} label="Ca cấp cứu toàn viện" value={patients.length} sub={`${waiting} chờ xử lý`} accent="text-rose-400" />
        <Kpi icon={BedDouble} label="ICU toàn viện" value={`${stats?.icu.free ?? "-"}/${stats?.icu.total ?? "-"}`} sub="Giường trống" accent="text-cyan-300" />
        <Kpi icon={Clock} label="Chờ trung bình" value={`${stats?.waiting ?? 15} phút`} sub="Mục tiêu < 10 phút" accent="text-amber-300" />
      </div>
    );
  }

  const scope = scopeDept(roleId); // nurse xem phạm vi khoa Cấp cứu
  const beds = deptBeds[scope] || DEPT_BEDS[scope] || { free: 0, total: 1 };
  const occ = Math.round(((beds.total - beds.free) / beds.total) * 100);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Kpi icon={Siren} label={`Ca chờ — ${DEPTS[scope].label}`} value={mine.filter((p) => OPEN_STATES.includes(p.status)).length} sub={`${mine.length} ca trong tầm quyền`} accent="text-rose-400" />
      <Kpi icon={BedDouble} label={`Giường trống — ${DEPTS[scope].label}`} value={`${beds.free}/${beds.total}`} sub="Giường khoa" accent="text-cyan-300" />
      <Kpi icon={Activity} label="Công suất khoa" value={`${occ}%`} sub={occ >= 80 ? "Sắp quá tải" : "Ổn định"} accent="text-amber-300" />
    </div>
  );
}

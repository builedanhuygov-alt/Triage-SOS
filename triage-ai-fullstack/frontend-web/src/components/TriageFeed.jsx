import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radar, Stethoscope } from "lucide-react";
import { deptOf, DEPTS, STATUS_LABEL, OPEN_STATES, scopeDept } from "../rbac/roles.js";
import { useRole } from "../context/RoleContext.jsx";

const spring = { type: "spring", stiffness: 300, damping: 28 };

const SEV = {
  critical: { label: "KHẨN CẤP", cls: "bg-red-500/15 text-red-300" },
  medium: { label: "TRUNG BÌNH", cls: "bg-amber-400/15 text-amber-300" },
  low: { label: "NHẸ", cls: "bg-emerald-500/15 text-emerald-300" },
};

/** Feed ca bệnh đã lọc theo role — bấm card mở Doctor Modal. */
export default function TriageFeed({ patients, onOpen }) {
  const { roleId, visible } = useRole();
  // Feed chỉ ca đang mở (FLAGGED/DISMISSED nằm ở moderation)
  const mine = visible(patients).filter((p) => OPEN_STATES.includes(p.status));
  const deptLabel = DEPTS[scopeDept(roleId)]?.label;

  return (
    <div className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10 backdrop-blur-xl">
      <h2 className="flex items-center gap-2 text-sm font-black tracking-tight text-white">
        <Radar className="h-4 w-4 text-cyan-300" />
        Real-time Triage Feed — {mine.length} ca {deptLabel && <span className="text-zinc-500">(khoa {deptLabel})</span>}
      </h2>
      <motion.div layout className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <AnimatePresence initial={false}>
          {mine.map((p) => {
            const sev = SEV[p.severity] || SEV.medium;
            const dept = DEPTS[deptOf(p)];
            return (
              <motion.button
                key={p.id} layout onClick={() => onOpen(p)}
                initial={{ y: -32, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ x: 60, opacity: 0 }}
                transition={spring} whileHover={{ scale: 1.015 }}
                className={`p-4 text-left rounded-2xl bg-white/[0.05] ring-1 backdrop-blur-xl ${p.severity === "critical" ? "ring-red-500/30" : "ring-white/10"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-black text-cyan-300">{p.id}</span>
                  <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-bold text-violet-300">🦴 {dept.label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${sev.cls}`}>{sev.label}</span>
                </div>
                <p className="mt-1.5 text-[13px] font-semibold tracking-tight text-white">{p.symptom}</p>
                <div className="mt-1.5 flex flex-wrap gap-2 font-mono text-[11px] text-zinc-300">
                  <span className="rounded-lg bg-white/5 px-2 py-1">ETA {p.eta}</span>
                  <span className="rounded-lg bg-white/5 px-2 py-1">{STATUS_LABEL[p.status] || p.status}</span>
                  {p.notes && <span className="rounded-lg bg-white/5 px-2 py-1">📝 có y lệnh</span>}
                  {p.status === "referring" && p.referral && (
                    <span className="rounded-lg bg-orange-500/15 px-2 py-1 text-orange-300">🚀 → {p.referral.hospital?.name || "tuyến trên"}</span>
                  )}
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-cyan-300/80">
                  <Stethoscope className="h-3.5 w-3.5" /> Bấm để xử lý y lệnh
                </p>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </motion.div>
      {mine.length === 0 && (
        <p className="mt-3 rounded-xl bg-white/5 p-4 text-center text-sm text-zinc-400">
          {deptLabel ? `Khoa ${deptLabel} hiện không có ca chờ.` : "✅ Radar trống — tất cả ca đã xử lý."}
        </p>
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Pill, CheckCircle2, PackageCheck } from "lucide-react";
import { api } from "../services/api.js";
import { socket } from "../services/socket.js";

/**
 * PharmacyView — hàng chờ đơn thuốc: VERIFY -> DISPENSE.
 * Dược sĩ không xem full record, chỉ đơn + bệnh nhân liên quan.
 */
const NEXT = { active: "verified", verified: "dispensed" };
const STATE_CLS = { active: "bg-amber-400/15 text-amber-300", verified: "bg-blue-400/15 text-blue-300", dispensed: "bg-emerald-500/15 text-emerald-300", stopped: "bg-zinc-500/15 text-zinc-400" };
const STATE_LABEL = { active: "PENDING", verified: "VERIFIED", dispensed: "DISPENSED", stopped: "CANCELLED" };

export default function PharmacyView({ patients }) {
  const [meds, setMeds] = useState([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      // Gom đơn từ các ca đang mở (demo: qua record từng ca)
      const all = [];
      for (const p of (patients || []).slice(0, 10)) {
        const r = await api.get(`/api/patients/${encodeURIComponent(p.id)}/record`).then((x) => x.data.data);
        (r.medications || []).forEach((m) => all.push({ ...m, emergencyId: p.id }));
      }
      setMeds(all);
    } catch {
      setError("Cần đăng nhập staff.");
    }
  }, [patients]);

  useEffect(() => {
    load();
    const refresh = () => load();
    socket.on("MEDICATION_UPDATED", refresh);
    return () => socket.off("MEDICATION_UPDATED", refresh);
  }, [load]);

  const advance = async (m) => {
    const next = NEXT[m.status];
    if (!next) return;
    try {
      await api.patch(`/api/medications/${m.id}`, { status: next });
    } catch {
      setError("Cập nhật thất bại (quyền/kết nối).");
    }
  };

  const open = meds.filter((m) => m.status === "active" || m.status === "verified");

  return (
    <div className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10 backdrop-blur-xl">
      <h2 className="flex items-center gap-2 text-sm font-black tracking-tight text-white">
        <Pill className="h-4 w-4 text-fuchsia-300" /> Pharmacy — {open.length} đơn chờ xử lý
      </h2>
      {error && <p className="mt-2 rounded-xl bg-red-500/15 p-2 text-xs font-bold text-red-300">{error}</p>}
      <div className="mt-3 space-y-2">
        {open.length === 0 && <p className="rounded-xl bg-white/5 p-4 text-center text-sm text-zinc-400">Hết đơn chờ. 🎉</p>}
        {open.map((m, i) => (
          <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.05, 0.3) }}
            className="flex items-center gap-3 rounded-2xl bg-white/[0.05] p-3 ring-1 ring-white/10">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-black text-white">{m.name} <span className="font-mono font-bold text-zinc-400">{m.dosage}</span></p>
              <p className="font-mono text-[11px] text-zinc-500">{m.emergencyId} • {m.schedule}</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${STATE_CLS[m.status] || STATE_CLS.active}`}>
              {STATE_LABEL[m.status] || m.status}
            </span>
            <button onClick={() => advance(m)}
              className="flex shrink-0 items-center gap-1 rounded-xl bg-fuchsia-500/20 px-3 py-2 text-[11px] font-black text-fuchsia-200 ring-1 ring-fuchsia-400/30 hover:bg-fuchsia-500/30">
              {m.status === "active" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <PackageCheck className="h-3.5 w-3.5" />}
              {m.status === "active" ? "Duyệt" : "Phát thuốc"}
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

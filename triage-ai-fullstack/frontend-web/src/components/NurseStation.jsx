import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HeartHandshake, BedDouble, Pill, TriangleAlert, CheckCircle2 } from "lucide-react";
import { api } from "../services/api.js";
import { socket } from "../services/socket.js";
import { useRole } from "../context/RoleContext.jsx";
import { scopeDept, DEPTS, deptOf } from "../rbac/roles.js";

/**
 * NurseStation — điều dưỡng xem nhanh ca cần xử lý trong phạm vi khoa.
 * Đọc: patients/feed + beds + meds. Ghi: gán giường (PATCH beds), xác nhận thuốc (PATCH meds).
 */
export default function NurseStation({ patients }) {
  const { roleId, visible } = useRole();
  const scope = scopeDept(roleId === "ceo" || roleId === "admin" ? "er" : roleId);
  const [beds, setBeds] = useState([]);
  const [meds, setMeds] = useState([]);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      const [b, m] = await Promise.all([
        api.get("/api/beds").then((r) => r.data.data.beds),
        api.get("/api/meta").then(() => []),
      ]);
      setBeds(b);
      setMeds(m);
    } catch {
      setError("Cần đăng nhập staff (CEO/Admin/Nurse).");
    }
  }, []);

  // Thuốc theo đơn của các ca trong phạm vi: lấy qua record từng ca mở
  const loadMeds = useCallback(async (list) => {
    try {
      const all = [];
      for (const p of list.slice(0, 8)) {
        const r = await api.get(`/api/patients/${encodeURIComponent(p.id)}/record`).then((x) => x.data.data);
        (r.medications || []).forEach((m) => all.push({ ...m, emergencyId: p.id }));
      }
      setMeds(all);
    } catch {}
  }, []);

  const mine = visible(patients).filter((p) => ["PENDING_TRIAGE", "DEPARTMENT_ROUTED", "DOCTOR_ACCEPTED", "IN_TREATMENT", "waiting", "treating"].includes(p.status));
  const critical = mine.filter((p) => p.severity === "critical");

  useEffect(() => {
    load();
    loadMeds(mine);
    const refresh = () => { load(); loadMeds(mine); };
    socket.on("BED_UPDATED", refresh);
    socket.on("EMERGENCY_UPDATED", refresh);
    socket.on("MEDICATION_UPDATED", refresh);
    return () => {
      socket.off("BED_UPDATED", refresh);
      socket.off("EMERGENCY_UPDATED", refresh);
      socket.off("MEDICATION_UPDATED", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const assignBed = async (patientId) => {
    const free = beds.find((b) => b.status === "AVAILABLE" && (b.ward === "ER" || b.ward === "ICU"));
    if (!free) return flash("Hết giường trống ER/ICU!");
    try {
      await api.patch(`/api/beds/${free.id}`, { status: "OCCUPIED", patientId });
      flash(`Đã gán ${free.id} cho ${patientId}`);
    } catch {
      flash("Gán giường thất bại (quyền/kết nối).");
    }
  };

  const verifyMed = async (m) => {
    try {
      await api.patch(`/api/medications/${m.id}`, { status: "verified" });
      flash(`Đã xác nhận thuốc ${m.name}`);
    } catch {
      flash("Xác nhận thất bại.");
    }
  };

  const erBeds = beds.filter((b) => b.ward === "ER" || b.ward === "ICU");
  const lowBeds = erBeds.filter((b) => b.status === "AVAILABLE").length <= 2;

  return (
    <div className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-teal-500/20 backdrop-blur-xl">
      <h2 className="flex items-center gap-2 text-sm font-black tracking-tight text-white">
        <HeartHandshake className="h-4 w-4 text-teal-300" /> Nurse Station — {DEPTS[scope]?.label || "Cấp cứu"}
      </h2>
      {error && <p className="mt-2 rounded-xl bg-red-500/15 p-2 text-xs font-bold text-red-300">{error}</p>}
      <AnimatePresence>{toast && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="mt-2 rounded-xl bg-emerald-500/15 p-2 text-center text-xs font-bold text-emerald-300">{toast}</motion.p>
      )}</AnimatePresence>

      {(critical.length > 0 || lowBeds) && (
        <div className="mt-2.5 space-y-1.5">
          {critical.map((p) => (
            <p key={p.id} className="flex animate-pulse items-center gap-1.5 rounded-xl bg-red-500/15 p-2 text-xs font-bold text-red-300">
              <TriangleAlert className="h-3.5 w-3.5" /> {p.id} nguy kịch chưa có BS nhận — báo ngay!
            </p>
          ))}
          {lowBeds && (
            <p className="flex items-center gap-1.5 rounded-xl bg-amber-400/15 p-2 text-xs font-bold text-amber-300">
              <BedDouble className="h-3.5 w-3.5" /> Giường ER/ICU sắp hết!
            </p>
          )}
        </div>
      )}

      <div className="mt-3 space-y-2.5">
        {mine.length === 0 && (
          <p className="rounded-xl bg-white/5 p-4 text-center text-sm text-zinc-400">Không có ca nào cần xử lý. 🎉</p>
        )}
        {mine.map((p) => (
          <motion.div key={p.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-white/[0.05] p-3.5 ring-1 ring-white/10">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm font-black text-teal-200">{p.id}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${p.severity === "critical" ? "bg-red-500/15 text-red-300" : "bg-white/10 text-zinc-300"}`}>
                {p.severity === "critical" ? "NGUY KỊCH" : (p.status || "").replace(/_/g, " ")}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-zinc-200">{p.symptom}</p>
            <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
              ♥ {p.hr ?? "?"} • SpO2 {p.spo2 ?? "?"}%{p.assignedDoctor ? ` • BS: ${p.assignedDoctor}` : " • chưa có BS"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button onClick={() => assignBed(p.id)}
                className="flex items-center gap-1 rounded-xl bg-cyan-500/20 px-3 py-1.5 text-[11px] font-black text-cyan-200 ring-1 ring-cyan-400/30 hover:bg-cyan-500/30">
                <BedDouble className="h-3.5 w-3.5" /> Gán giường
              </button>
              {meds.filter((m) => m.emergencyId === p.id && m.status === "active").map((m) => (
                <button key={m.id} onClick={() => verifyMed(m)} title={`${m.dosage} ${m.schedule}`}
                  className="flex items-center gap-1 rounded-xl bg-white/10 px-3 py-1.5 text-[11px] font-bold text-zinc-200 ring-1 ring-white/10 hover:bg-white/15">
                  <Pill className="h-3.5 w-3.5" /> Xác nhận: {m.name}
                </button>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-zinc-500">Phạm vi: khoa {DEPTS[scope]?.label} • Mọi thao tác ghi audit + realtime.</p>
    </div>
  );
}

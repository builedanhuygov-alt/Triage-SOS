import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  X, CheckCircle2, Save, LogOut, ArrowRightLeft, BedDouble,
  Loader2, Rocket, Phone, ChevronDown,
} from "lucide-react";
import { deptOf, DEPTS } from "../rbac/roles.js";
import REFERRAL_HOSPITALS, { REFER_REASONS } from "../rbac/referrals.js";
import { updateEmergency } from "../services/api.js";

/**
 * Doctor Action Modal: Nhận ca / Y lệnh / Kết thúc ca / 🚀 Chuyển tuyến trên.
 * PUT /api/emergency/:id -> backend broadcast PATIENT_UPDATED toàn hệ thống.
 */
export default function DoctorModal({ patient, onClose, onSaved }) {
  const [notes, setNotes] = useState(patient?.notes || "");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [showRefer, setShowRefer] = useState(false);
  const [refHospital, setRefHospital] = useState(REFERRAL_HOSPITALS[0].id);
  const [refReason, setRefReason] = useState(REFER_REASONS[0]);

  if (!patient) return null;
  const dept = DEPTS[deptOf(patient)];

  const run = async (action, extra = {}) => {
    setBusy(action + (extra.disposition || ""));
    setError("");
    try {
      const updated = await updateEmergency(patient.id, { action, notes, ...extra });
      onSaved?.(updated, action, extra.disposition);
      if (action !== "note") onClose();
    } catch {
      setError("Không lưu được (backend offline?). Thử lại.");
    } finally {
      setBusy(null);
    }
  };

  const doRefer = () => {
    const h = REFERRAL_HOSPITALS.find((x) => x.id === refHospital) || REFERRAL_HOSPITALS[0];
    run("refer", { hospital: { id: h.id, name: h.name, phone: h.phone }, reason: refReason });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <motion.div
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-zinc-900 p-5 ring-1 ring-white/15"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-lg font-black text-cyan-300">{patient.id} <span className="text-xs text-zinc-500">• {dept.label}</span></p>
            <p className="mt-1 text-sm font-semibold text-white">{patient.symptom}</p>
            <p className="mt-1 font-mono text-[11px] text-zinc-400">
              ETA {patient.eta} • ♥ {patient.hr} • SpO2 {patient.spo2}%{patient.bloodType ? ` • Máu ${patient.bloodType}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 text-zinc-300 hover:bg-white/20"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-2 rounded-xl bg-black/40 p-2.5 font-mono text-[11px] text-zinc-300 ring-1 ring-white/10">
          <b className="text-violet-300">AI ›</b> {patient.aiInsight}
        </div>

        {patient.referral && (
          <p className="mt-2 rounded-xl bg-orange-500/15 p-2.5 text-xs font-bold text-orange-300 ring-1 ring-orange-500/30">
            🚀 Đang chuyển tuyến → {patient.referral.hospital?.name} • {patient.referral.reason}
          </p>
        )}

        <label className="mt-3 block text-xs font-bold text-zinc-300">Ghi chú y lệnh (Clinical Notes)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          placeholder="VD: Chuyển thẳng phòng mổ, chuẩn bị 2 đơn vị máu O+..."
          className="mt-1.5 w-full resize-none rounded-2xl bg-white/5 p-3 text-sm text-white ring-1 ring-white/10 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-cyan-400/50" />

        {error && <p className="mt-2 rounded-xl bg-red-500/15 p-2 text-center text-xs font-bold text-red-300">{error}</p>}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <motion.button whileTap={{ scale: 0.97 }} disabled={!!busy || ["DOCTOR_ACCEPTED", "IN_TREATMENT", "treating"].includes(patient.status)} onClick={() => run("accept")}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-500 py-3 text-sm font-black text-white disabled:opacity-40">
            {busy === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {["DOCTOR_ACCEPTED", "IN_TREATMENT", "treating"].includes(patient.status) ? "Đang điều trị" : "Nhận Ca"}
          </motion.button>
          <motion.button whileTap={{ scale: 0.97 }} disabled={!!busy} onClick={() => run("note")}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-white/10 py-3 text-sm font-black text-white ring-1 ring-white/15 disabled:opacity-40">
            {busy === "note" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu y lệnh
          </motion.button>
        </div>

        {/* Chuyển viện tuyến trên */}
        <motion.button whileTap={{ scale: 0.98 }} onClick={() => setShowRefer((s) => !s)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-red-600 py-3 text-sm font-black uppercase tracking-tight text-white shadow-lg shadow-orange-500/20">
          <Rocket className="h-4 w-4" /> 🚀 Chuyển viện tuyến trên
          <motion.span animate={{ rotate: showRefer ? 180 : 0 }}><ChevronDown className="h-4 w-4" /></motion.span>
        </motion.button>
        {showRefer && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="overflow-hidden">
            <div className="mt-2 space-y-2 rounded-2xl bg-white/5 p-3 ring-1 ring-orange-500/20">
              {REFERRAL_HOSPITALS.map((h) => (
                <button key={h.id} onClick={() => setRefHospital(h.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-2xl p-3 text-left ring-1 transition ${
                    refHospital === h.id ? "bg-orange-500/15 ring-orange-400/50" : "bg-black/30 ring-white/10"
                  }`}>
                  <span>
                    <span className="block text-xs font-black text-white">{h.name}</span>
                    <span className="block text-[10px] text-zinc-400">{h.level} • {h.strengths}</span>
                  </span>
                  <a href={`tel:${h.phone}`} onClick={(e) => e.stopPropagation()}
                    className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1.5 font-mono text-[11px] font-black text-white">
                    <Phone className="h-3 w-3" />{h.phone}
                  </a>
                </button>
              ))}
              <label className="block text-[11px] font-bold text-zinc-400">Lý do chuyển tuyến</label>
              <div className="flex flex-wrap gap-1.5">
                {REFER_REASONS.map((r) => (
                  <button key={r} onClick={() => setRefReason(r)}
                    className={`rounded-full px-2.5 py-1.5 text-[11px] font-bold ring-1 transition ${
                      refReason === r ? "bg-orange-500 text-white ring-orange-500" : "bg-black/30 text-zinc-300 ring-white/10"
                    }`}>
                    {r}
                  </button>
                ))}
              </div>
              <motion.button whileTap={{ scale: 0.97 }} disabled={!!busy} onClick={doRefer}
                className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-orange-500 py-3 text-sm font-black text-white disabled:opacity-40">
                {busy === "refer" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Xác nhận chuyển tuyến
              </motion.button>
            </div>
          </motion.div>
        )}

        <p className="mb-1.5 mt-3 text-[11px] font-black uppercase tracking-widest text-zinc-500">Kết thúc ca</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: "discharged", label: "Xuất viện", icon: LogOut },
            { id: "transferred", label: "Chuyển khoa", icon: ArrowRightLeft },
            { id: "icu", label: "Nhập ICU", icon: BedDouble },
          ].map((d) => (
            <motion.button whileTap={{ scale: 0.96 }} key={d.id} disabled={!!busy} onClick={() => run("disposition", { disposition: d.id })}
              className="flex items-center justify-center gap-1 rounded-2xl bg-white/5 py-2.5 text-[11px] font-black text-zinc-200 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-40">
              <d.icon className="h-3.5 w-3.5" />{d.label}
            </motion.button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

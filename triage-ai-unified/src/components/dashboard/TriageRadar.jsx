import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radar } from "lucide-react";
import Card from "../ui/Card.jsx";
import Badge from "../ui/Badge.jsx";
import Button from "../ui/Button.jsx";

const spring = { type: "spring", stiffness: 300, damping: 28 };

/** TriageRadar: thẻ mới slide-in spring khi BroadcastChannel bắn tới. */
export default function TriageRadar({ patients, onAccept, onDivert }) {
  return (
    <Card className="bg-white/[0.03] p-4">
      <h2 className="flex items-center gap-2 text-sm font-black tracking-tight text-white">
        <Radar className="h-4 w-4 text-cyan-300" /> AI Triage Radar — {patients.length} ca
      </h2>
      <motion.div layout className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <AnimatePresence initial={false}>
          {patients.map((p) => (
            <motion.div key={p.id} layout
              initial={{ y: -32, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ x: 60, opacity: 0 }}
              transition={spring} whileHover={{ scale: 1.015 }}
              className={`rounded-2xl bg-white/[0.05] p-4 ring-1 backdrop-blur-xl ${p.severity === "critical" ? "ring-red-500/30" : "ring-white/10"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-black text-cyan-300">{p.id}</span>
                <Badge tone="zinc">ETA {p.eta}</Badge>
                <Badge tone={p.severity === "critical" ? "red" : p.severity === "low" ? "green" : "amber"}>{p.severity === "critical" ? "KHẨN CẤP" : p.severity === "low" ? "NHẸ" : "TRUNG BÌNH"}</Badge>
              </div>
              <p className="mt-1.5 text-[13px] font-semibold tracking-tight text-white">{p.symptom}</p>
              <div className="mt-1.5 flex gap-2 font-mono text-[11px] text-zinc-300">
                <span className="rounded-lg bg-white/5 px-2 py-1">♥ {p.hr} bpm</span>
                <span className="rounded-lg bg-white/5 px-2 py-1">SpO2 {p.spo2}%</span>
              </div>
              <div className="mt-2 rounded-xl bg-black/40 p-2.5 font-mono text-[11px] leading-relaxed text-zinc-300 ring-1 ring-white/10">
                <b className="text-violet-300">AI ›</b> {p.aiInsight}
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <Button variant="success" className="py-2 text-xs" onClick={() => onAccept(p.id)}>Nhận ca</Button>
                <Button variant="ghost" className="py-2 text-xs" onClick={() => onDivert(p.id)}>Chuyển viện</Button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
      {patients.length === 0 && (
        <p className="mt-3 rounded-xl bg-emerald-500/10 p-4 text-center text-sm font-bold text-emerald-300">✅ Radar trống — tất cả ca đã xử lý.</p>
      )}
    </Card>
  );
}

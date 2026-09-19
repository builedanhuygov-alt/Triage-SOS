import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { BedDouble } from "lucide-react";
import { api } from "../services/api.js";
import { socket } from "../services/socket.js";

const BED_COLOR = {
  AVAILABLE: "bg-emerald-500",
  OCCUPIED: "bg-rose-500",
  RESERVED: "bg-amber-400",
  CLEANING: "bg-blue-400",
  MAINTENANCE: "bg-zinc-500",
};
const NEXT = { AVAILABLE: "OCCUPIED", OCCUPIED: "CLEANING", CLEANING: "AVAILABLE", RESERVED: "AVAILABLE", MAINTENANCE: "AVAILABLE" };

/** BedBoard — CEO/Admin/Nurse: tổng quan + bấm để xoay trạng thái giường. */
export default function BedBoard() {
  const [beds, setBeds] = useState([]);
  const [summary, setSummary] = useState({});
  const [ward, setWard] = useState("ICU");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api.get("/api/beds");
      setBeds(r.data.data.beds);
      setSummary(r.data.data.summary);
    } catch {
      setError("Cần đăng nhập CEO/Admin/Nurse.");
    }
  }, []);

  useEffect(() => {
    load();
    const onBed = (b) => setBeds((prev) => prev.map((x) => (x.id === b.id ? b : x)));
    socket.on("BED_UPDATED", onBed);
    return () => socket.off("BED_UPDATED", onBed);
  }, [load]);

  const cycle = async (b) => {
    try {
      await api.patch(`/api/beds/${b.id}`, { status: NEXT[b.status] || "AVAILABLE" });
    } catch {
      setError("Đổi trạng thái thất bại (quyền/kết nối).");
    }
  };

  const wards = Object.keys(summary);
  const list = beds.filter((b) => b.ward === (wards.includes(ward) ? ward : wards[0]));
  const shown = wards.includes(ward) ? ward : wards[0];

  return (
    <div className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10 backdrop-blur-xl">
      <h2 className="flex items-center gap-2 text-sm font-black tracking-tight text-white">
        <BedDouble className="h-4 w-4 text-cyan-300" /> Bed Management — bấm giường để xoay trạng thái
      </h2>
      {error && <p className="mt-2 rounded-xl bg-red-500/15 p-2 text-xs font-bold text-red-300">{error}</p>}
      <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1">
        {wards.map((w) => {
          const s = summary[w];
          const occ = Math.round(((s.total - s.free) / s.total) * 100);
          return (
            <button key={w} onClick={() => setWard(w)}
              className={`shrink-0 rounded-2xl px-3 py-2 text-left ring-1 transition ${ward === w || (!wards.includes(ward) && w === wards[0]) ? "bg-cyan-500/15 ring-cyan-400/40" : "bg-white/[0.04] ring-white/10"}`}>
              <span className="block text-[11px] font-black text-white">{w}</span>
              <span className={`font-mono text-[11px] ${occ >= 85 ? "text-red-400" : "text-zinc-400"}`}>{s.free}/{s.total} • {occ}%</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
        {list.map((b, i) => (
          <motion.button key={b.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(i * 0.015, 0.4) }}
            onClick={() => cycle(b)} title={`${b.id} • ${b.status} (bấm để đổi)`}
            className={`flex h-10 items-center justify-center rounded-lg font-mono text-[10px] font-black text-white ${BED_COLOR[b.status]}`}>
            {b.id.split("-")[1]}
          </motion.button>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-zinc-500">Xanh trống • Đỏ occupied • Vàng reserved • Xanh dương cleaning • Xám maintenance</p>
    </div>
  );
}

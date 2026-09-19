import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pill, Plus, Trash2, BellRing, Check, X,
  Clock, FileText, CalendarCheck, Stethoscope,
} from "lucide-react";

const MED_KEY = "triage-meds-v2";
const RX_KEY = "triage-erx";

// Đơn mẫu lần đầu mở app (xóa được)
const SEED_MEDS = [
  { id: 1, name: "Amlodipin", strength: "5mg", schedule: "Sáng 1 viên", times: ["07:00"], takenDate: "" },
  { id: 2, name: "Metformin", strength: "500mg", schedule: "Sáng 1 viên, Tối 1 viên", times: ["07:00", "19:00"], taken: {}, takenDate: "" },
];
// Đơn điện tử mẫu từ lịch sử khám
const SEED_RX = [
  { id: "rx1", doctor: "BS. Nguyễn Văn An — Tim mạch", date: "12/09/2026", hospital: "BVĐK Trung tâm", items: "Amlodipin 5mg × 30 viên" },
  { id: "rx2", doctor: "BS. Trần Thị Bình — Nội tiết", date: "28/08/2026", hospital: "BV ĐH Y Dược", items: "Metformin 500mg × 60 viên" },
];

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
const today = () => new Date().toISOString().slice(0, 10);
const nowHM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
// Giờ uống tiếp theo trong ngày (hoặc sáng mai)
function nextTime(times = []) {
  const now = nowHM();
  const upcoming = [...times].sort().find((t) => t >= now);
  return upcoming ? `Hôm nay ${upcoming}` : `Ngày mai ${[...times].sort()[0] || "--:--"}`;
}

/**
 * MedicationView — Tab 3: đơn thuốc + adherence hôm nay + e-prescriptions.
 * State: useState + localStorage (không mất khi F5).
 */
export default function MedicationView() {
  const [meds, setMeds] = useState(() => load(MED_KEY, SEED_MEDS));
  const [rxList] = useState(() => load(RX_KEY, SEED_RX));
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [strength, setStrength] = useState("");
  const [schedule, setSchedule] = useState("Sáng 1 viên");
  const [time, setTime] = useState("07:00");
  const [showRx, setShowRx] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(MED_KEY, JSON.stringify(meds));
    } catch {}
  }, [meds]);

  const add = () => {
    if (!name.trim()) return;
    setMeds((m) => [...m, {
      id: Date.now(), name: name.trim(), strength: strength.trim() || "—",
      schedule: schedule.trim() || "1 viên/ngày", times: [time], takenDate: "",
    }]);
    setName(""); setStrength(""); setSchedule("Sáng 1 viên"); setTime("07:00");
    setShowForm(false);
  };

  const toggleTaken = (id) =>
    setMeds((m) => m.map((x) => (x.id === id ? { ...x, takenDate: x.takenDate === today() ? "" : today() } : x)));

  const done = meds.filter((m) => m.takenDate === today()).length;
  const adherence = meds.length ? Math.round((done / meds.length) * 100) : 100;

  const form = useMemo(() => ({ name, strength, schedule, time }), [name, strength, schedule, time]);
  void form;

  return (
    <div className="flex h-full flex-col pt-5">
      <div className="flex items-center justify-between px-4">
        <h1 className="flex items-center gap-1.5 text-lg font-black tracking-tight text-zinc-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 text-white">
            <Pill className="h-4 w-4" />
          </span>
          Quản lý Đơn thuốc
        </h1>
        <motion.button whileTap={{ scale: 0.92 }} onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1 rounded-full bg-zinc-950 px-3.5 py-2 text-[11px] font-black text-white shadow">
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? "Đóng" : "➕ Thêm lịch"}
        </motion.button>
      </div>

      {/* Adherence hôm nay */}
      <div className="px-4">
        <div className="mt-3 rounded-2xl bg-white/90 p-3.5 ring-1 ring-zinc-200 backdrop-blur-md">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="flex items-center gap-1.5 text-zinc-600"><CalendarCheck className="h-4 w-4 text-emerald-500" /> Tuân thủ hôm nay</span>
            <span className={`font-mono ${adherence === 100 ? "text-emerald-600" : "text-zinc-800"}`}>{done}/{meds.length} • {adherence}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
            <motion.div initial={{ width: 0 }} animate={{ width: `${adherence}%` }}
              className={`h-full rounded-full ${adherence === 100 ? "bg-emerald-500" : adherence >= 50 ? "bg-blue-500" : "bg-amber-400"}`} />
          </div>
        </div>
      </div>

      <div className="mt-2 flex-1 space-y-2.5 overflow-y-auto px-4 pb-32 pt-1">
        {/* Form thêm lịch */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="space-y-2 rounded-2xl bg-white/90 p-4 ring-1 ring-zinc-200 backdrop-blur-md">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên thuốc (VD: Amlodipin) *"
                  className="w-full rounded-2xl bg-zinc-50 p-3 text-sm ring-1 ring-zinc-200 outline-none focus:ring-2 focus:ring-blue-300" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={strength} onChange={(e) => setStrength(e.target.value)} placeholder="Hàm lượng (VD: 5mg)"
                    className="rounded-2xl bg-zinc-50 p-3 text-sm ring-1 ring-zinc-200 outline-none focus:ring-2 focus:ring-blue-300" />
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                    className="rounded-2xl bg-zinc-50 p-3 font-mono text-sm ring-1 ring-zinc-200 outline-none" />
                </div>
                <input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="Liều dùng (VD: Sáng 1 viên, Tối 1 viên)"
                  className="w-full rounded-2xl bg-zinc-50 p-3 text-sm ring-1 ring-zinc-200 outline-none focus:ring-2 focus:ring-blue-300" />
                <motion.button whileTap={{ scale: 0.97 }} onClick={add}
                  className="flex w-full items-center justify-center gap-1.5 rounded-full bg-blue-600 py-3 text-sm font-black text-white">
                  <BellRing className="h-4 w-4" /> Thêm nhắc nhở
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Danh sách thuốc đang dùng — stagger */}
        <p className="pt-1 text-xs font-black uppercase tracking-wide text-zinc-400">Đang dùng ({meds.length})</p>
        {meds.length === 0 && (
          <p className="rounded-2xl bg-white/90 p-5 text-center text-xs text-zinc-400 ring-1 ring-zinc-200 backdrop-blur-md">
            Chưa có thuốc nào. Bấm “➕ Thêm lịch” để bắt đầu.
          </p>
        )}
        {meds.map((m, i) => {
          const taken = m.takenDate === today();
          return (
            <motion.div
              key={m.id} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ delay: Math.min(i * 0.07, 0.4), type: "spring", stiffness: 260, damping: 24 }}
              className={`flex items-center gap-3 rounded-2xl bg-white/90 p-3.5 ring-1 backdrop-blur-md transition ${taken ? "opacity-60 ring-emerald-200" : "ring-zinc-200"}`}
            >
              <button onClick={() => toggleTaken(m.id)} aria-label={taken ? "Bỏ đánh dấu" : "Đã uống"}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-black transition ${taken ? "bg-emerald-500 text-white shadow" : "bg-zinc-100 text-zinc-400 hover:bg-emerald-100"}`}>
                {taken ? <Check className="h-5 w-5" /> : <Clock className="h-4 w-4" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-black tracking-tight ${taken ? "text-zinc-400 line-through" : "text-zinc-900"}`}>
                  {m.name} <span className="font-mono font-bold text-zinc-500">{m.strength}</span>
                </p>
                <p className="truncate text-[11px] text-zinc-500">{m.schedule}</p>
                <p className={`text-[11px] font-bold ${taken ? "text-emerald-600" : "text-blue-600"}`}>
                  {taken ? "✓ Đã uống hôm nay" : `⏰ Uống tiếp: ${nextTime(m.times)}`}
                </p>
              </div>
              <button onClick={() => setMeds((x) => x.filter((y) => y.id !== m.id))} className="p-1 text-zinc-300 hover:text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}

        {/* Đơn thuốc điện tử */}
        <button onClick={() => setShowRx((s) => !s)}
          className="flex w-full items-center justify-between rounded-2xl bg-zinc-950 px-4 py-3 text-white shadow">
          <span className="flex items-center gap-2 text-xs font-black"><FileText className="h-4 w-4" /> Đơn thuốc điện tử ({rxList.length})</span>
          <span className="text-xs">{showRx ? "▲" : "▼"}</span>
        </button>
        <AnimatePresence>
          {showRx && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="space-y-2">
                {rxList.map((rx) => (
                  <div key={rx.id} className="rounded-2xl bg-blue-50/80 p-3.5 ring-1 ring-blue-100 backdrop-blur-md">
                    <p className="flex items-center gap-1.5 text-xs font-black text-zinc-800"><Stethoscope className="h-3.5 w-3.5 text-blue-600" />{rx.doctor}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">{rx.hospital} • {rx.date}</p>
                    <p className="mt-1 rounded-xl bg-white p-2 font-mono text-[11px] text-zinc-700">{rx.items}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

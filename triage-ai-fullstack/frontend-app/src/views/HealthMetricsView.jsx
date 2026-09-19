import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  HeartPulse, Gauge, Droplets, Thermometer,
  Plus, X, AlertTriangle, CheckCircle2, Sparkles, Watch,
} from "lucide-react";

const KEY = "triage-metrics-v2";

// Seed 8 điểm/24h để biểu đồ có dữ liệu ngay lần đầu
function seed() {
  const now = Date.now();
  const hrs = [72, 75, 78, 74, 88, 96, 82, 76];
  return hrs.map((hr, i) => ({
    ts: now - (7 - i) * 3 * 3600 * 1000,
    hr, sys: 118 + (i % 3) * 3, dia: 76 + (i % 2) * 2, spo2: 97 + (i % 2), temp: 36.4 + (i % 3) * 0.2,
  }));
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : seed();
  } catch {
    return seed();
  }
}
const fmtHour = (ts) => new Date(ts).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

// Đánh giá từng chỉ số -> {label, tone}
function evalHr(hr) {
  if (hr == null) return null;
  if (hr < 50 || hr > 110) return { label: "Nguy hiểm 🔴", tone: "red" };
  if (hr < 60 || hr > 100) return { label: "Cần lưu ý 🟡", tone: "amber" };
  return { label: "Bình thường 🟢", tone: "green" };
}
function evalBp(sys, dia) {
  if (sys == null) return null;
  if (sys >= 180 || (dia ?? 0) >= 110) return { label: "Nguy hiểm 🔴", tone: "red" };
  if (sys >= 140 || (dia ?? 0) >= 90) return { label: "Cao 🟡", tone: "amber" };
  if (sys < 90) return { label: "Thấp 🟡", tone: "amber" };
  return { label: "Ổn định 🟢", tone: "green" };
}
function evalSpo2(s) {
  if (s == null) return null;
  if (s < 92) return { label: "Nguy hiểm 🔴", tone: "red" };
  if (s < 95) return { label: "Thấp 🟡", tone: "amber" };
  return { label: "Tốt 🟢", tone: "green" };
}
function evalTemp(t) {
  if (t == null) return null;
  if (t >= 39) return { label: "Sốt cao 🔴", tone: "red" };
  if (t >= 37.5) return { label: "Sốt nhẹ 🟡", tone: "amber" };
  return { label: "Bình thường 🟢", tone: "green" };
}
const toneCls = {
  red: "bg-red-100 text-red-600",
  amber: "bg-amber-100 text-amber-700",
  green: "bg-emerald-100 text-emerald-700",
};

/** Biểu đồ nhịp tim 24h — SVG custom, gradient fill, dot điểm mới nhất. */
function HrChart({ data }) {
  const pts = data.filter((d) => d.hr != null).slice(-12);
  const w = 320, h = 96, pad = 8;
  const vals = pts.map((d) => d.hr);
  const min = Math.min(...vals, 50) - 5, max = Math.max(...vals, 110) + 5;
  const X = (i) => pad + (i / Math.max(pts.length - 1, 1)) * (w - pad * 2);
  const Y = (v) => h - pad - ((v - min) / (max - min)) * (h - pad * 2);
  const line = pts.map((d, i) => `${X(i)},${Y(d.hr)}`).join(" ");
  const area = `${pad},${h - pad} ${line} ${X(pts.length - 1)},${h - pad}`;
  const bad = vals[vals.length - 1] > 100 || vals[vals.length - 1] < 60;
  const stroke = bad ? "#ef4444" : "#10b981";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full">
      <defs>
        <linearGradient id="hr-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#hr-fill)" />
      <motion.polyline points={line} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2 }} />
      <circle cx={X(pts.length - 1)} cy={Y(vals[vals.length - 1])} r="4" fill={stroke} stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

/**
 * HealthMetricsView — Tab 4: 4 chỉ số sinh tồn + biểu đồ 24h + AI insight.
 * Lịch sử lưu localStorage (không mất khi reload).
 */
export default function HealthMetricsView() {
  const [log, setLog] = useState(load);
  const [showForm, setShowForm] = useState(false);
  const [hr, setHr] = useState("");
  const [sys, setSys] = useState("");
  const [dia, setDia] = useState("");
  const [spo2, setSpo2] = useState("");
  const [temp, setTemp] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(log.slice(-48)));
    } catch {}
  }, [log]);

  const add = () => {
    if (!hr && !sys && !spo2 && !temp) return;
    setLog((l) => [...l, {
      ts: Date.now(), hr: hr ? Number(hr) : null, sys: sys ? Number(sys) : null,
      dia: dia ? Number(dia) : null, spo2: spo2 ? Number(spo2) : null, temp: temp ? Number(temp) : null,
    }].slice(-48));
    setHr(""); setSys(""); setDia(""); setSpo2(""); setTemp("");
    setShowForm(false);
  };

  // Giả lập đeo tay: sinh chỉ số ngẫu nhiên quanh mức bình thường
  const simulate = () => {
    const r = (a, b) => Math.round(a + Math.random() * (b - a));
    setLog((l) => [...l, {
      ts: Date.now(), hr: r(68, 92), sys: r(112, 132), dia: r(72, 86),
      spo2: r(96, 99), temp: Math.round((36.3 + Math.random() * 0.7) * 10) / 10,
    }].slice(-48));
  };

  const last = log[log.length - 1] || {};
  const cards = useMemo(() => [
    { icon: HeartPulse, label: "Nhịp tim", unit: "bpm", value: last.hr, ev: evalHr(last.hr), bg: "bg-rose-50", color: "text-rose-500" },
    { icon: Gauge, label: "Huyết áp", unit: "mmHg", value: last.sys ? `${last.sys}/${last.dia ?? "?"}` : null, ev: evalBp(last.sys, last.dia), bg: "bg-blue-50", color: "text-blue-600" },
    { icon: Droplets, label: "SpO2", unit: "%", value: last.spo2, ev: evalSpo2(last.spo2), bg: "bg-cyan-50", color: "text-cyan-600" },
    { icon: Thermometer, label: "Nhiệt độ", unit: "°C", value: last.temp, ev: evalTemp(last.temp), bg: "bg-amber-50", color: "text-amber-500" },
  ], [log]);

  const worst = cards.some((c) => c.ev?.tone === "red") ? "red" : cards.some((c) => c.ev?.tone === "amber") ? "amber" : "green";
  const insight =
    worst === "red"
      ? "⚠️ Có chỉ số ở ngưỡng nguy hiểm. Hãy ngồi nghỉ, đo lại sau 5 phút. Không cải thiện hoặc kèm đau ngực/khó thở — bấm SOS ngay!"
      : worst === "amber"
        ? "Một vài chỉ số lệch nhẹ khỏi chuẩn. Hạn chế cà phê, ngủ đủ giấc và theo dõi thêm hôm nay nhé."
        : "Chỉ số huyết áp và nhịp tim của bạn hoàn toàn bình thường trong hôm nay. Tiếp tục duy trì lối sống lành mạnh 💚";

  return (
    <div className="flex h-full flex-col pt-5">
      <div className="flex items-center justify-between px-4">
        <h1 className="flex items-center gap-1.5 text-lg font-black tracking-tight text-zinc-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-400 text-white">
            <HeartPulse className="h-4 w-4" />
          </span>
          Chỉ số Sinh tồn
        </h1>
        <div className="flex gap-1.5">
          <motion.button whileTap={{ scale: 0.92 }} onClick={simulate} title="Giả lập thiết bị đeo"
            className="flex items-center gap-1 rounded-full bg-white px-3 py-2 text-[11px] font-black text-zinc-600 ring-1 ring-zinc-200">
            <Watch className="h-3.5 w-3.5" /> Đeo tay
          </motion.button>
          <motion.button whileTap={{ scale: 0.92 }} onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1 rounded-full bg-zinc-950 px-3 py-2 text-[11px] font-black text-white shadow">
            {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />} Cập nhật
          </motion.button>
        </div>
      </div>

      <div className="mt-2 flex-1 space-y-3 overflow-y-auto px-4 pb-32 pt-1">
        {/* Form nhập */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/90 p-3.5 ring-1 ring-zinc-200 backdrop-blur-md">
                {[
                  [hr, setHr, "Nhịp tim (bpm)"], [spo2, setSpo2, "SpO2 (%)"],
                  [sys, setSys, "HA tâm thu"], [dia, setDia, "HA tâm trương"],
                ].map(([v, set, ph], i) => (
                  <input key={i} value={v} onChange={(e) => set(e.target.value)} placeholder={ph} inputMode="decimal"
                    className="rounded-2xl bg-zinc-50 p-3 font-mono text-sm ring-1 ring-zinc-200 outline-none focus:ring-2 focus:ring-rose-300" />
                ))}
                <input value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="Nhiệt độ (°C)" inputMode="decimal"
                  className="col-span-2 rounded-2xl bg-zinc-50 p-3 font-mono text-sm ring-1 ring-zinc-200 outline-none focus:ring-2 focus:ring-rose-300" />
                <motion.button whileTap={{ scale: 0.97 }} onClick={add}
                  className="col-span-2 rounded-full bg-rose-600 py-3 text-sm font-black text-white">Lưu chỉ số</motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Grid 4 cards — fade/slide stagger */}
        <div className="grid grid-cols-2 gap-2.5">
          {cards.map((c, i) => (
            <motion.div
              key={c.label} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ delay: Math.min(i * 0.07, 0.3), type: "spring", stiffness: 260, damping: 24 }}
              className="rounded-2xl bg-white/90 p-3.5 ring-1 ring-zinc-200 backdrop-blur-md"
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${c.bg}`}>
                <c.icon className={`h-5 w-5 ${c.color}`} />
              </div>
              <p className="mt-2 font-mono text-xl font-black tracking-tight text-zinc-900">
                {c.value ?? "--"} <span className="text-[11px] font-bold text-zinc-400">{c.unit}</span>
              </p>
              <p className="text-[11px] font-bold text-zinc-500">{c.label}</p>
              {c.ev && <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${toneCls[c.ev.tone]}`}>{c.ev.label}</span>}
            </motion.div>
          ))}
        </div>
        <p className="text-right text-[10px] text-zinc-400">Đo lúc {last.ts ? fmtHour(last.ts) : "--:--"}</p>

        {/* Biểu đồ 24h */}
        <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
          className="rounded-2xl bg-white/90 p-4 ring-1 ring-zinc-200 backdrop-blur-md">
          <p className="text-xs font-black text-zinc-700">Nhịp tim 24h qua</p>
          <HrChart data={log} />
          <div className="flex justify-between text-[10px] text-zinc-400">
            <span>{fmtHour(log[0]?.ts || Date.now())}</span><span>Bây giờ</span>
          </div>
        </motion.div>

        {/* AI Health Insight */}
        <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}
          className={`flex gap-2.5 rounded-2xl p-4 ring-1 backdrop-blur-md ${
            worst === "red" ? "bg-red-50/90 ring-red-200" : worst === "amber" ? "bg-amber-50/90 ring-amber-200" : "bg-emerald-50/90 ring-emerald-200"
          }`}>
          <Sparkles className={`h-5 w-5 shrink-0 ${worst === "red" ? "text-red-500" : worst === "amber" ? "text-amber-500" : "text-emerald-500"}`} />
          <div>
            <p className="text-xs font-black text-zinc-800">AI Health Insight</p>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-600">{insight}</p>
          </div>
        </motion.div>

        {worst === "red" && (
          <a href="tel:115" className="flex items-center justify-center gap-2 rounded-full bg-red-600 py-3.5 text-sm font-black text-white shadow-lg">
            <AlertTriangle className="h-4 w-4" /> Gọi 115 ngay
          </a>
        )}
        {worst === "green" && (
          <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Mọi chỉ số trong ngưỡng an toàn
          </p>
        )}
      </div>
    </div>
  );
}

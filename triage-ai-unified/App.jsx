import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, LayoutDashboard, Siren, BrainCircuit, Radar, Droplets,
  Users, Moon, Megaphone, ShieldAlert, BedDouble, Ventilator,
  HeartPulse, CheckCircle2, XCircle, Clock, Activity, AlertTriangle,
  Radio, Stethoscope, Mic, MicOff, Search, MapPin, Hospital,
  Navigation, ArrowLeft, Milestone, Phone, PhoneCall, X, Check,
  Map as MapIcon, BellOff, ChevronRight,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Area,
} from "recharts";

/* ============================================================================
   TRIAGE AI — World-Class Unified (Command Center + SOS App trong 1 file)
   Cài: npm i framer-motion lucide-react recharts
   Copy -> src/App.jsx -> npm run dev
   Font: Inter (tracking-tight). Glass: backdrop-blur-xl + ring-1 ring-white/10.
============================================================================ */

const chartData = [
  { time: "-12h", actual: 18, forecast: null },
  { time: "-10h", actual: 22, forecast: null },
  { time: "-8h", actual: 26, forecast: null },
  { time: "-6h", actual: 24, forecast: null },
  { time: "-4h", actual: 31, forecast: null },
  { time: "-2h", actual: 35, forecast: null },
  { time: "Now", actual: 38, forecast: 38 },
  { time: "+1h", actual: null, forecast: 41 },
  { time: "+2h", actual: null, forecast: 44 },
  { time: "+3h", actual: null, forecast: 47 },
  { time: "+4h", actual: null, forecast: 51 },
  { time: "+5h", actual: null, forecast: 54 },
  { time: "+6h", actual: null, forecast: 57 },
];
const OVERLOAD = 50;

const initialResources = {
  icu: { label: "ICU", free: 3, total: 20 },
  vent: { label: "Máy thở", free: 4, total: 15 },
  doctors: { label: "Bác sĩ trực", free: 12, total: 25 },
  nurses: { label: "Điều dưỡng", free: 28, total: 60 },
  blood: [
    { type: "O", pct: 65 }, { type: "A", pct: 42 },
    { type: "B", pct: 18 }, { type: "AB", pct: 12 },
  ],
};

const initialPatients = [
  { id: "#BN-201", symptom: "Đau ngực trái lan vai, khó thở", eta: "4 phút", severity: "critical", hr: 128, spo2: 89,
    aiInsight: "Nguy cơ nhồi máu cơ tim cao. Chuẩn bị ECG + báo Đội Can thiệp Tim mạch." },
  { id: "#BN-202", symptom: "TNGT — chấn thương sọ não", eta: "9 phút", severity: "critical", hr: 142, spo2: 91,
    aiInsight: "Shock mất máu. Giữ 2 đơn vị máu O, chuẩn bị phòng mổ + máy thở." },
  { id: "#BN-203", symptom: "Sốt 39.5°C, SpO2 tụt", eta: "15 phút", severity: "medium", hr: 105, spo2: 93,
    aiInsight: "Nghi viêm phổi nặng. Test nhanh + cách ly, giữ giường Truyền nhiễm." },
];

const spring = { type: "spring", stiffness: 300, damping: 28 };

/* ---------- iOS Toggle ---------- */
function ModeToggle({ mode, setMode }) {
  const isCmd = mode === "command";
  return (
    <div className="fixed left-1/2 top-3 z-50 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-full bg-black/50 p-1 ring-1 ring-white/10 backdrop-blur-xl">
        {(["command", "sos"]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`relative rounded-full px-4 py-1.5 text-xs font-bold tracking-tight transition ${isCmd === (m === "command") ? "text-zinc-950" : "text-zinc-300"}`}
          >
            {isCmd === (m === "command") && (
              <motion.span layoutId="toggle-pill" transition={spring}
                className="absolute inset-0 rounded-full bg-white shadow" />
            )}
            <span className="relative">{m === "command" ? "🏥 Command" : "📱 SOS App"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- KPI card (glass, count pop) ---------- */
function Kpi({ icon: Icon, label, value, sub, accent }) {
  return (
    <motion.div whileHover={{ scale: 1.02 }} transition={spring}
      className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-tight text-zinc-400">
        <Icon className={`h-4 w-4 ${accent}`} />{label}
      </div>
      <motion.p key={value} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring}
        className="mt-1 text-2xl font-black tracking-tight text-white">{value}</motion.p>
      <p className="text-[11px] text-zinc-500">{sub}</p>
    </motion.div>
  );
}

/* ---------- Thin minimalist resource bar ---------- */
function ThinBar({ label, free, total }) {
  const pct = Math.round((free / total) * 100);
  const crit = pct < 20;
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3.5 ring-1 ring-white/10 backdrop-blur-xl">
      <div className="flex justify-between text-xs">
        <span className="font-semibold tracking-tight text-zinc-300">{label}</span>
        <span className={`font-mono font-bold ${crit ? "text-red-400" : "text-zinc-100"}`}>{free}/{total}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={spring}
          className={`h-full rounded-full ${crit ? "animate-pulse bg-red-500" : pct < 50 ? "bg-amber-400" : "bg-emerald-400"}`} />
      </div>
      {crit && <p className="mt-1.5 animate-pulse text-[11px] font-bold text-red-400">Dưới 20% — cần bổ sung</p>}
    </div>
  );
}

/* ================= COMMAND CENTER ================= */
function CommandCenter() {
  const [override, setOverride] = useState(false);
  const [resources] = useState(initialResources);
  const [patients, setPatients] = useState(initialPatients);
  const [toast, setToast] = useState("");

  // DEMO: nghe BroadcastChannel từ SOS App (cùng origin, 2 tab hoặc cùng file)
  useEffect(() => {
    let ch;
    try {
      ch = new BroadcastChannel("emergency_channel");
      ch.onmessage = (e) => {
        if (e.data?.type === "NEW_PATIENT") {
          setPatients((prev) => [{ ...e.data.data, received: false }, ...prev]);
          try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            const ctx = new Ctx();
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.frequency.value = 880; o.type = "sine";
            g.gain.setValueAtTime(0.2, ctx.currentTime);
            o.start(); o.stop(ctx.currentTime + 0.35);
          } catch {}
          setToast(`🚨 Ca mới ${e.data.data.id} vừa đổ về Radar!`);
          setTimeout(() => setToast(""), 4000);
        }
      };
    } catch {}
    return () => ch?.close();
  }, []);

  const accept = (id) => setPatients((p) => p.filter((x) => x.id !== id));
  const divert = (id) => setPatients((p) => p.filter((x) => x.id !== id));

  return (
    <div className={`min-h-screen bg-zinc-950 pt-14 font-[Inter,system-ui] tracking-tight text-zinc-100 ${override ? "shadow-[inset_0_0_120px_rgba(239,68,68,.25)]" : ""}`}>
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        {/* Top nav glass */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10 backdrop-blur-xl">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600"><Building2 className="h-5 w-5 text-white" /></span>
            <div>
              <p className="text-sm font-black">BVĐK TRUNG TÂM <span className="text-cyan-300">• Command</span></p>
              <p className="flex items-center gap-1 text-[11px] text-zinc-400"><Radio className="h-3 w-3 text-emerald-400" /> Deep Dark • {patients.length} ca radar</p>
            </div>
          </div>
          <div className="flex gap-2">
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => setOverride((o) => !o)}
              className={`rounded-full bg-gradient-to-r px-5 py-2.5 text-xs font-black uppercase ${override ? "animate-pulse from-red-600 to-red-500 shadow-[0_0_25px_rgba(239,68,68,.6)]" : "from-red-500/80 to-orange-500/80 ring-1 ring-white/20"} text-white`}>
              <span className="flex items-center gap-1.5"><ShieldAlert className="h-4 w-4" />{override ? "Đang chặn luồng" : "Emergency Override"}</span>
            </motion.button>
            <motion.button whileTap={{ scale: 0.95 }} className="rounded-full bg-white px-5 py-2.5 text-xs font-black uppercase text-zinc-950">
              <span className="flex items-center gap-1.5"><Megaphone className="h-4 w-4" />Broadcast</span>
            </motion.button>
          </div>
        </div>

        <AnimatePresence>{toast && (
          <motion.div initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} transition={spring}
            className="animate-pulse rounded-2xl bg-red-500/15 p-3 text-center text-sm font-bold text-red-300 ring-1 ring-red-500/30 backdrop-blur-xl">{toast}</motion.div>
        )}</AnimatePresence>

        {/* KPIs */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Kpi icon={Siren} label="BN cấp cứu" value="38" sub={`+${patients.length} đang đến`} accent="text-rose-400" />
          <Kpi icon={Activity} label="Công suất" value="85%" sub="Ngưỡng quá tải 90%" accent="text-amber-300" />
          <Kpi icon={Clock} label="Chờ trung bình" value="15 phút" sub="Mục tiêu < 10 phút" accent="text-cyan-300" />
        </div>

        {/* Chart — minimal, gradient fill, custom tooltip */}
        <div className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10 backdrop-blur-xl sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-black"><BrainCircuit className="h-4 w-4 text-violet-300" /> AI Predictive — Dự báo quá tải</h2>
            <span className="animate-pulse rounded-full bg-red-500/15 px-3 py-1 text-[11px] font-bold text-red-300">⚠️ Chạm ngưỡng trong ~4h</span>
          </div>
          <div className="mt-2 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="fc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#27272a" strokeDasharray="2 6" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "rgba(0,0,0,.75)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, fontSize: 12, color: "#fff" }} />
                <ReferenceLine y={OVERLOAD} stroke="#ef4444" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="forecast" stroke="none" fill="url(#fc)" />
                <Line type="monotone" dataKey="actual" stroke="#22d3ee" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="forecast" stroke="#a78bfa" strokeWidth={2.5} strokeDasharray="6 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Resources thin */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ThinBar label="Giường ICU" free={resources.icu.free} total={resources.icu.total} />
          <ThinBar label="Máy thở rảnh" free={resources.vent.free} total={resources.vent.total} />
          <ThinBar label="Bác sĩ trực" free={resources.doctors.free} total={resources.doctors.total} />
          <ThinBar label="Điều dưỡng trực" free={resources.nurses.free} total={resources.nurses.total} />
        </div>

        {/* Radar — spring slide-in */}
        <div className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10 backdrop-blur-xl">
          <h2 className="flex items-center gap-2 text-sm font-black"><Radar className="h-4 w-4 text-cyan-300" /> AI Triage Radar — {patients.length} ca</h2>
          <motion.div layout className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <AnimatePresence initial={false}>
              {patients.map((p) => (
                <motion.div key={p.id} layout initial={{ y: -32, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ x: 60, opacity: 0 }} transition={spring}
                  whileHover={{ scale: 1.015 }}
                  className={`rounded-2xl bg-white/[0.05] p-4 ring-1 backdrop-blur-xl ${p.severity === "critical" ? "ring-red-500/30" : "ring-white/10"}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-black text-cyan-300">{p.id}</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold">ETA {p.eta}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${p.severity === "critical" ? "bg-red-500/15 text-red-300" : "bg-amber-400/15 text-amber-300"}`}>
                      {p.severity === "critical" ? "KHẨN CẤP" : "TRUNG BÌNH"}</span>
                  </div>
                  <p className="mt-1.5 text-[13px] font-semibold">{p.symptom}</p>
                  <div className="mt-1.5 flex gap-2 font-mono text-[11px] text-zinc-300">
                    <span className="rounded-lg bg-white/5 px-2 py-1">♥ {p.hr} bpm</span>
                    <span className="rounded-lg bg-white/5 px-2 py-1">SpO2 {p.spo2}%</span>
                  </div>
                  <div className="mt-2 rounded-xl bg-black/40 p-2.5 font-mono text-[11px] leading-relaxed text-zinc-300 ring-1 ring-white/10">
                    <b className="text-violet-300">AI ›</b> {p.aiInsight}
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <motion.button whileTap={{ scale: 0.96 }} onClick={() => accept(p.id)} className="rounded-xl bg-emerald-500 py-2 text-xs font-bold text-white">Nhận ca</motion.button>
                    <motion.button whileTap={{ scale: 0.96 }} onClick={() => divert(p.id)} className="rounded-xl bg-white/10 py-2 text-xs font-bold text-zinc-300 ring-1 ring-white/10">Chuyển viện</motion.button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/* ================= SOS APP ================= */
function SosApp() {
  const [view, setView] = useState("input");
  const [symptom, setSymptom] = useState("");
  const [listening, setListening] = useState(false);
  const [step, setStep] = useState(0);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const toggleMic = () => {
    if (listening) { setListening(false); return; }
    setListening(true);
    timers.current.push(setTimeout(() => { setSymptom("Đau thắt ngực trái, khó thở 20 phút..."); setListening(false); }, 1400));
  };
  const search = () => {
    if (!symptom.trim()) setSymptom("Đau thắt ngực, khó thở...");
    setView("processing"); setStep(0);
    timers.current.push(setTimeout(() => setStep(1), 850));
    timers.current.push(setTimeout(() => setStep(2), 1700));
    timers.current.push(setTimeout(() => setView("result"), 2600));
  };
  // DEMO trigger → gửi qua BroadcastChannel → sang success
  const report = () => {
    try {
      const ch = new BroadcastChannel("emergency_channel");
      ch.postMessage({ type: "NEW_PATIENT", data: {
        id: "#BN-999", symptom: "Đau thắt ngực (từ App)", eta: "5 phút",
        severity: "critical", hr: 126, spo2: 90,
        aiInsight: "Ca SOS từ app người dân. Chuẩn bị ECG + giường Cấp cứu.",
      }});
      ch.close();
    } catch {}
    setView("success");
  };

  return (
    <div className="min-h-screen bg-zinc-200 pt-14 font-[Inter,system-ui] tracking-tight sm:py-16">
      <div className="relative mx-auto flex h-screen max-w-md flex-col overflow-hidden bg-gray-50/90 shadow-2xl backdrop-blur-3xl sm:h-[840px] sm:rounded-[2rem] sm:ring-8 sm:ring-zinc-900">
        <AnimatePresence mode="wait">
          {/* INPUT — clean như Google Search */}
          {view === "input" && (
            <motion.div key="in" initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -30, opacity: 0 }} transition={spring} className="flex h-full flex-col">
              <div className="bg-gradient-to-r from-red-600 to-orange-500 px-5 pb-6 pt-6 text-white">
                <p className="flex items-center gap-2 text-xl font-black"><Siren className="h-6 w-6" /> Cấp Cứu Nhanh</p>
              </div>
              <div className="flex flex-1 flex-col gap-4 px-5 py-5">
                <textarea value={symptom} onChange={(e) => setSymptom(e.target.value)} autoFocus rows={3}
                  placeholder="Mô tả triệu chứng..."
                  className="w-full resize-none rounded-2xl bg-white p-4 text-[15px] shadow-sm ring-1 ring-black/5 outline-none focus:ring-2 focus:ring-red-300" />
                {/* Siri orb */}
                <div className="flex flex-col items-center py-3">
                  <motion.button whileTap={{ scale: 0.9 }} onClick={toggleMic}
                    animate={listening ? { scale: [1, 1.12, 1] } : {}} transition={{ repeat: listening ? Infinity : 0, duration: 1.2 }}
                    className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-xl shadow-red-500/30">
                    {listening && <motion.span animate={{ scale: [1, 1.8], opacity: [0.5, 0] }} transition={{ repeat: Infinity, duration: 1.2 }}
                      className="absolute inset-0 rounded-full bg-red-400/40" />}
                    {listening ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
                  </motion.button>
                  <p className="mt-2 text-sm font-semibold text-zinc-500">{listening ? "Đang nghe..." : "Nhấn để nói"}</p>
                </div>
              </div>
              <div className="p-4">
                <motion.button whileTap={{ scale: 0.98 }} onClick={search}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-zinc-950 py-4 font-black text-white shadow-xl">
                  <Search className="h-5 w-5" /> Tìm bệnh viện phù hợp</motion.button>
              </div>
            </motion.div>
          )}

          {/* PROCESSING — skeleton ChatGPT style */}
          {view === "processing" && (
            <motion.div key="pr" initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} transition={spring}
              className="flex h-full flex-col justify-center gap-3 bg-zinc-950 p-8">
              {[0, 1, 2].map((i) => (
                <motion.div key={i} initial={{ opacity: 0.3 }} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.4, delay: i * 0.2 }}
                  className={`h-12 rounded-2xl bg-white/10 backdrop-blur-xl ${i <= step ? "ring-1 ring-cyan-400/40" : ""}`} />
              ))}
              <p className="mt-2 animate-pulse text-center text-sm text-cyan-200">
                {["AI đang phân tích...", "Đối chiếu chuyên khoa...", "Kiểm tra giường..."][step]}</p>
            </motion.div>
          )}

          {/* RESULT — map + bottom sheet */}
          {view === "result" && (
            <motion.div key="rs" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} transition={spring} className="flex h-full flex-col">
              <div className="relative h-60 bg-zinc-100" style={{ backgroundImage: "radial-gradient(#d4d4d8 1.2px, transparent 1.2px)", backgroundSize: "14px 14px" }}>
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 360 240" fill="none">
                  <motion.path d="M50 200 C 120 160, 170 140, 310 40" stroke="#2563eb" strokeWidth="4" strokeLinecap="round"
                    strokeDasharray="1 8" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2 }} />
                </svg>
                <span className="absolute bottom-6 left-6 rounded-full bg-zinc-950 px-3 py-1.5 text-[11px] font-bold text-white">📍 Vị trí của bạn</span>
                <span className="absolute right-6 top-6 rounded-full bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white">🏥 Bệnh viện A</span>
              </div>
              <motion.div initial={{ y: 40 }} animate={{ y: 0 }} transition={spring}
                className="-mt-8 flex-1 rounded-t-[1.75rem] bg-white/80 p-4 shadow-2xl backdrop-blur-xl">
                <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-zinc-300" />
                <div className="rounded-2xl bg-white p-4 shadow-lg shadow-blue-500/20 ring-1 ring-black/5">
                  <p className="font-black">Bệnh viện Đa khoa Trung tâm</p>
                  <div className="mt-1 flex gap-1.5 text-[11px] font-bold">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">🟢 Trống giường</span>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">⚡ Tim mạch</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">2.5 km • 5 phút</p>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={report}
                    className="mt-3 w-full rounded-full bg-blue-600 py-4 font-black text-white shadow-lg shadow-blue-500/20">
                    Bắt đầu chỉ đường & Báo bệnh viện</motion.button>
                </div>
                <div className="mt-2 scale-[0.97] rounded-2xl bg-white/60 p-3 opacity-50 ring-1 ring-black/5">
                  <p className="text-xs font-bold">Bệnh viện Quận X — 🔴 Quá tải. Gần (1km) nhưng hết chỗ. Không đề xuất.</p>
                </div>
                <button onClick={() => setView("input")} className="mt-2 w-full py-2 text-xs font-bold text-zinc-400">Hủy / Trở về</button>
              </motion.div>
            </motion.div>
          )}

          {/* SUCCESS — emerald gradient + SVG draw */}
          {view === "success" && (
            <motion.div key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring}
              className="flex h-full flex-col bg-gradient-to-b from-emerald-50 to-teal-100">
              <div className="flex flex-col items-center px-6 pt-12 text-center">
                <svg viewBox="0 0 100 100" className="h-28 w-28">
                  <motion.circle cx="50" cy="50" r="44" fill="none" stroke="#10b981" strokeWidth="6"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8 }} />
                  <motion.path d="M32 52 L45 65 L70 38" fill="none" stroke="#10b981" strokeWidth="7" strokeLinecap="round"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.6 }} />
                </svg>
                <motion.h2 animate={{ y: [8, 0] }} className="mt-3 text-xl font-black text-emerald-900">Đã phát báo động khẩn cấp!</motion.h2>
                <p className="mt-1.5 max-w-[290px] text-[13px] text-emerald-800">Bệnh viện Đa khoa Trung tâm đã nhận hồ sơ (#BN-999) và đang chuẩn bị tiếp đón.</p>
              </div>
              <div className="flex flex-1 flex-col gap-2.5 p-5">
                <motion.button whileTap={{ scale: 0.97 }} className="w-full rounded-full bg-red-600 py-4 font-black text-white shadow-lg">Gọi xe Cấp cứu (115)</motion.button>
                <motion.button whileTap={{ scale: 0.97 }} className="w-full rounded-full bg-blue-600 py-4 font-black text-white shadow-lg">Mở bản đồ chỉ đường</motion.button>
                <button onClick={() => setView("input")} className="mx-auto py-2 text-xs font-bold text-zinc-400">Hủy báo động</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ================= ROOT: toggle 2 app ================= */
export default function App() {
  const [mode, setMode] = useState("command");
  return (
    <div className="min-h-screen">
      <ModeToggle mode={mode} setMode={setMode} />
      <AnimatePresence mode="wait">
        <motion.div key={mode} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          {mode === "command" ? <CommandCenter /> : <SosApp />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

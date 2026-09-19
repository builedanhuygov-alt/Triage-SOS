import React, { useState, useMemo } from "react";
import {
  Building2, LayoutDashboard, Siren, BrainCircuit, Radar, Droplets,
  Users, Settings, Moon, Sun, Megaphone, ShieldAlert, BedDouble,
  Ventilator, HeartPulse, CheckCircle2, XCircle, Clock, Activity,
  AlertTriangle, Radio, Stethoscope, ChevronRight,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine, Area,
} from "recharts";

/* ============================================================================
   SMART HOSPITAL COMMAND CENTER — Dark/Navy + Neon
   Stack: React (Vite) + Tailwind + lucide-react + recharts
   Cài đặt: npm i lucide-react recharts
   Copy file này -> src/App.jsx rồi npm run dev
============================================================================ */

// ---------- Mock: biểu đồ 12h thực tế + 6h AI dự báo ----------
const initialChartData = [
  { time: "-12h", actual: 18, forecast: null },
  { time: "-10h", actual: 22, forecast: null },
  { time: "-8h",  actual: 26, forecast: null },
  { time: "-6h",  actual: 24, forecast: null },
  { time: "-4h",  actual: 31, forecast: null },
  { time: "-2h",  actual: 35, forecast: null },
  { time: "Hiện tại", actual: 38, forecast: 38 },
  { time: "+1h",  actual: null, forecast: 41 },
  { time: "+2h",  actual: null, forecast: 44 },
  { time: "+3h",  actual: null, forecast: 47 },
  { time: "+4h",  actual: null, forecast: 51 },
  { time: "+5h",  actual: null, forecast: 54 },
  { time: "+6h",  actual: null, forecast: 57 },
];
const OVERLOAD_THRESHOLD = 50;

// ---------- Mock: tài nguyên sinh tử ----------
const initialResources = {
  icu: { label: "Giường ICU", free: 3, total: 20, icon: BedDouble },
  ventilator: { label: "Máy thở rảnh", free: 4, total: 15, icon: Ventilator },
  doctors: { label: "Bác sĩ trực", free: 12, total: 25, icon: Stethoscope },
  nurses: { label: "Điều dưỡng trực", free: 28, total: 60, icon: Users },
  blood: [
    { type: "O", pct: 65 }, { type: "A", pct: 42 },
    { type: "B", pct: 18 }, { type: "AB", pct: 12 },
  ],
};

// ---------- Mock: 4 bệnh nhân radar ----------
const initialPatients = [
  {
    id: "#BN-201", symptom: "Đau ngực trái lan vai, khó thở",
    eta: "4 phút", severity: "critical",
    hr: 128, spo2: 89,
    aiInsight: "Nguy cơ đột quỵ / nhồi máu cơ tim cao. Đề xuất: chuẩn bị máy chụp CT và báo động Đội Can thiệp Tim mạch.",
  },
  {
    id: "#BN-202", symptom: "TNGT — chấn thương sọ não, chảy máu",
    eta: "9 phút", severity: "critical",
    hr: 142, spo2: 91,
    aiInsight: "Shock mất máu вероят. Đề xuất: giữ 2 đơn vị máu O, chuẩn bị phòng mổ cấp cứu + máy thở.",
  },
  {
    id: "#BN-203", symptom: "Sốt 39.5°C, ho, SpO2 tụt",
    eta: "15 phút", severity: "medium",
    hr: 105, spo2: 93,
    aiInsight: "Nghi viêm phổi nặng. Đề xuất: test nhanh + cách ly tạm, chuẩn bị giường Truyền nhiễm.",
  },
  {
    id: "#BN-204", symptom: "Gãy xương cẳng chân sau ngã cao",
    eta: "22 phút", severity: "medium",
    hr: 88, spo2: 98,
    aiInsight: "Chấn thương chỉnh hình đơn thuần. Đề xuất: X-quang tại chỗ, không cần ICU — điều phối khoa Chấn thương.",
  },
];

const menuItems = [
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { id: "er", label: "Cấp cứu", icon: Siren },
  { id: "ai", label: "AI Dự báo", icon: BrainCircuit },
  { id: "radar", label: "Radar điều phối", icon: Radar },
  { id: "blood", label: "Kho máu", icon: Droplets },
  { id: "staff", label: "Nhân sự trực", icon: Users },
  { id: "settings", label: "Cài đặt", icon: Settings },
];

/* ================= Sub-component: thanh tiến trình tài nguyên ============ */
function ResourceBar({ label, free, total, Icon, dark }) {
  const pct = Math.round((free / total) * 100);
  const critical = pct < 20;
  const barColor = critical ? "bg-red-500" : pct < 50 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className={`rounded-xl border p-4 ${dark ? "border-slate-700/60 bg-slate-800/60" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${critical ? "text-red-500" : dark ? "text-cyan-300" : "text-blue-600"}`} />
          <span className={`text-sm font-semibold ${dark ? "text-slate-200" : "text-slate-700"}`}>{label}</span>
        </div>
        <span className={`font-mono text-sm font-bold ${critical ? "text-red-500" : dark ? "text-slate-100" : "text-slate-900"}`}>
          {free}/{total} • {pct}%
        </span>
      </div>
      <div className={`mt-2 h-2.5 overflow-hidden rounded-full ${dark ? "bg-slate-700" : "bg-slate-200"}`}>
        <div className={`h-full rounded-full transition-all ${barColor} ${critical ? "animate-pulse" : ""}`} style={{ width: `${pct}%` }} />
      </div>
      {critical && (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-bold text-red-500 animate-pulse">
          <AlertTriangle className="h-3 w-3" /> CẢNH BÁO: dưới 20% — cần bổ sung ngay!
        </p>
      )}
    </div>
  );
}

/* ================= Sub-component: thẻ bệnh nhân radar =================== */
function PatientCard({ p, dark, onAccept, onDivert }) {
  const critical = p.severity === "critical";
  return (
    <div className={`rounded-xl border p-4 transition hover:shadow-lg ${
      dark
        ? critical ? "border-red-500/50 bg-slate-800/80 shadow-red-950/30" : "border-slate-700/60 bg-slate-800/60"
        : critical ? "border-red-300 bg-red-50/50" : "border-slate-200 bg-white"
    }`}>
      {/* Dòng 1: mã + ETA + badge */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`font-mono font-black ${dark ? "text-cyan-300" : "text-blue-700"}`}>{p.id}</span>
        <span className={`flex items-center gap-1 text-xs ${dark ? "text-slate-300" : "text-slate-500"}`}>
          <Clock className="h-3.5 w-3.5" /> ETA {p.eta}
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${critical ? "bg-red-500/15 text-red-500" : "bg-amber-400/15 text-amber-500"}`}>
          {critical ? "KHẨN CẤP" : "TRUNG BÌNH"}
        </span>
      </div>
      {/* Triệu chứng */}
      <p className={`mt-2 text-sm font-semibold ${dark ? "text-slate-100" : "text-slate-800"}`}>{p.symptom}</p>
      {/* Sinh tồn */}
      <div className="mt-2 flex gap-2 text-xs font-mono">
        <span className={`flex items-center gap-1 rounded-lg px-2 py-1 ${dark ? "bg-slate-700/70 text-rose-300" : "bg-slate-100 text-rose-600"}`}>
          <HeartPulse className="h-3.5 w-3.5" /> {p.hr} bpm
        </span>
        <span className={`flex items-center gap-1 rounded-lg px-2 py-1 ${dark ? "bg-slate-700/70 text-cyan-300" : "bg-slate-100 text-cyan-700"}`}>
          <Activity className="h-3.5 w-3.5" /> SpO2 {p.spo2}%
        </span>
      </div>
      {/* AI Insight */}
      <div className={`mt-2 flex gap-2 rounded-lg border-l-2 border-violet-500 p-2.5 text-xs leading-relaxed ${dark ? "bg-violet-500/10 text-violet-200" : "bg-violet-50 text-violet-900"}`}>
        <BrainCircuit className="h-4 w-4 shrink-0 text-violet-500" />
        <span><b>AI Insight:</b> {p.aiInsight}</span>
      </div>
      {/* Nút thao tác */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => onAccept(p.id)}
          className="flex items-center justify-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white shadow shadow-emerald-500/30 transition hover:bg-emerald-400 active:scale-95">
          <CheckCircle2 className="h-4 w-4" /> Nhận ca
        </button>
        <button onClick={() => onDivert(p.id)}
          className={`flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold transition active:scale-95 ${dark ? "border-slate-600 text-slate-300 hover:bg-slate-700" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}>
          <XCircle className="h-4 w-4" /> Chuyển viện
        </button>
      </div>
    </div>
  );
}

/* ================= APP CHÍNH ================= */
export default function App() {
  // Theme + điều khiển trung tâm
  const [dark, setDark] = useState(true);
  const [override, setOverride] = useState(false); // Emergency Override
  const [broadcast, setBroadcast] = useState("");  // toast thông báo
  const [activeMenu, setActiveMenu] = useState("overview");

  // KPIs + tài nguyên + bệnh nhân
  const [erBedsFree, setErBedsFree] = useState(7);
  const [resources, setResources] = useState(initialResources);
  const [patients, setPatients] = useState(initialPatients);
  const [log, setLog] = useState(["Hệ thống khởi động — kết nối AI Triage Engine..."]);

  const pushLog = (msg) => setLog((prev) => [`[${new Date().toLocaleTimeString("vi-VN")}] ${msg}`, ...prev].slice(0, 6));

  // Cảnh báo AI: forecast có chạm ngưỡng quá tải không?
  const aiWarning = useMemo(
    () => initialChartData.some((d) => d.forecast !== null && d.forecast >= OVERLOAD_THRESHOLD),
    []
  );

  // Nhận ca: xóa khỏi radar + trừ 1 giường cấp cứu (không < 0)
  const handleAccept = (id) => {
    setPatients((prev) => prev.filter((p) => p.id !== id));
    setErBedsFree((b) => Math.max(0, b - 1));
    setResources((r) => ({ ...r, icu: { ...r.icu, free: Math.max(0, r.icu.free - (id === "#BN-201" || id === "#BN-202" ? 1 : 0)) } }));
    pushLog(`Đã NHẬN ${id} — trừ 1 giường cấp cứu.`);
  };
  const handleDivert = (id) => {
    setPatients((prev) => prev.filter((p) => p.id !== id));
    pushLog(`Đã CHUYỂN HƯỚNG ${id} sang viện vệ tinh.`);
  };

  const handleBroadcast = () => {
    setBroadcast("Đã phát thông báo khẩn đến 12.400 người dân trong bán kính 10km!");
    pushLog("Phát BROADCAST khẩn cấp tới người dân xung quanh.");
    setTimeout(() => setBroadcast(""), 4000);
  };

  const shell = dark ? "bg-slate-950 text-slate-100" : "bg-slate-100 text-slate-800";
  const panel = dark ? "border-slate-700/60 bg-slate-900/70" : "border-slate-200 bg-white";
  const muted = dark ? "text-slate-400" : "text-slate-500";

  return (
    <div className={`flex min-h-screen ${shell}`}>
      {/* ================= SIDEBAR ================= */}
      <aside className={`hidden w-60 shrink-0 flex-col border-r p-4 lg:flex ${dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
        <div className="flex items-center gap-2 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow shadow-cyan-500/30">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-black leading-tight">BVĐK TRUNG TÂM</p>
            <p className={`flex items-center gap-1 text-[11px] ${muted}`}><Radio className="h-3 w-3 text-emerald-400" /> Command Center v2</p>
          </div>
        </div>
        <nav className="mt-6 space-y-1">
          {menuItems.map((m) => {
            const Icon = m.icon; const active = activeMenu === m.id;
            return (
              <button key={m.id} onClick={() => setActiveMenu(m.id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                  active
                    ? "bg-cyan-500/15 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,.25)]"
                    : dark ? "text-slate-400 hover:bg-slate-800 hover:text-slate-200" : "text-slate-600 hover:bg-slate-100"
                }`}>
                <span className="flex items-center gap-2.5"><Icon className="h-4 w-4" />{m.label}</span>
                {active && <ChevronRight className="h-4 w-4" />}
              </button>
            );
          })}
        </nav>
        {/* Dark/Light toggle */}
        <button onClick={() => setDark((d) => !d)}
          className={`mt-auto flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${dark ? "border-slate-700 hover:bg-slate-800" : "border-slate-200 hover:bg-slate-100"}`}>
          {dark ? <><Sun className="h-4 w-4 text-amber-400" /> Light Mode</> : <><Moon className="h-4 w-4 text-blue-600" /> Dark Mode</>}
        </button>
      </aside>

      {/* ================= MAIN ================= */}
      <div className="min-w-0 flex-1">
        {/* Banner override toàn app */}
        {override && (
          <div className="animate-pulse bg-red-600 px-4 py-2 text-center text-sm font-black uppercase tracking-wide text-white">
            ⛔ Emergency Override đang bật — App người dân hiện màu đỏ: tạm dừng điều hướng tới bệnh viện này
          </div>
        )}

        <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
          {/* ---------- TOP CONTROL BAR ---------- */}
          <section className={`rounded-2xl border p-4 sm:p-5 ${panel} ${override ? "shadow-[0_0_25px_rgba(239,68,68,.35)]" : dark ? "shadow-[0_0_25px_rgba(34,211,238,.08)]" : "shadow-sm"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-black sm:text-xl">Trung tâm Chỉ huy Cấp cứu <span className={dark ? "text-cyan-300" : "text-blue-600"}>• Trưởng ca trực</span></h1>
                <p className={`text-xs ${muted}`}>Dữ liệu live • AI Triage Engine đang phân tích • {patients.length} ca trên radar</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setOverride((o) => !o)}
                  className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg transition active:scale-95 ${override ? "animate-pulse bg-red-600 shadow-red-500/40" : "bg-gradient-to-r from-red-500 to-orange-500 shadow-orange-500/30 hover:brightness-110"}`}>
                  <ShieldAlert className="h-5 w-5" /> {override ? "Đang chặn luồng BN" : "Emergency Override"}
                </button>
                <button onClick={handleBroadcast}
                  className="flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-black uppercase text-slate-950 shadow shadow-cyan-500/30 transition hover:bg-cyan-400 active:scale-95">
                  <Megaphone className="h-5 w-5" /> Broadcast
                </button>
              </div>
            </div>
            {/* 3 KPI */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: "BN đang cấp cứu", value: "38", sub: `+${patients.length} đang đến`, icon: Siren, neon: "text-rose-400" },
                { label: "Công suất hoạt động", value: "85%", sub: "Ngưỡng quá tải 90%", icon: Activity, neon: "text-amber-400" },
                { label: "Chờ trung bình", value: "15 phút", sub: "Mục tiêu < 10 phút", icon: Clock, neon: "text-cyan-300" },
              ].map((k) => (
                <div key={k.label} className={`rounded-xl border p-3.5 ${dark ? "border-slate-700/60 bg-slate-800/60" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide"><k.icon className={`h-4 w-4 ${k.neon}`} /><span className={muted}>{k.label}</span></div>
                  <p className="mt-1 text-2xl font-black">{k.value}</p>
                  <p className={`text-xs ${muted}`}>{k.sub}</p>
                </div>
              ))}
            </div>
            {broadcast && (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> {broadcast}
              </p>
            )}
          </section>

          {/* ---------- KHU VỰC 1: AI PREDICTIVE ---------- */}
          <section className={`rounded-2xl border p-4 sm:p-5 ${panel}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-black"><BrainCircuit className="h-5 w-5 text-violet-400" /> AI Predictive Analytics — Dự báo quá tải</h2>
              {aiWarning
                ? <span className="animate-pulse rounded-full bg-red-500/15 px-3 py-1 text-xs font-black text-red-500">⚠️ AI: SẼ CHẠM NGƯỠNG QUÁ TẢI TRONG ~4H TỚI</span>
                : <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-400">Ổn định</span>}
            </div>
            <div className="mt-3 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={initialChartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={dark ? "#1e293b" : "#e2e8f0"} />
                  <XAxis dataKey="time" tick={{ fontSize: 11, fill: dark ? "#94a3b8" : "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: dark ? "#94a3b8" : "#64748b" }} />
                  <Tooltip contentStyle={{ background: dark ? "#0f172a" : "#fff", borderRadius: 12, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine y={OVERLOAD_THRESHOLD} label={{ value: "Ngưỡng quá tải (50)", fontSize: 11, fill: "#ef4444" }} stroke="#ef4444" strokeDasharray="5 5" />
                  <Area type="monotone" dataKey="forecast" stroke="none" fill="#a78bfa" fillOpacity={dark ? 0.12 : 0.15} name="Vùng dự báo" />
                  <Line type="monotone" dataKey="actual" name="Thực tế (12h qua)" stroke="#22d3ee" strokeWidth={3} dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="forecast" name="AI dự báo (6h tới)" stroke="#a78bfa" strokeWidth={3} strokeDasharray="7 5" dot={{ r: 3 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className={`mt-2 text-xs ${muted}`}>Đường <b className="text-cyan-400">liền</b> = lượng BN thực tế 12h qua • Đường <b className="text-violet-400">đứt nét</b> = AI dự báo 6h tới • Vạch đỏ = ngưỡng quá tải.</p>
          </section>

          {/* ---------- KHU VỰC 2: CRITICAL RESOURCES ---------- */}
          <section className={`rounded-2xl border p-4 sm:p-5 ${panel}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-black"><Ventilator className="h-5 w-5 text-cyan-300" /> Critical Resource Management — Nguồn lực sinh tử</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${dark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"}`}>
                Giường cấp cứu trống: <b className={erBedsFree === 0 ? "text-red-500" : "text-emerald-500"}>{erBedsFree}</b>
              </span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ResourceBar label={resources.icu.label} free={resources.icu.free} total={resources.icu.total} Icon={resources.icu.icon} dark={dark} />
              <ResourceBar label={resources.ventilator.label} free={resources.ventilator.free} total={resources.ventilator.total} Icon={resources.ventilator.icon} dark={dark} />
              <ResourceBar label={resources.doctors.label} free={resources.doctors.free} total={resources.doctors.total} Icon={resources.doctors.icon} dark={dark} />
              <ResourceBar label={resources.nurses.label} free={resources.nurses.free} total={resources.nurses.total} Icon={resources.nurses.icon} dark={dark} />
            </div>
            {/* Kho máu O/A/B/AB */}
            <div className={`mt-3 rounded-xl border p-4 ${dark ? "border-slate-700/60 bg-slate-800/60" : "border-slate-200 bg-slate-50"}`}>
              <p className="flex items-center gap-2 text-sm font-bold"><Droplets className="h-4 w-4 text-rose-400" /> Dự trữ máu theo nhóm</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {resources.blood.map((b) => {
                  const crit = b.pct < 20;
                  return (
                    <div key={b.type}>
                      <div className="flex justify-between text-xs font-bold"><span>Nhóm {b.type}</span><span className={crit ? "text-red-500" : ""}>{b.pct}%</span></div>
                      <div className={`mt-1 h-2.5 rounded-full ${dark ? "bg-slate-700" : "bg-slate-200"}`}>
                        <div className={`h-full rounded-full ${crit ? "animate-pulse bg-red-500" : b.pct < 50 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${b.pct}%` }} />
                      </div>
                      {crit && <p className="mt-1 animate-pulse text-[11px] font-bold text-red-500">⚠️ Dưới 20%!</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ---------- KHU VỰC 3: AI TRIAGE RADAR + LOG ---------- */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <section className={`rounded-2xl border p-4 sm:p-5 xl:col-span-2 ${panel}`}>
              <h2 className="flex items-center gap-2 font-black">
                <Radar className="h-5 w-5 text-cyan-300" /> AI Triage Radar — {patients.length} ca đang đến
              </h2>
              {patients.length === 0
                ? <p className="mt-4 rounded-xl bg-emerald-500/10 p-6 text-center text-sm font-bold text-emerald-400">✅ Radar trống — tất cả ca đã được xử lý.</p>
                : <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    {patients.map((p) => (
                      <PatientCard key={p.id} p={p} dark={dark} onAccept={handleAccept} onDivert={handleDivert} />
                    ))}
                  </div>}
            </section>
            {/* Nhật ký điều hành */}
            <section className={`rounded-2xl border p-4 sm:p-5 ${panel}`}>
              <h2 className={`flex items-center gap-2 font-black`}><Activity className="h-5 w-5 text-emerald-400" /> Nhật ký điều hành</h2>
              <ul className="mt-3 space-y-2">
                {log.map((l, i) => (
                  <li key={i} className={`rounded-lg px-3 py-2 font-mono text-[11px] leading-relaxed ${dark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"}`}>{l}</li>
                ))}
              </ul>
              <p className={`mt-3 text-[11px] ${muted}`}>Mẹo: bấm “Nhận ca” → thẻ biến mất khỏi radar + giường cấp cứu −1. Bấm “Chuyển viện” → chỉ xóa khỏi radar.</p>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CommandTopBar from "./CommandTopBar.jsx";
import MetricsGrid from "./MetricsGrid.jsx";
import DeptMatrix from "./DeptMatrix.jsx";
import PredictiveChart from "./PredictiveChart.jsx";
import ResourceBars from "./ResourceBars.jsx";
import TriageFeed from "./TriageFeed.jsx";
import ModerationView from "./ModerationView.jsx";
import BedBoard from "./BedBoard.jsx";
import NurseStation from "./NurseStation.jsx";
import PharmacyView from "./PharmacyView.jsx";
import SearchBar from "./SearchBar.jsx";
import AICopilot from "./AICopilot.jsx";
import AuditCenter from "./AuditCenter.jsx";
import DoctorModal from "./DoctorModal.jsx";
import HospitalAdmin from "./hospital/HospitalAdmin.jsx";
import { fetchDashboard } from "../services/api.js";
import { socket } from "../services/socket.js";
import { useRole } from "../context/RoleContext.jsx";
import { DEPT_BEDS, deptOf, STATUS_LABEL, CLOSED_STATES, ACTIVE_STATES } from "../rbac/roles.js";

function beep(freq = 880, ms = 0.35) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = freq; o.type = "sine";
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    o.start(); o.stop(ctx.currentTime + ms);
  } catch {}
}

/**
 * Enterprise Dashboard: RBAC + realtime.
 * - REST khởi tạo, socket NEW_EMERGENCY / PATIENT_UPDATED / UPDATE_RESOURCES.
 * - Modal y lệnh PUT /api/emergency/:id.
 */
export default function Dashboard() {
  const { roleId, visible } = useRole();
  const isCeo = roleId === "ceo";
  const [view, setView] = useState("ops"); // ops | hospital
  const [override, setOverride] = useState(false);
  const [stats, setStats] = useState(null);
  const [chart, setChart] = useState([]);
  const [patients, setPatients] = useState([]);
  const [deptBeds, setDeptBeds] = useState(DEPT_BEDS);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState("");
  const [connected, setConnected] = useState(socket.connected);
  const [lastUpdate, setLastUpdate] = useState("");

  useEffect(() => {
    let alive = true;
    fetchDashboard()
      .then((d) => {
        if (!alive) return;
        setStats(d.stats); setChart(d.chart); setPatients(d.patients);
      })
      .catch(() => alive && setToast("⚠️ Không nối được backend :5000 — kiểm tra terminal backend."));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const upsert = (p) =>
      setPatients((prev) => (prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [p, ...prev]));
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onNew = (p) => {
      touch();
      upsert(p);
      beep();
      setToast(`🚨 Ca mới ${p.id} vừa đổ về Radar!`);
      setTimeout(() => setToast(""), 4000);
    };
    const onUpdated = (p) => {
      touch();
      // Đóng ca -> rời feed; nhận/điều trị -> trừ giường khoa + ở lại với status mới
      if (CLOSED_STATES.includes(p.status)) {
        setPatients((prev) => prev.filter((x) => x.id !== p.id));
        setToast(`✅ ${p.id}: ${STATUS_LABEL[p.status]}`);
      } else {
        upsert(p);
        if (ACTIVE_STATES.includes(p.status)) {
          const d = deptOf(p);
          setDeptBeds((b) => (b[d] ? { ...b, [d]: { ...b[d], free: Math.max(0, b[d].free - 1) } } : b));
        }
        setToast(`✅ ${p.id}: ${STATUS_LABEL[p.status] || p.status}`);
      }
      setTimeout(() => setToast(""), 4000);
      beep(660, 0.2);
    };
    const onResources = ({ stats: s }) => { if (s) setStats(s); touch(); };
    const touch = () => setLastUpdate(new Date().toLocaleTimeString("vi-VN"));
    const onFlagged = (p) => {
      touch();
      setToast(`🛡️ SOS ${p.id} bị chặn kiểm duyệt (risk ${p.screening?.riskScore})`);
      setTimeout(() => setToast(""), 4000);
      beep(440, 0.4);
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("NEW_EMERGENCY", onNew);
    socket.on("PATIENT_UPDATED", onUpdated);
    socket.on("UPDATE_RESOURCES", onResources);
    socket.on("EMERGENCY_FLAGGED", onFlagged);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("NEW_EMERGENCY", onNew);
      socket.off("PATIENT_UPDATED", onUpdated);
      socket.off("UPDATE_RESOURCES", onResources);
      socket.off("EMERGENCY_FLAGGED", onFlagged);
    };
  }, []);

  const shown = visible(patients);

  return (
    <div className={`min-h-screen bg-zinc-950 font-[Inter,system-ui] tracking-tight text-zinc-100 ${override ? "shadow-[inset_0_0_120px_rgba(239,68,68,.25)]" : ""}`}>
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <CommandTopBar connected={connected} override={override} setOverride={setOverride} patientCount={shown.length} isCeo={isCeo} lastUpdate={lastUpdate} />
        <div className="flex gap-1.5 rounded-2xl bg-white/[0.04] p-1.5 ring-1 ring-white/10 backdrop-blur-xl">
          {[["ops", "🚨 Điều hành chuyên môn"], ["hospital", "🏢 Nhân sự & Tổ chức DEMO1"]].map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} className={`flex-1 rounded-xl px-3 py-2 text-xs font-black ${view === id ? "bg-white text-zinc-950" : "text-zinc-300 hover:bg-white/10"}`}>{label}</button>
          ))}
        </div>
        {view === "hospital" ? <HospitalAdmin /> : (<>
        <AnimatePresence>{toast && (
          <motion.div initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}
            className="rounded-2xl bg-red-500/15 p-3 text-center text-sm font-bold text-red-300 ring-1 ring-red-500/30 backdrop-blur-xl">{toast}</motion.div>
        )}</AnimatePresence>
        <MetricsGrid stats={stats} patients={patients} deptBeds={deptBeds} />
        <SearchBar />
        <AICopilot />
        {isCeo && <DeptMatrix patients={patients} deptBeds={deptBeds} />}
        <PredictiveChart data={chart} />
        {isCeo && <ResourceBars stats={stats} />}
        {(roleId === "ceo" || roleId === "admin") && <ModerationView />}
        {(roleId === "ceo" || roleId === "admin") && <BedBoard />}
        {(roleId === "nurse" || roleId === "ceo" || roleId === "admin") && <NurseStation patients={patients} />}
        {(roleId === "ceo" || roleId === "admin") && <PharmacyView patients={patients} />}
        {(roleId === "ceo" || roleId === "admin") && <AuditCenter />}
        <TriageFeed patients={patients} onOpen={setSelected} />
        </>)}
      </div>
      <AnimatePresence>
        {selected && (
          <DoctorModal
            patient={patients.find((p) => p.id === selected.id) || selected}
            onClose={() => setSelected(null)}
            onSaved={() => {}}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

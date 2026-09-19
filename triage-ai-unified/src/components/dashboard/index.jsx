import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import TopControlBar from "./TopControlBar.jsx";
import PredictiveChart from "./PredictiveChart.jsx";
import ResourceStatus from "./ResourceStatus.jsx";
import TriageRadar from "./TriageRadar.jsx";
import { useEmergencyListener } from "../../hooks/useEmergencyChannel.js";

const initialResources = {
  icu: { free: 3, total: 20 },
  vent: { free: 4, total: 15 },
  doctors: { free: 12, total: 25 },
  nurses: { free: 28, total: 60 },
  blood: [
    { type: "O", pct: 65 }, { type: "A", pct: 42 },
    { type: "B", pct: 18 }, { type: "AB", pct: 12 },
  ],
};

const initialPatients = [
  { id: "#BN-201", symptom: "Đau ngực trái lan vai, khó thở", eta: "4 phút", severity: "critical", hr: 128, spo2: 89, aiInsight: "Nguy cơ nhồi máu cơ tim cao. Chuẩn bị ECG + báo Đội Can thiệp Tim mạch." },
  { id: "#BN-202", symptom: "TNGT — chấn thương sọ não", eta: "9 phút", severity: "critical", hr: 142, spo2: 91, aiInsight: "Shock mất máu. Giữ 2 đơn vị máu O, chuẩn bị phòng mổ + máy thở." },
  { id: "#BN-203", symptom: "Sốt 39.5°C, SpO2 tụt", eta: "15 phút", severity: "medium", hr: 105, spo2: 93, aiInsight: "Nghi viêm phổi nặng. Test nhanh + cách ly, giữ giường Truyền nhiễm." },
];

/** Dashboard index: gộp TopControlBar + Chart + Resources + Radar. */
export default function Dashboard() {
  const [override, setOverride] = useState(false);
  const [resources] = useState(initialResources);
  const [patients, setPatients] = useState(initialPatients);
  const [toast, setToast] = useState("");

  // Real-time: tự nảy card + bíp + toast khi SOS bắn tới
  useEmergencyListener((d) => {
    setPatients((prev) => [{ ...d, received: false }, ...prev]);
    setToast(`🚨 Ca mới ${d.id} vừa đổ về Radar!`);
    setTimeout(() => setToast(""), 4000);
  });

  return (
    <div className={`min-h-screen bg-zinc-950 pt-14 font-[Inter,system-ui] tracking-tight text-zinc-100 ${override ? "shadow-[inset_0_0_120px_rgba(239,68,68,.25)]" : ""}`}>
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <TopControlBar override={override} setOverride={setOverride} patientCount={patients.length} onBroadcast={() => setToast("Đã phát broadcast tới 12.400 dân quanh viện.")} />
        <AnimatePresence>{toast && (
          <motion.div initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="animate-pulse rounded-2xl bg-red-500/15 p-3 text-center text-sm font-bold text-red-300 ring-1 ring-red-500/30 backdrop-blur-xl">{toast}</motion.div>
        )}</AnimatePresence>
        <PredictiveChart />
        <ResourceStatus resources={resources} />
        <TriageRadar patients={patients} onAccept={(id) => setPatients((p) => p.filter((x) => x.id !== id))} onDivert={(id) => setPatients((p) => p.filter((x) => x.id !== id))} />
      </div>
    </div>
  );
}

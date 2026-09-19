import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import InputView from "./InputView.jsx";
import ProcessingView from "./ProcessingView.jsx";
import ResultView from "./ResultView.jsx";
import SuccessView from "./SuccessView.jsx";
import { sendEmergencyPatient } from "../../hooks/useEmergencyChannel.js";
import { analyzeSymptoms } from "../../utils/aiTriageEngine.js";

const spring = { type: "spring", stiffness: 300, damping: 28 };

/** SosApp index: quản lý 4 views + bắn BroadcastChannel khi báo viện. */
export default function SosApp() {
  const [view, setView] = useState("input");
  const [symptom, setSymptom] = useState("");
  const [listening, setListening] = useState(false);
  const [step, setStep] = useState(0);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Fallback cho trình duyệt không có SpeechRecognition (InputView tự xử lý mic thật).
  // Giữ hàm này để tương thích prop cũ onToggleMic.
  const toggleMic = (force) => {
    if (typeof force === "boolean") { setListening(force); return; }
    setListening((v) => !v);
  };
  const search = () => {
    if (!symptom.trim()) setSymptom("Đau thắt ngực, khó thở...");
    setView("processing"); setStep(0);
    timers.current.push(setTimeout(() => setStep(1), 850));
    timers.current.push(setTimeout(() => setStep(2), 1700));
    timers.current.push(setTimeout(() => setView("result"), 2600));
  };
  // Luồng mới: Textarea (giọng nói thật) -> analyzeSymptoms -> payload Broadcast
  const report = () => {
    const raw = (symptom || "").trim() || "Đau thắt ngực, khó thở...";
    const ai = analyzeSymptoms(raw);
    sendEmergencyPatient({
      id: "#BN-999",
      symptom: raw, // câu nói thật của user
      eta: "5 phút",
      severity: ai.severity, // critical | medium | low (Dashboard map màu)
      department: ai.department,
      severityLabel: ai.severityLabel,
      hr: 126,
      spo2: 90,
      aiInsight: `[${ai.department} | ${ai.severityLabel}] ${ai.insight}`,
    });
    setView("success");
  };

  return (
    <div className="min-h-screen bg-zinc-200 pt-14 font-[Inter,system-ui] tracking-tight sm:py-16">
      <div className="relative mx-auto flex h-screen max-w-md flex-col overflow-hidden bg-gray-50/90 shadow-2xl backdrop-blur-3xl sm:h-[840px] sm:rounded-[2rem] sm:ring-8 sm:ring-zinc-900">
        <AnimatePresence mode="wait">
          <motion.div key={view} initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -30, opacity: 0 }} transition={spring} className="h-full">
            {view === "input" && <InputView symptom={symptom} setSymptom={setSymptom} listening={listening} setListening={setListening} onToggleMic={toggleMic} onSearch={search} />}
            {view === "processing" && <ProcessingView step={step} />}
            {view === "result" && <ResultView onReport={report} onBack={() => setView("input")} />}
            {view === "success" && <SuccessView onCancel={() => setView("input")} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

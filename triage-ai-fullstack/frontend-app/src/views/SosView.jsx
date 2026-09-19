import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Siren, Mic, MicOff, Search, BrainCircuit, Hospital,
  Navigation, Check, PhoneCall, Map as MapIcon, Clock, Milestone, Loader2,
  Ambulance, ShieldAlert,
} from "lucide-react";
import { analyzeSymptom } from "../utils/triageEngine.js";
import { sendEmergencySignal } from "../services/api.js";
import { socket, joinCase } from "../services/realtime.js";
import { NotifBell } from "../components/NotificationsPanel.jsx";
import EmergencyWidget from "../components/EmergencyWidget.jsx";

const spring = { type: "spring", stiffness: 300, damping: 28 };
const PROCESS_LABELS = [
  "AI đang phân tích triệu chứng...",
  "Đang đối chiếu chuyên khoa...",
  "Đang kiểm tra giường bệnh...",
];

/**
 * SosView — màn hình Cấp cứu Nhanh (Tab 1).
 * Máy trạng thái con: input -> processing (~2.5s) -> result -> success.
 * Props: profile (hồ sơ bệnh nền) + onNavigateTab (chuông thông báo nhảy tab).
 */
export default function SosView({ profile, onNavigateTab }) {
  const [sub, setSub] = useState("input");
  const [symptom, setSymptom] = useState("");
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState("");
  const [step, setStep] = useState(0);
  const [analysis, setAnalysis] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [caseId, setCaseId] = useState("");
  const [pendingInfo, setPendingInfo] = useState(null); // FLAGGED -> chờ kiểm duyệt
  const [gps, setGps] = useState(null); // {distanceKm, etaMinutes, status}
  const [timeline, setTimeline] = useState([]); // cập nhật từ bác sĩ
  const [emStage, setEmStage] = useState(""); // trạng thái backend thực tế
  const [conn, setConn] = useState(socket.connected);
  const recogRef = useRef(null);
  const timers = useRef([]);

  const supported =
    typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      try {
        recogRef.current?.abort();
      } catch {}
    },
    []
  );

  /* ---------- Voice Input (Web Speech API, vi-VN) ---------- */
  const handleMic = () => {
    setMicError("");
    if (listening) {
      try {
        recogRef.current?.stop();
      } catch {}
      setListening(false);
      return;
    }
    if (!supported) {
      setMicError("Trình duyệt không hỗ trợ voice. Đã điền text mẫu — sửa lại rồi tiếp tục.");
      setSymptom((s) => s || "Bố tôi bị đau thắt ngực, khó thở...");
      return;
    }
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recog = new SR();
      recogRef.current = recog;
      recog.lang = "vi-VN";
      recog.interimResults = true;
      recog.continuous = false;
      let finalText = "";
      recog.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText += t;
          else interim += t;
        }
        setSymptom((finalText + " " + interim).trim());
      };
      recog.onerror = (e) => {
        const map = {
          "not-allowed": "Bạn chặn quyền Micro. Bấm 🔒 trên thanh địa chỉ để cho phép.",
          "service-not-allowed": "Cần HTTPS/localhost để dùng Micro.",
          "no-speech": "Chưa nghe rõ — nói to, gần mic hơn.",
          "audio-capture": "Không tìm thấy Micro.",
          network: "Lỗi mạng khi nhận diện.",
        };
        setMicError(map[e.error] || `Lỗi mic: ${e.error}`);
        setListening(false);
      };
      recog.onend = () => setListening(false);
      recog.start();
      setListening(true);
    } catch {
      setMicError("Không khởi động được Micro. Dùng text mẫu.");
      setSymptom((s) => s || "Đau thắt ngực, khó thở...");
      setListening(false);
    }
  };

  /* ---------- input -> processing (radar ~2.5s) -> result ---------- */
  const handleSearch = () => {
    const text = symptom.trim();
    if (!text) return; // nút đã disabled, guard thêm cho chắc
    setAnalysis(analyzeSymptom(text));
    setSendError("");
    setSub("processing");
    setStep(0);
    timers.current.push(setTimeout(() => setStep(1), 850));
    timers.current.push(setTimeout(() => setStep(2), 1700));
    timers.current.push(setTimeout(() => setSub("result"), 2600));
  };

  /* ---------- result -> POST /api/emergency -> success (chỉ khi 200) ---------- */
  const handleConfirm = async () => {
    if (sending) return;
    setSending(true);
    setSendError("");
    try {
      const raw = symptom.trim();
      const ai = analysis || analyzeSymptom(raw);
      const p = profile || {};
      const profileBits = [
        p.bloodType ? `Nhóm máu ${p.bloodType}` : null,
        p.bhyt ? `BHYT ${p.bhyt}` : null,
        (p.conditions || []).length ? `Bệnh nền: ${p.conditions.join(", ")}` : null,
        (p.allergies || []).length ? `Dị ứng: ${p.allergies.join(", ")}` : null,
        p.contactPhone ? `Người nhà: ${(p.contactName || "").trim()} ${p.contactPhone}`.trim() : null,
      ].filter(Boolean);
      const payload = {
        symptom: raw,
        severity: ai.severity, // critical | medium | low
        department: ai.department,
        severityLabel: ai.severityLabel,
        aiInsight: `[${ai.department} | ${ai.severityLabel}] ${ai.insight}${
          profileBits.length ? ` | Hồ sơ: ${profileBits.join(" • ")}` : ""
        }`,
        eta: "5 phút",
        hr: 126,
        spo2: 90,
        bloodType: p.bloodType || "",
        bhyt: p.bhyt || "",
        conditions: p.conditions || [],
        allergies: p.allergies || [],
        emergencyContact: { name: p.contactName || "", phone: p.contactPhone || "" },
      };
      const created = await sendEmergencySignal(payload); // POST /api/emergency
      if (created?.emState === "FLAGGED" || created?.status === "FLAGGED") {
        // Anti-sabotage chặn: KHÔNG báo động, chờ kiểm duyệt
        setCaseId(created.id);
        setPendingInfo(created.screening || {});
        setSub("pending");
      } else if (created?.id) {
        setCaseId(created.id);
        setGps(null);
        setTimeline([]);
        joinCase(created.id); // nghe GPS + trạng thái realtime của ca mình
        setSub("success");
      } else {
        setSendError("Backend phản hồi lạ. Thử lại giúp bạn.");
      }
    } catch {
      setSendError("Không gửi được báo động (backend :5000 offline?). Kiểm tra mạng rồi thử lại.");
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setSub("input");
    setSendError("");
    setPendingInfo(null);
    setGps(null);
    setTimeline([]);
    setEmStage("");
  };

  // Realtime của ca mình: GPS xe + cập nhật bác sĩ (lọc đúng caseId)
  useEffect(() => {
    if (!caseId) return;
    const onConn = () => { setConn(true); joinCase(caseId); };
    const onDis = () => setConn(false);
    const onGps = (g) => {
      if (g.emergencyId === caseId || g.patientId === caseId) setGps(g);
    };
    const onStatus = (s) => {
      if (s.emergencyId === caseId || s.patientId === caseId) {
        setTimeline((t) => [...t.slice(-9), s]);
      }
    };
    // Trạng thái backend thực tế của ca mình (VERIFIED/ACTIVE/...)
    const onEm = (p) => {
      if (p.id === caseId || p.uuid === caseId) setEmStage(p.emState || p.status);
    };
    socket.on("connect", onConn);
    socket.on("disconnect", onDis);
    socket.on("GPS_LOCATION_UPDATED", onGps);
    socket.on("PATIENT_STATUS_UPDATED", onStatus);
    socket.on("EMERGENCY_UPDATED", onEm);
    return () => {
      socket.off("connect", onConn);
      socket.off("disconnect", onDis);
      socket.off("GPS_LOCATION_UPDATED", onGps);
      socket.off("PATIENT_STATUS_UPDATED", onStatus);
      socket.off("EMERGENCY_UPDATED", onEm);
    };
  }, [caseId]);

  const empty = !symptom.trim();

  return (
    <div className="h-full">
      <AnimatePresence mode="wait">
        {/* ================= SUB-VIEW: INPUT ================= */}
        {sub === "input" && (
          <motion.div key="in" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={spring} className="flex h-full flex-col">
            {/* Widget SOS 1 chạm — luôn sẵn sàng đầu màn hình */}
            <div className="bg-gradient-to-r from-red-600 to-orange-500 pb-1 pt-2">
              <EmergencyWidget />
            </div>
            <div className="bg-gradient-to-r from-red-600 to-orange-500 px-5 pb-6 pt-2 text-white">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-xl font-black tracking-tight">
                  <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/20">
                    <Siren className="h-5 w-5" />
                  </span>
                  Cấp Cứu Nhanh
                </p>
                <NotifBell onNavigate={onNavigateTab} />
              </div>
              <p className="mt-0.5 text-xs text-white/85">Nói triệu chứng — AI tự động phân tích</p>
            </div>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
              <textarea
                value={symptom} onChange={(e) => setSymptom(e.target.value)} autoFocus rows={4}
                placeholder="Mô tả triệu chứng (VD: Bố tôi bị đau thắt ngực, khó thở...)"
                className="w-full resize-none rounded-3xl bg-white p-4 text-[15px] tracking-tight shadow-sm ring-1 ring-black/5 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-red-300"
              />

              {/* Nút Micro gradient cam-đỏ + viền lan tỏa */}
              <div className="flex flex-col items-center py-1">
                <motion.button whileTap={{ scale: 0.9 }} onClick={handleMic} aria-label={listening ? "Dừng thu âm" : "Nhấn để nói"}
                  animate={listening ? { scale: [1, 1.14, 1] } : {}} transition={{ repeat: listening ? Infinity : 0, duration: 1.1 }}
                  className={`relative flex h-20 w-20 items-center justify-center rounded-full text-white shadow-xl transition ${
                    listening ? "animate-pulse bg-red-600 shadow-red-600/50" : "bg-gradient-to-br from-orange-500 to-red-600 shadow-red-500/40"
                  }`}>
                  {listening && (
                    <>
                      <motion.span animate={{ scale: [1, 2], opacity: [0.55, 0] }} transition={{ repeat: Infinity, duration: 1.1 }} className="absolute inset-0 rounded-full bg-red-400/50" />
                      <motion.span animate={{ scale: [1, 1.6], opacity: [0.4, 0] }} transition={{ repeat: Infinity, duration: 1.1, delay: 0.3 }} className="absolute inset-0 rounded-full bg-orange-400/40" />
                    </>
                  )}
                  {listening ? <MicOff className="relative h-8 w-8" /> : <Mic className="relative h-8 w-8" />}
                </motion.button>
                <p className={`mt-2 text-sm font-bold ${listening ? "animate-pulse text-red-600" : "text-zinc-500"}`}>
                  {listening ? "Đang nghe... hãy nói rõ triệu chứng" : "Nhấn để nói"}
                </p>
                {micError && <p className="mt-2 max-w-[300px] rounded-2xl bg-red-50 p-2 text-center text-[11px] text-red-600">{micError}</p>}
              </div>
            </div>

            {/* CTA đỏ, disabled khi chưa nhập */}
            <div className="p-4">
              <motion.button whileTap={empty ? {} : { scale: 0.98 }} onClick={handleSearch} disabled={empty}
                className={`flex w-full items-center justify-center gap-2 rounded-full py-4 text-[15px] font-black tracking-tight text-white shadow-xl transition ${
                  empty ? "cursor-not-allowed bg-zinc-300 shadow-none" : "bg-red-600 shadow-red-600/30"
                }`}>
                <Search className="h-5 w-5" /> Tìm bệnh viện phù hợp & Báo động
              </motion.button>
              {empty && <p className="mt-1.5 text-center text-[11px] text-zinc-400">Nhập hoặc nói triệu chứng để kích hoạt SOS</p>}
            </div>
          </motion.div>
        )}

        {/* ================= SUB-VIEW: PROCESSING (Holographic Radar) ================= */}
        {sub === "processing" && (
          <motion.div key="pr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full flex-col items-center justify-center bg-zinc-950 px-8 text-center">
            <div className="relative flex h-52 w-52 items-center justify-center">
              {[0, 1, 2, 3].map((i) => (
                <motion.span key={i} className="absolute inset-0 rounded-full border border-cyan-400/40" style={{ margin: i * 16 }}
                  initial={{ opacity: 0.8 }} animate={{ opacity: [0.8, 0.15, 0.8] }}
                  transition={{ repeat: Infinity, duration: 2.4, delay: i * 0.3 }} />
              ))}
              <motion.span className="absolute inset-0 rounded-full"
                style={{ background: "conic-gradient(from 0deg, rgba(34,211,238,.6), transparent 25%)" }}
                animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }} />
              <motion.span animate={{ scale: [1, 1.3, 1], opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.6 }}
                className="absolute h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_20px_rgba(34,211,238,.9)]" />
              <BrainCircuit className="relative h-11 w-11 text-cyan-200" />
            </div>
            <p key={step} className="mt-6 min-h-[24px] animate-pulse text-sm text-cyan-200">{PROCESS_LABELS[step]}</p>
          </motion.div>
        )}

        {/* ================= SUB-VIEW: RESULT ================= */}
        {sub === "result" && (
          <motion.div key="rs" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring} className="relative flex h-full flex-col overflow-hidden bg-zinc-950">
            <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(rgba(56,189,248,.35) 1.2px, transparent 1.2px)", backgroundSize: "16px 16px" }}>
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 360 600" fill="none" preserveAspectRatio="none">
                <motion.path d="M70 520 C 120 420, 160 340, 250 180" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round"
                  strokeDasharray="2 10" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4 }} />
              </svg>
              <span className="absolute bottom-[260px] left-6 rounded-full bg-cyan-400 px-3 py-1.5 text-[11px] font-bold text-zinc-950">📍 Vị trí của bạn</span>
              <span className="absolute right-6 top-24 rounded-full bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white">🏥 BVĐK Trung tâm</span>
            </div>
            <motion.div initial={{ y: 80 }} animate={{ y: 0 }} transition={spring}
              className="relative mt-auto rounded-t-[1.75rem] border-t border-white/10 bg-zinc-900/70 p-4 backdrop-blur-xl">
              <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-zinc-600" />
              <div className="rounded-3xl bg-white p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white">
                    <Hospital className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="font-black tracking-tight text-zinc-900">Bệnh viện Đa khoa Trung tâm</p>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-bold">
                      <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700"><Milestone className="h-3 w-3" /> 2.5 km • 5 phút</span>
                      {analysis && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">⚡ {analysis.department} • {analysis.severityLabel}</span>}
                    </div>
                  </div>
                </div>
                {analysis && <p className="mt-2 rounded-2xl bg-violet-50 p-2.5 text-[11px] leading-relaxed text-violet-900"><b>AI:</b> {analysis.insight}</p>}
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleConfirm} disabled={sending}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-red-600 py-4 text-[15px] font-black text-white shadow-lg shadow-red-600/30 disabled:opacity-70">
                  {sending ? <><Loader2 className="h-5 w-5 animate-spin" /> Đang gửi báo động...</> : <><Navigation className="h-5 w-5" /> Xác nhận gửi báo động</>}
                </motion.button>
                {sendError && <p className="mt-2 rounded-2xl bg-red-50 p-2 text-center text-[11px] font-bold text-red-600">{sendError}</p>}
              </div>
              <button onClick={reset} className="mt-1 w-full py-2 text-xs font-bold text-zinc-400">Hủy / Nhập lại</button>
            </motion.div>
          </motion.div>
        )}

        {/* ================= SUB-VIEW: SUCCESS ================= */}
        {sub === "success" && (
          <motion.div key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full flex-col bg-gradient-to-b from-emerald-500 to-teal-600 text-white">
            <div className="flex flex-col items-center px-6 pt-14 text-center">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16 }}
                className="flex h-28 w-28 items-center justify-center rounded-full bg-white/20 backdrop-blur">
                <svg viewBox="0 0 100 100" className="h-20 w-20">
                  <motion.circle cx="50" cy="50" r="44" fill="none" stroke="#fff" strokeWidth="7"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7 }} />
                  <motion.path d="M32 52 L45 65 L70 38" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.55 }} />
                </svg>
              </motion.div>
              <h2 className="mt-4 flex items-center gap-1.5 text-xl font-black tracking-tight"><Check className="h-6 w-6" /> Báo động đã gửi!</h2>
              <p className="mx-auto mt-1.5 max-w-[290px] text-[13px] text-white/90">
                Bệnh viện đã nhận hồ sơ {caseId && <b className="font-mono">{caseId}</b>} (HTTP 200 OK) và đang chuẩn bị tiếp đón.
              </p>
              <p className="mt-2 flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold"><Clock className="h-3 w-3" /> ETA 5 phút</p>
              <p className={`mt-1.5 text-[10px] font-bold ${conn ? "text-white/70" : "animate-pulse text-amber-200"}`}>
                {conn ? "● Realtime đã nối" : "○ Đang kết nối lại..."}
              </p>
            </div>

            {/* Pipeline trạng thái backend thực tế */}
            <div className="mx-5 mb-2.5 flex flex-wrap items-center justify-center gap-1">
              {["SCREENING", "ACTIVE", "DISPATCHED", "EN_ROUTE", "ARRIVED"].map((s) => {
                const order = ["SCREENING", "ACTIVE", "DISPATCHED", "EN_ROUTE", "ARRIVED"];
                const cur = emStage || "ACTIVE";
                const reached = order.indexOf(s) <= Math.max(0, order.indexOf(cur));
                const label = { SCREENING: "Kiểm tra", ACTIVE: "Đã duyệt", DISPATCHED: "Điều xe", EN_ROUTE: "Đang tới", ARRIVED: "Đã tới" }[s];
                return (
                  <span key={s} className={`rounded-full px-2 py-0.5 text-[9px] font-black ${reached ? "bg-white text-emerald-700" : "bg-white/20 text-white/70"}`}>
                    {reached ? "✓ " : ""}{label}
                  </span>
                );
              })}
            </div>

            {/* GPS xe cấp cứu (SIMULATION) + timeline bác sĩ */}
            <div className="mx-5 space-y-2.5">
              <div className="rounded-3xl bg-white/15 p-4 backdrop-blur">
                <p className="flex items-center gap-1.5 text-xs font-black">
                  <Ambulance className="h-4 w-4" /> 🚑 Xe cấp cứu đang tới
                  <span className="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-[9px]">SIMULATION MODE</span>
                </p>
                {gps ? (
                  <>
                    <p className="mt-1 font-mono text-2xl font-black">{gps.distanceKm} km <span className="text-xs">• ETA {gps.etaMinutes} phút</span></p>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/20">
                      <motion.div animate={{ width: `${Math.max(4, Math.min(100, ((4.5 - gps.distanceKm) / 4.5) * 100))}%` }}
                        className="h-full rounded-full bg-white" />
                    </div>
                    <p className="mt-1 text-[10px] text-white/70">{gps.status === "ARRIVED" ? "✅ Xe đã tới nơi!" : "Đang trên đường..."}</p>
                  </>
                ) : (
                  <p className="mt-1 animate-pulse text-xs text-white/70">Chờ điều xe từ bệnh viện...</p>
                )}
              </div>
              {timeline.length > 0 && (
                <div className="rounded-3xl bg-white/15 p-4 backdrop-blur">
                  <p className="text-xs font-black">📡 LIVE UPDATE từ bác sĩ</p>
                  <div className="mt-2 space-y-2">
                    {timeline.slice(-4).map((t, i) => (
                      <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl bg-white/15 p-2.5 text-xs leading-relaxed">
                        <b>{t.state}</b> — {t.message}
                        <span className="block text-[10px] text-white/60">{t.by} • vừa xong</span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col justify-end gap-2.5 p-5">
              <motion.a whileTap={{ scale: 0.97 }} href="tel:115"
                className="flex w-full items-center justify-center gap-2 rounded-full bg-red-600 py-4 font-black text-white shadow-xl">
                <PhoneCall className="h-5 w-5" /> Gọi xe Cấp cứu (115)</motion.a>
              <motion.button whileTap={{ scale: 0.97 }}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-4 font-black text-emerald-700 shadow-xl">
                <MapIcon className="h-5 w-5" /> Mở bản đồ chỉ đường</motion.button>
              <button onClick={reset} className="mx-auto py-2 text-xs font-bold text-white/70">Về màn hình nhập</button>
            </div>
          </motion.div>
        )}

        {/* ================= SUB-VIEW: PENDING (bị flagged) ================= */}
        {sub === "pending" && (
          <motion.div key="pd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full flex-col items-center justify-center bg-gradient-to-b from-amber-400 to-orange-600 px-8 text-center text-white">
            <ShieldAlert className="h-16 w-16" />
            <h2 className="mt-4 text-xl font-black tracking-tight">Đã nhận yêu cầu!</h2>
            <p className="mt-2 max-w-[290px] text-[13px] leading-relaxed text-white/90">
              Ca {caseId && <b className="font-mono">{caseId}</b>} đang <b>chờ xác minh</b> để chống báo động giả.
              Bệnh viện sẽ duyệt trong ít phút — giữ máy và ở yên vị trí an toàn.
            </p>
            {pendingInfo?.riskScore != null && (
              <p className="mt-2 font-mono text-[11px] text-white/70">Mã kiểm tra: risk {pendingInfo.riskScore}</p>
            )}
            <a href="tel:115" className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-white py-4 font-black text-orange-700 shadow-xl">
              <PhoneCall className="h-5 w-5" /> Gọi 115 nếu nguy kịch
            </a>
            <button onClick={reset} className="mx-auto py-3 text-xs font-bold text-white/70">Về màn hình nhập</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Siren, Satellite, Loader2, CheckCircle2 } from "lucide-react";
import { sendEmergencySignal } from "../services/api.js";
import { readProfile } from "../hooks/useMedicalProfile.js";

// Tọa độ giả lập trung tâm Q.1 (dùng khi GPS bị từ chối / desktop pitch)
const FALLBACK_POS = { lat: 10.7769, lng: 106.7009, label: "Q.1, TP.HCM (giả lập)" };

function getGPS() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ ...FALLBACK_POS, simulated: true });
    const done = (pos, simulated, label) =>
      resolve(pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude, label, simulated } : { ...FALLBACK_POS, simulated: true });
    const timer = setTimeout(() => done(null), 6000); // pitch-safe: không treo quá 6s
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(timer); done(pos, false, "GPS thiết bị"); },
      () => { clearTimeout(timer); done(null); },
      { enableHighAccuracy: true, timeout: 5500, maximumAge: 60000 }
    );
  });
}

/**
 * EmergencyWidget — nút "SOS 1 Chạm" kiểu Dynamic Island.
 * Chống bấm nhầm: NHẤN GIỮ 1.2s mới kích hoạt (progress ring chạy).
 * Kích hoạt: GPS (±fallback) + hồ sơ -> POST /api/emergency tối khẩn.
 */
const HOLD_MS = 1200;
export default function EmergencyWidget() {
  const [phase, setPhase] = useState("standby"); // standby|holding|locating|sending|sent|error
  const [detail, setDetail] = useState("");
  const [caseId, setCaseId] = useState("");
  const [holdPct, setHoldPct] = useState(0);
  const holdTimer = useRef(null);
  const holdRaf = useRef(null);
  const holdStart = useRef(0);

  useEffect(() => () => {
    clearTimeout(holdTimer.current);
    cancelAnimationFrame(holdRaf.current);
  }, []);

  const cancelHold = () => {
    clearTimeout(holdTimer.current);
    cancelAnimationFrame(holdRaf.current);
    setHoldPct(0);
    if (phase === "holding") {
      setPhase("standby");
      setDetail("");
    }
  };

  const startHold = () => {
    if (phase !== "standby") return;
    setPhase("holding");
    setDetail("Giữ thêm chút nữa để xác nhận SOS...");
    holdStart.current = Date.now();
    const tick = () => {
      const pct = Math.min(100, ((Date.now() - holdStart.current) / HOLD_MS) * 100);
      setHoldPct(pct);
      if (pct < 100) holdRaf.current = requestAnimationFrame(tick);
    };
    holdRaf.current = requestAnimationFrame(tick);
    holdTimer.current = setTimeout(() => {
      cancelAnimationFrame(holdRaf.current);
      setHoldPct(100);
      fire();
    }, HOLD_MS);
  };

  const fire = async () => {
    if (phase === "locating" || phase === "sending") return;
    setPhase("locating");
    setDetail("Đang định vị GPS...");
    const pos = await getGPS();
    setPhase("sending");
    setDetail(pos.simulated ? `Vị trí ${pos.label} • Đang bắn tín hiệu...` : "Đã khóa GPS • Đang bắn tín hiệu...");
    try {
      const p = readProfile();
      const created = await sendEmergencySignal({
        symptom: "SOS 1 CHẠM từ Widget khẩn cấp",
        severity: "critical",
        department: "Cấp cứu",
        severityLabel: "Đỏ - Khẩn cấp",
        aiInsight: `[Cấp cứu | Đỏ - Khẩn cấp] SOS 1 chạm — ưu tiên cao nhất.${p.bloodType ? ` Máu ${p.bloodType}.` : ""}${(p.conditions || []).length ? ` Bệnh nền: ${p.conditions.join(", ")}.` : ""}`,
        eta: "ngay lập tức",
        hr: null, spo2: null,
        bloodType: p.bloodType || "", conditions: p.conditions || [],
        emergencyContact: { name: p.contactName || "", phone: p.contactPhone || "" },
        lat: pos.lat, lng: pos.lng, source: "widget",
        priorityCode: `SOS-${Date.now().toString(36).toUpperCase()}`,
      });
      if (created?.id) {
        setCaseId(created.id);
        setPhase("sent");
        setDetail(`${pos.label} • Viện đã nhận ${created.id}`);
      } else {
        setPhase("error");
        setDetail("Backend phản hồi lạ — thử lại.");
      }
    } catch {
      setPhase("error");
      setDetail("Không gửi được (backend offline?) — thử lại.");
    }
  };

  const reset = () => { setPhase("standby"); setDetail(""); setCaseId(""); };

  return (
    <div className="px-5 pt-4">
      <motion.div
        layout
        className={`overflow-hidden rounded-[1.75rem] text-white shadow-xl transition-colors ${
          phase === "sent" ? "bg-gradient-to-r from-emerald-600 to-teal-500" : phase === "error" ? "bg-zinc-800" : "bg-zinc-950"
        }`}
      >
        <button
          aria-label={phase === "standby" || phase === "holding" ? "Nhấn giữ 1 giây để gửi SOS khẩn cấp" : "Nút SOS"}
          onPointerDown={phase === "sent" || phase === "error" ? reset : startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onContextMenu={(e) => e.preventDefault()}
          className="flex w-full touch-none select-none items-center gap-3 p-3.5 text-left">
          <motion.span
            animate={phase === "standby" ? { scale: [1, 1.1, 1] } : {}}
            transition={{ repeat: phase === "standby" ? Infinity : 0, duration: 1.6 }}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
              phase === "sent" ? "bg-white/20" : "bg-gradient-to-br from-red-500 to-orange-500"
            }`}
          >
            {phase === "locating" ? <Satellite className="h-6 w-6 animate-pulse" />
              : phase === "sending" ? <Loader2 className="h-6 w-6 animate-spin" />
              : phase === "sent" ? <CheckCircle2 className="h-6 w-6" />
              : <Siren className="h-6 w-6" />}
          </motion.span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black tracking-tight">
              {phase === "sent" ? `Đã báo động ${caseId} ✓` : phase === "error" ? "Gửi thất bại — bấm để thử lại" : "SOS 1 Chạm"}
            </span>
            <AnimatePresence mode="wait">
              <motion.span
                key={phase + detail}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="block truncate text-[11px] text-white/70"
              >
                {detail || "Standby • Bỏ qua mọi bước, gửi thẳng về viện"}
              </motion.span>
            </AnimatePresence>
          </span>
          {phase !== "sent" && (
            <span className="relative flex shrink-0 items-center gap-1.5 overflow-hidden rounded-full bg-red-600 px-3 py-1.5 text-[11px] font-black">
              {phase === "holding" && (
                <span className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${holdPct}%` }} />
              )}
              <span className="relative h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              <span className="relative">{phase === "holding" ? "GIỮ..." : "SOS"}</span>
            </span>
          )}
        </button>
        {phase === "standby" && (
          <p className="px-3.5 pb-2.5 text-[10px] text-white/50">Nhấn GIỮ 1 giây để chống bấm nhầm</p>
        )}
      </motion.div>
    </div>
  );
}

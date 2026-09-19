import React from "react";
import { motion } from "framer-motion";
import { Hospital, Navigation, Loader2 } from "lucide-react";

/** ResultView: nền map dark (dots) + Bottom Sheet kính mờ + nút báo động. */
export default function ResultView({ analysis, sending, sendError, onReport, onBack }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-zinc-950">
      {/* Nền bản đồ dark */}
      <div className="absolute inset-0"
        style={{ backgroundImage: "radial-gradient(rgba(56,189,248,.35) 1.2px, transparent 1.2px)", backgroundSize: "16px 16px" }}>
        <div className="absolute left-8 top-16 h-12 w-44 -rotate-12 rounded-lg bg-white/5" />
        <div className="absolute right-6 top-32 h-20 w-28 rotate-6 rounded-lg bg-white/5" />
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 360 600" fill="none" preserveAspectRatio="none">
          <motion.path d="M70 520 C 120 420, 160 340, 250 180" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round"
            strokeDasharray="2 10" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4 }} />
        </svg>
        <span className="absolute bottom-[260px] left-6 rounded-full bg-cyan-400 px-3 py-1.5 text-[11px] font-bold text-zinc-950">📍 Vị trí của bạn</span>
        <span className="absolute right-6 top-24 rounded-full bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg shadow-blue-600/40">🏥 BVĐK Trung tâm</span>
      </div>

      {/* Bottom Sheet kính mờ */}
      <motion.div initial={{ y: 80 }} animate={{ y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="relative mt-auto rounded-t-[1.75rem] border-t border-white/10 bg-zinc-900/70 p-4 shadow-2xl backdrop-blur-xl">
        <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-zinc-600" />
        <div className="rounded-2xl bg-white p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white">
              <Hospital className="h-6 w-6" />
            </span>
            <div>
              <p className="font-black tracking-tight text-zinc-900">Bệnh viện Đa khoa Trung tâm</p>
              <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-bold">
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">🟢 Trống giường</span>
                {analysis && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">⚡ {analysis.department} • {analysis.severityLabel}</span>}
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-zinc-500">2.5 km • 5 phút di chuyển</p>
          {analysis && <p className="mt-2 rounded-xl bg-violet-50 p-2.5 text-[11px] leading-relaxed text-violet-900"><b>AI:</b> {analysis.insight}</p>}
          <motion.button whileTap={{ scale: 0.97 }} onClick={onReport} disabled={sending}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 py-4 text-[15px] font-black tracking-tight text-white shadow-lg shadow-blue-600/30 disabled:opacity-70">
            {sending ? <><Loader2 className="h-5 w-5 animate-spin" /> Đang gửi báo động...</> : <><Navigation className="h-5 w-5" /> Báo động & Bắt đầu chỉ đường</>}
          </motion.button>
          {sendError && <p className="mt-2 rounded-xl bg-red-50 p-2 text-center text-[11px] font-bold text-red-600">{sendError}</p>}
        </div>
        <button onClick={onBack} className="mt-1 w-full py-2 text-xs font-bold text-zinc-400">Hủy / Trở về</button>
      </motion.div>
    </div>
  );
}

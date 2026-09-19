import React from "react";
import { motion } from "framer-motion";
import { PhoneCall, Map as MapIcon } from "lucide-react";

/** SuccessView: nền emerald gradient + SVG draw checkmark + nút 115. */
export default function SuccessView({ caseId, onCancel }) {
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-emerald-500 to-teal-600 text-white">
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
        <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.7 }}>
          <h2 className="mt-4 text-xl font-black tracking-tight">Đã phát báo động!</h2>
          <p className="mx-auto mt-1.5 max-w-[290px] text-[13px] leading-relaxed text-white/90">
            Bệnh viện đã nhận hồ sơ {caseId ? <b className="font-mono">{caseId}</b> : "của bạn"} và đang chuẩn bị tiếp đón.
          </p>
        </motion.div>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-2.5 p-5">
        <motion.a whileTap={{ scale: 0.97 }} href="tel:115"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-red-600 py-4 font-black tracking-tight text-white shadow-xl">
          <PhoneCall className="h-5 w-5" /> Gọi tổng đài 115</motion.a>
        <motion.button whileTap={{ scale: 0.97 }}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-4 font-black tracking-tight text-emerald-700 shadow-xl">
          <MapIcon className="h-5 w-5" /> Mở bản đồ chỉ đường</motion.button>
        <button onClick={onCancel} className="mx-auto py-2 text-xs font-bold text-white/70">Hủy báo động / Về đầu</button>
      </div>
    </div>
  );
}

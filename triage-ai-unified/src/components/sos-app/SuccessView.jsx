import React from "react";
import { motion } from "framer-motion";

/** SuccessView: gradient emerald + SVG draw checkmark satisfying + nút iOS. */
export default function SuccessView({ onCancel }) {
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-emerald-50 to-teal-100">
      <div className="flex flex-col items-center px-6 pt-12 text-center">
        <svg viewBox="0 0 100 100" className="h-28 w-28">
          <motion.circle cx="50" cy="50" r="44" fill="none" stroke="#10b981" strokeWidth="6"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8 }} />
          <motion.path d="M32 52 L45 65 L70 38" fill="none" stroke="#10b981" strokeWidth="7" strokeLinecap="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.6 }} />
        </svg>
        <h2 className="mt-3 text-xl font-black tracking-tight text-emerald-900">Đã phát báo động khẩn cấp!</h2>
        <p className="mt-1.5 max-w-[290px] text-[13px] tracking-tight text-emerald-800">
          Bệnh viện Đa khoa Trung tâm đã nhận hồ sơ (#BN-999) và đang chuẩn bị tiếp đón.
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-5">
        <motion.button whileTap={{ scale: 0.97 }} className="w-full rounded-full bg-red-600 py-4 font-black tracking-tight text-white shadow-lg">Gọi xe Cấp cứu (115)</motion.button>
        <motion.button whileTap={{ scale: 0.97 }} className="w-full rounded-full bg-blue-600 py-4 font-black tracking-tight text-white shadow-lg">Mở bản đồ chỉ đường</motion.button>
        <button onClick={onCancel} className="mx-auto py-2 text-xs font-bold text-zinc-400">Hủy báo động</button>
      </div>
    </div>
  );
}

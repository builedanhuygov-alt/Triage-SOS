import React from "react";
import { motion } from "framer-motion";

const labels = ["AI đang phân tích...", "Đối chiếu chuyên khoa...", "Kiểm tra giường..."];

/** ProcessingView: skeleton ChatGPT — khối shimmer, không spinner rẻ tiền. */
export default function ProcessingView({ step }) {
  return (
    <div className="flex h-full flex-col justify-center gap-3 bg-zinc-950 p-8">
      {[0, 1, 2].map((i) => (
        <motion.div key={i}
          initial={{ opacity: 0.3 }} animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, duration: 1.4, delay: i * 0.2 }}
          className={`h-12 rounded-2xl bg-white/10 backdrop-blur-xl ${i <= step ? "ring-1 ring-cyan-400/40" : ""}`} />
      ))}
      <p className="mt-2 animate-pulse text-center text-sm tracking-tight text-cyan-200">{labels[step] || labels[0]}</p>
    </div>
  );
}

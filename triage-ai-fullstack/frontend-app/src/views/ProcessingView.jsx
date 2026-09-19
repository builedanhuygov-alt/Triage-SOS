import React from "react";
import { motion } from "framer-motion";
import { BrainCircuit } from "lucide-react";

/**
 * ProcessingView: Holographic Radar — vòng đồng tâm mờ dần + tia quét.
 * App.jsx setTimeout ~2.5s rồi tự sang Result.
 */
export default function ProcessingView({ label }) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-zinc-950 px-8 text-center">
      <div className="relative flex h-52 w-52 items-center justify-center">
        {[0, 1, 2, 3].map((i) => (
          <motion.span key={i} className="absolute inset-0 rounded-full border border-cyan-400/40"
            style={{ margin: i * 16 }}
            initial={{ opacity: 0.8 }} animate={{ opacity: [0.8, 0.15, 0.8] }}
            transition={{ repeat: Infinity, duration: 2.4, delay: i * 0.3 }} />
        ))}
        {/* Tia quét */}
        <motion.span className="absolute inset-0 rounded-full"
          style={{ background: "conic-gradient(from 0deg, rgba(34,211,238,.6), transparent 25%)" }}
          animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }} />
        <motion.span animate={{ scale: [1, 1.3, 1], opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.6 }}
          className="absolute h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_20px_rgba(34,211,238,.9)]" />
        <BrainCircuit className="relative h-11 w-11 text-cyan-200" />
      </div>
      <h2 className="mt-6 text-lg font-black tracking-tight text-white">AI đang điều phối...</h2>
      <p className="mt-2 min-h-[24px] animate-pulse text-sm text-cyan-200">{label}</p>
    </div>
  );
}

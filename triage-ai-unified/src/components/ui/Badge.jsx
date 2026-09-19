import React from "react";

/** Badge ngữ nghĩa: chỉ dùng màu cho trạng thái cần nhấn mạnh. */
const tones = {
  red: "bg-red-500/15 text-red-300 ring-1 ring-red-500/30",
  green: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
  blue: "bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/30",
  amber: "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30",
  violet: "bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30",
  zinc: "bg-white/10 text-zinc-300 ring-1 ring-white/10",
};

export default function Badge({ tone = "zinc", className = "", children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-tight ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

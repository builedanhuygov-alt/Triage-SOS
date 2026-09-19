import React from "react";
import { motion } from "framer-motion";

/**
 * ThemeToggle — nút gạt iOS chuyển Bác sĩ / Bệnh nhân.
 * Dùng layoutId pill để trượt mượt (spring).
 */
export default function ThemeToggle({ mode, setMode }) {
  const isCmd = mode === "command";
  return (
    <div className="fixed left-1/2 top-3 z-50 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-full bg-black/50 p-1 ring-1 ring-white/10 backdrop-blur-xl">
        {[
          { id: "command", label: "🏥 Command" },
          { id: "sos", label: "📱 SOS App" },
        ].map((m) => {
          const active = isCmd === (m.id === "command");
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`relative rounded-full px-4 py-1.5 text-xs font-bold tracking-tight transition ${active ? "text-zinc-950" : "text-zinc-300 hover:text-white"}`}
            >
              {active && (
                <motion.span
                  layoutId="toggle-pill"
                  transition={{ type: "spring", stiffness: 300, damping: 28 }}
                  className="absolute inset-0 rounded-full bg-white shadow"
                />
              )}
              <span className="relative">{m.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

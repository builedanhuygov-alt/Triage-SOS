import React from "react";
import { motion } from "framer-motion";

/**
 * Button đa biến thể: primary (zinc-950) / danger / success / ghost / neon.
 * Bo rounded-full chuẩn iOS, micro-interaction tap-scale.
 */
const variants = {
  primary: "bg-zinc-950 text-white shadow-xl hover:bg-zinc-800",
  danger: "bg-red-600 text-white shadow-lg shadow-red-600/30 hover:bg-red-500",
  success: "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-400",
  info: "bg-blue-600 text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500",
  ghost: "bg-white/10 text-zinc-200 ring-1 ring-white/10 hover:bg-white/15",
  neon: "bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-lg",
};

export default function Button({ variant = "primary", className = "", children, ...rest }) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={`flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold tracking-tight transition ${variants[variant] || variants.primary} ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
}

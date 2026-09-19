import React from "react";
import { motion } from "framer-motion";

/** Glass Card chuẩn Apple/OpenAI: mờ + ring tinh xảo, không border thô. */
export default function Card({ children, className = "", hover = false, ...rest }) {
  return (
    <motion.div
      {...(hover ? { whileHover: { scale: 1.015 } } : {})}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className={`rounded-2xl bg-white/[0.04] ring-1 ring-white/10 backdrop-blur-xl ${className}`}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

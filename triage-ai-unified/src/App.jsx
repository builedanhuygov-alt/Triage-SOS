import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ThemeToggle from "./components/ui/ThemeToggle.jsx";
import Dashboard from "./components/dashboard/index.jsx";
import SosApp from "./components/sos-app/index.jsx";

/** App Root: chỉ là Layout — toggle Bác sĩ / Bệnh nhân. */
export default function App() {
  const [mode, setMode] = useState("command");
  return (
    <div className="min-h-screen bg-zinc-950 font-[Inter,system-ui]">
      <ThemeToggle mode={mode} setMode={setMode} />
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {mode === "command" ? <Dashboard /> : <SosApp />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

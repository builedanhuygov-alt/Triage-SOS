import React, { useState } from "react";
import { motion } from "framer-motion";
import { HeartPulse, User, Users, Loader2 } from "lucide-react";
import { useSession } from "../context/SessionContext.jsx";

/** Login riêng của Patient App (không dùng màn hình web). */
export default function LoginView() {
  const { login } = useSession();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  const go = async (em) => {
    setBusy(em);
    setError("");
    try {
      await login(em || email);
    } catch {
      setError("Không đăng nhập được (backend :5000 offline?).");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-b from-zinc-950 to-zinc-800 px-8 text-center text-white">
      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16 }}
        className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-red-500 to-orange-500 shadow-xl">
        <HeartPulse className="h-10 w-10" />
      </motion.span>
      <h1 className="mt-4 text-2xl font-black tracking-tight">Triage AI</h1>
      <p className="mt-1 text-xs text-zinc-400">Không gian sức khỏe cá nhân • DEMO DATA</p>

      <div className="mt-6 w-full space-y-2">
        <motion.button whileTap={{ scale: 0.97 }} disabled={!!busy} onClick={() => go("patient@hospital.demo")}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-4 text-sm font-black text-zinc-950 disabled:opacity-60">
          {busy === "patient@hospital.demo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
          Vào với tư cách Bệnh nhân
        </motion.button>
        <motion.button whileTap={{ scale: 0.97 }} disabled={!!busy} onClick={() => go("caregiver@hospital.demo")}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-white/10 py-4 text-sm font-black text-white ring-1 ring-white/20 disabled:opacity-60">
          {busy === "caregiver@hospital.demo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
          Người thân được ủy quyền
        </motion.button>
        <div className="flex gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@hospital.demo"
            className="min-w-0 flex-1 rounded-full bg-white/10 p-3.5 text-sm outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-red-400" />
          <motion.button whileTap={{ scale: 0.95 }} disabled={!!busy || !email.trim()} onClick={() => go()}
            className="shrink-0 rounded-full bg-red-600 px-5 text-sm font-black disabled:opacity-40">
            Vào
          </motion.button>
        </div>
        {error && <p className="rounded-2xl bg-red-500/15 p-2.5 text-[11px] font-bold text-red-300">{error}</p>}
        <p className="pt-1 font-mono text-[10px] text-zinc-500">demo: patient@hospital.demo / demo123</p>
      </div>
    </div>
  );
}

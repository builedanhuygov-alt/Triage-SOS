import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Filter } from "lucide-react";
import { fetchAudit } from "../services/api.js";

/** AuditCenter — CEO/Admin xem trail, filter actor/role/action, append-only. */
export default function AuditCenter() {
  const [logs, setLogs] = useState([]);
  const [f, setF] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLogs(await fetchAudit(120));
    } catch {
      setError("Cần quyền CEO/Admin.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = f.trim().toLowerCase();
  const shown = q
    ? logs.filter((l) => `${l.actor} ${l.role} ${l.action} ${l.resource} ${l.resourceId} ${l.result}`.toLowerCase().includes(q))
    : logs;

  return (
    <div className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-black tracking-tight text-white">
          <ShieldCheck className="h-4 w-4 text-zinc-300" /> Security & Audit — append-only
        </h2>
        <div className="relative">
          <Filter className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input value={f} onChange={(e) => setF(e.target.value)} placeholder="Lọc actor/role/action..."
            className="rounded-full bg-black/40 py-1.5 pl-8 pr-3 font-mono text-[11px] text-white ring-1 ring-white/10 outline-none placeholder:text-zinc-600" />
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      <div className="mt-2.5 max-h-72 space-y-1 overflow-y-auto font-mono text-[11px]">
        {shown.slice(0, 60).map((l, i) => (
          <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-wrap gap-x-3 gap-y-0.5 rounded-lg bg-black/30 px-2.5 py-1.5 ring-1 ring-white/5">
            <span className="text-zinc-500">{l.timestamp ? new Date(l.timestamp).toLocaleTimeString("vi-VN") : ""}</span>
            <span className="font-black text-cyan-300">{l.role}</span>
            <span className="text-zinc-300">{l.actor}</span>
            <span className="font-black text-amber-200">{l.action}</span>
            <span className="text-zinc-400">{l.resource}:{l.resourceId}</span>
            <span className={l.result === "ok" ? "text-emerald-400" : "text-red-400"}>{l.result}</span>
          </motion.div>
        ))}
        {shown.length === 0 && !error && <p className="p-3 text-center text-zinc-500">Chưa có log nào khớp.</p>}
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, CheckCircle2, XCircle, ArrowUpCircle } from "lucide-react";
import { fetchFlagged, reviewFlagged } from "../services/api.js";
import { socket } from "../services/socket.js";

/**
 * ModerationView — hàng chờ kiểm duyệt SOS (CEO/ADMIN).
 * FLAGGED không báo động toàn viện; approve mới dispatch workflow.
 */
export default function ModerationView() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      setError("");
      setItems(await fetchFlagged());
    } catch {
      setError("Không tải được hàng chờ (cần đăng nhập CEO/Admin).");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const refetch = () => load();
    socket.on("EMERGENCY_FLAGGED", refetch);
    socket.on("EMERGENCY_APPROVED", refetch);
    return () => {
      socket.off("EMERGENCY_FLAGGED", refetch);
      socket.off("EMERGENCY_APPROVED", refetch);
    };
  }, [load]);

  const review = async (id, decision) => {
    setBusy(id + decision);
    try {
      await reviewFlagged(id, decision);
      setItems((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setError("Lưu thất bại — kiểm tra quyền/token.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-amber-500/20 backdrop-blur-xl">
      <h2 className="flex items-center gap-2 text-sm font-black tracking-tight text-white">
        <ShieldAlert className="h-4 w-4 text-amber-300" /> Emergency Moderation — {items.length} ca chờ duyệt
      </h2>
      {loading && <p className="mt-2 animate-pulse text-xs text-zinc-400">Đang tải hàng chờ...</p>}
      {error && <p className="mt-2 rounded-xl bg-red-500/15 p-2 text-xs font-bold text-red-300">{error}</p>}
      <div className="mt-3 space-y-2.5">
        <AnimatePresence initial={false}>
          {items.map((p) => (
            <motion.div key={p.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }}
              className="rounded-2xl bg-white/[0.05] p-3.5 ring-1 ring-amber-500/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-sm font-black text-amber-200">{p.id}</span>
                <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 font-mono text-[11px] font-black text-red-300">
                  RISK {p.screening?.riskScore ?? "?"} • {p.screening?.verdict}
                </span>
              </div>
              <p className="mt-1 text-[13px] font-semibold text-white">{p.symptom}</p>
              <p className="mt-1 font-mono text-[11px] text-zinc-400">
                {p.timestamp ? new Date(p.timestamp).toLocaleString("vi-VN") : ""} • {p.source || "app"}
              </p>
              <p className="mt-1 rounded-lg bg-black/40 p-2 font-mono text-[11px] text-zinc-300">
                Lý do: {(p.screening?.reasons || []).join("; ") || "—"}
              </p>
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                <motion.button whileTap={{ scale: 0.96 }} disabled={!!busy} onClick={() => review(p.id, "APPROVE")}
                  className="flex items-center justify-center gap-1 rounded-xl bg-emerald-500 py-2 text-xs font-black text-white disabled:opacity-40">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Duyệt
                </motion.button>
                <motion.button whileTap={{ scale: 0.96 }} disabled={!!busy} onClick={() => review(p.id, "DISMISS")}
                  className="flex items-center justify-center gap-1 rounded-xl bg-white/10 py-2 text-xs font-black text-zinc-300 ring-1 ring-white/10 disabled:opacity-40">
                  <XCircle className="h-3.5 w-3.5" /> Bỏ qua
                </motion.button>
                <motion.button whileTap={{ scale: 0.96 }} disabled={!!busy} onClick={() => review(p.id, "ESCALATE")}
                  className="flex items-center justify-center gap-1 rounded-xl bg-orange-500 py-2 text-xs font-black text-white disabled:opacity-40">
                  <ArrowUpCircle className="h-3.5 w-3.5" /> Leo thang
                </motion.button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {!loading && !error && items.length === 0 && (
          <p className="rounded-xl bg-white/5 p-4 text-center text-sm text-zinc-400">✅ Không có ca nào chờ duyệt.</p>
        )}
      </div>
    </div>
  );
}

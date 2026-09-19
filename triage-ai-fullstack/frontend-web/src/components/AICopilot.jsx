import React, { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Send, Loader2, ShieldCheck } from "lucide-react";
import { aiAsk } from "../services/api.js";
import { useRole } from "../context/RoleContext.jsx";

const HINTS = {
  ceo: ["Khoa nào đang quá tải?", "Còn bao nhiêu giường trống?", "Ca chờ hôm nay thế nào?"],
  admin: ["Khoa nào đang quá tải?", "Còn bao nhiêu giường trống?"],
  nurse: ["Bệnh nhân nào cần chú ý?", "Thuốc nào chưa xác nhận?", "Còn bao nhiêu giường ER?"],
  default: ["Ca chờ khoa tôi thế nào?", "Tóm tắt #BN-205", "Còn bao nhiêu giường?"],
};

/**
 * AICopilot — decision support trong phạm vi quyền của user.
 * Server lọc context theo RBAC; UI gắn nhãn REVIEW REQUIRED.
 */
export default function AICopilot() {
  const { roleId } = useRole();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState(null);
  const [error, setError] = useState("");
  const hints = HINTS[roleId] || HINTS.default;

  const ask = async (text) => {
    const question = (text ?? q).trim();
    if (!question || busy) return;
    setBusy(true);
    setError("");
    try {
      setResp(await aiAsk(question));
      setQ("");
    } catch {
      setError("Hỏi thất bại (cần đăng nhập staff).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 p-4 ring-1 ring-violet-400/20 backdrop-blur-xl">
      <p className="flex items-center gap-2 text-sm font-black tracking-tight text-white">
        <Sparkles className="h-4 w-4 text-violet-300" /> AI Copilot
        <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[9px] font-black text-violet-200">AI SUGGESTION</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {hints.map((h) => (
          <button key={h} onClick={() => ask(h)}
            className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-violet-200 ring-1 ring-white/10 hover:bg-white/15">
            {h}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Hỏi về vận hành trong quyền của bạn..."
          className="min-w-0 flex-1 rounded-full bg-black/40 px-4 py-2.5 text-xs text-white ring-1 ring-white/10 outline-none placeholder:text-zinc-500" />
        <motion.button whileTap={{ scale: 0.92 }} onClick={() => ask()} disabled={busy || !q.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </motion.button>
      </div>
      {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}
      {resp && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="mt-2.5 rounded-2xl bg-black/40 p-3 ring-1 ring-white/10">
          <p className="whitespace-pre-line text-xs leading-relaxed text-zinc-200">{resp.answer}</p>
          <p className="mt-2 font-mono text-[10px] text-zinc-500">Nguồn: {(resp.sources || []).join(" • ")}</p>
          <p className="mt-1 flex items-center gap-1 text-[10px] font-black text-amber-300">
            <ShieldCheck className="h-3 w-3" /> {resp.tag}
          </p>
          {resp.denied && <p className="mt-1 text-[10px] font-bold text-red-300">⛔ Ngoài phạm vi quyền — đã từ chối tra cứu.</p>}
        </motion.div>
      )}
    </div>
  );
}

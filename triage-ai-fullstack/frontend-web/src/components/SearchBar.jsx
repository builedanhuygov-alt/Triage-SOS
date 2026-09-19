import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Search, FileSearch } from "lucide-react";
import { searchAll } from "../services/api.js";

/** Global search — kết quả đã lọc RBAC từ server, không bypass. */
export default function SearchBar() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);

  const go = useCallback(async (text) => {
    const query = (text ?? q).trim();
    if (query.length < 2) {
      setRes(null);
      return;
    }
    setBusy(true);
    try {
      setRes(await searchAll(query));
    } catch {
      setRes({ error: true });
    } finally {
      setBusy(false);
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => { if (q.trim().length >= 2) go(); }, 450);
    return () => clearTimeout(t);
  }, [q, go]);

  const groups = res && !res.error ? [
    ["Ca cấp cứu", (res.emergencies || []).map((e) => `${e.id} • ${e.symptom} (${e.status})`)],
    ["Lịch hẹn", (res.appointments || []).map((a) => `${a.id} • ${a.patientId} • ${a.date} ${a.time}`)],
    ["Giường", (res.beds || []).map((b) => `${b.id} • ${b.ward} • ${b.status}`)],
    ["Nhân sự", (res.staff || []).map((s) => `${s.name} • ${s.specialty} (${s.status})`)],
  ] : [];

  return (
    <div className="rounded-2xl bg-white/[0.04] p-3.5 ring-1 ring-white/10 backdrop-blur-xl">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm ca, lịch hẹn, giường, nhân sự... (≥2 ký tự)"
          className="w-full rounded-full bg-black/40 py-2.5 pl-10 pr-4 text-xs text-white ring-1 ring-white/10 outline-none placeholder:text-zinc-500" />
      </div>
      {busy && <p className="mt-2 animate-pulse px-1 text-[11px] text-zinc-500">Đang tìm...</p>}
      {res?.error && <p className="mt-2 px-1 text-[11px] text-red-300">Tìm thất bại (quyền/kết nối).</p>}
      {res && !res.error && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {groups.map(([label, items]) => (
            <div key={label} className="rounded-xl bg-black/30 p-2.5 ring-1 ring-white/5">
              <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                <FileSearch className="h-3 w-3" />{label} ({items.length})
              </p>
              {items.length === 0 && <p className="mt-1 text-[11px] text-zinc-600">—</p>}
              {items.slice(0, 5).map((t, i) => (
                <motion.p key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-1 truncate font-mono text-[11px] text-zinc-300">{t}</motion.p>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

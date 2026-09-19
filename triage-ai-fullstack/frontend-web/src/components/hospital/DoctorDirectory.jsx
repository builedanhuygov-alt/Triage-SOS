import React, { useEffect, useState } from "react";
import { fetchDoctors } from "../../services/hospitalApi.js";
import { Card, SectionTitle, StatusBadge, RoleBadge, DemoBanner } from "./ui.jsx";

/** Danh sách bác sĩ + filter tòa / khoa / chuyên khoa / trạng thái / role. */
export default function DoctorDirectory() {
  const [f, setF] = useState({ building: "", department: "", specialty: "", status: "", q: "" });
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");
  const sel = "rounded-xl bg-white/5 px-2.5 py-2 text-xs font-semibold text-zinc-200 ring-1 ring-white/10 outline-none";

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        setErr("");
        const r = await fetchDoctors({ building: f.building || undefined, department: f.department || undefined, specialty: f.specialty || undefined, status: f.status || undefined, q: f.q || undefined });
        setItems(r.items || []); setTotal(r.total || 0);
      } catch (e) { setErr(e?.response?.data?.error || "Không tải được danh sách bác sĩ"); }
    }, 300);
    return () => clearTimeout(t);
  }, [f]);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="space-y-3">
      <DemoBanner />
      <Card>
        <div className="flex flex-wrap gap-2">
          <input value={f.q} onChange={set("q")} placeholder="Tìm tên / mã BS / username…" className="min-w-[180px] flex-1 rounded-xl bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10 outline-none" />
          <select value={f.building} onChange={set("building")} className={sel}><option value="">Mọi tòa</option>{["A", "B", "C", "D"].map((b) => <option key={b} value={b}>Tòa {b}</option>)}</select>
          <input value={f.department} onChange={set("department")} placeholder="Mã khoa" className="w-32 rounded-xl bg-white/5 px-3 py-2 text-xs text-white ring-1 ring-white/10 outline-none" />
          <input value={f.specialty} onChange={set("specialty")} placeholder="Chuyên khoa" className="w-36 rounded-xl bg-white/5 px-3 py-2 text-xs text-white ring-1 ring-white/10 outline-none" />
          <select value={f.status} onChange={set("status")} className={sel}><option value="">Mọi trạng thái</option>{["ACTIVE", "INACTIVE", "LOCKED", "PENDING"].map((s) => <option key={s} value={s}>{s}</option>)}</select>
        </div>
      </Card>
      {err && <Card><p className="text-sm text-red-300">{err}</p></Card>}
      <Card>
        <SectionTitle>Danh sách bác sĩ ({total})</SectionTitle>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[12px]">
            <thead><tr className="text-[10px] uppercase text-zinc-500">{["Mã BS", "Tên", "Chuyên khoa", "Chức vụ", "Khoa", "Tòa", "Trực", "Tài khoản", "Quyền"].map((h) => <th key={h} className="px-2 py-1.5">{h}</th>)}</tr></thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.doctorId} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-2 py-2 font-mono text-cyan-300">{d.doctorId}</td>
                  <td className="px-2 py-2 font-bold text-white">{d.fullName}</td>
                  <td className="px-2 py-2 text-zinc-300">{d.specialty}</td>
                  <td className="px-2 py-2 text-zinc-300">{d.position}</td>
                  <td className="px-2 py-2 text-zinc-300">{d.department}</td>
                  <td className="px-2 py-2 text-zinc-300">{d.building}</td>
                  <td className="px-2 py-2">{d.onDuty ? <span className="text-emerald-300">● trực</span> : <span className="text-zinc-500">○ nghỉ</span>}</td>
                  <td className="px-2 py-2 font-mono text-[11px] text-zinc-400">{d.username}</td>
                  <td className="px-2 py-2"><RoleBadge role={d.role} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card><div className="flex items-center gap-2"><StatusBadge status="ACTIVE" /><p className="text-xs text-zinc-500">Trạng thái trực là dữ liệu demo minh họa.</p></div></Card>
    </div>
  );
}

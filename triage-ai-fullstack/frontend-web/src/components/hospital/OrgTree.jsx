import React, { useEffect, useState } from "react";
import { fetchOrgTree, fetchStaff } from "../../services/hospitalApi.js";
import { Card, SectionTitle, StatusBadge, RoleBadge, DemoBanner } from "./ui.jsx";

/** Cây tổ chức Tòa → Tầng → Khoa; click khoa xem nhân sự. */
export default function OrgTree() {
  const [tree, setTree] = useState([]);
  const [openB, setOpenB] = useState({ A: true });
  const [selDept, setSelDept] = useState(null);
  const [staff, setStaff] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetchOrgTree().then((r) => setTree(r.tree || [])).catch((e) => setErr(e?.response?.data?.error || "Không tải được cây tổ chức"));
  }, []);

  const select = async (d) => {
    setSelDept(d); setStaff([]);
    try { const r = await fetchStaff({ department: d.id, limit: 100 }); setStaff(r.items || []); }
    catch { setStaff([]); }
  };

  if (err) return <Card><p className="text-sm text-red-300">{err}</p></Card>;

  return (
    <div className="space-y-3">
      <DemoBanner />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <SectionTitle>BỆNH VIỆN ĐA KHOA TW DEMO1</SectionTitle>
          <div className="mt-2 space-y-2">
            {tree.map((b) => (
              <div key={b.id} className="rounded-xl bg-white/[0.03] ring-1 ring-white/10">
                <button onClick={() => setOpenB((o) => ({ ...o, [b.id]: !o[b.id] }))} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[13px] font-black text-white">
                  <span>🏢 {b.name}</span><span className="text-zinc-500">{openB[b.id] ? "▾" : "▸"}</span>
                </button>
                {openB[b.id] && (
                  <div className="space-y-1 px-3 pb-3">
                    {b.departments.map((d) => (
                      <button key={d.id} onClick={() => select(d)} className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12px] ring-1 ${selDept?.id === d.id ? "bg-cyan-500/15 ring-cyan-400/40" : "bg-black/30 ring-white/5 hover:ring-white/20"}`}>
                        <span className="font-semibold text-zinc-200">T{d.floors.join(",")} · {d.name}</span>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-300">{d.staffCount} NV</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
        <Card>
          {!selDept ? <p className="text-sm text-zinc-500">Chọn một khoa để xem trưởng khoa, bác sĩ, điều dưỡng, kỹ thuật viên…</p> : (
            <div>
              <SectionTitle>{selDept.name}</SectionTitle>
              <p className="mt-0.5 text-xs text-zinc-500">Tòa {selDept.building} · Tầng {selDept.floors.join(", ")} · {selDept.units?.length || 0} đơn vị · {staff.length} nhân sự</p>
              {selDept.headUser?.username && (
                <div className="mt-2 rounded-xl bg-amber-400/10 p-2.5 text-[12px] ring-1 ring-amber-400/20">
                  <span className="font-bold text-amber-200">Trưởng khoa: {selDept.headUser.fullName}</span>
                  <span className="font-mono text-[11px] text-amber-200/70"> · {selDept.headUser.username}</span>
                </div>
              )}
              <div className="mt-2 max-h-[420px] space-y-1.5 overflow-y-auto">
                {staff.map((u) => (
                  <div key={u.username} className="flex items-center justify-between rounded-lg bg-black/30 px-2.5 py-1.5 ring-1 ring-white/5">
                    <div><p className="text-[12px] font-bold text-white">{u.fullName}</p><p className="text-[10px] text-zinc-500">{u.jobTitle} · {u.unit || ""}</p></div>
                    <div className="flex items-center gap-1.5"><RoleBadge role={u.role} /><StatusBadge status={u.status} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { fetchDepartments } from "../../services/hospitalApi.js";
import { Card, SectionTitle, DemoBanner } from "./ui.jsx";

/** Danh sách khoa: trưởng/phó, số BS/ĐD/KTV, nhân sự, trạng thái. */
export default function DepartmentDirectory() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetchDepartments().then((r) => setItems(r.departments || [])).catch((e) => setErr(e?.response?.data?.error || "Không tải được danh sách khoa"));
  }, []);

  if (err) return <Card><p className="text-sm text-red-300">{err}</p></Card>;

  return (
    <div className="space-y-3">
      <DemoBanner />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((d) => (
          <Card key={d.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[13px] font-black text-white">{d.name}</p>
                <p className="font-mono text-[10px] text-zinc-500">{d.code} · Tòa {d.building} · Tầng {d.floors.join(",")}</p>
              </div>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">● {d.status}</span>
            </div>
            <p className="mt-2 text-[12px] text-zinc-300">👨‍⚕️ Trưởng: <b className="text-white">{d.head?.fullName || "—"}</b></p>
            {d.deputies?.length > 0 && <p className="text-[12px] text-zinc-400">Phó: {d.deputies.join(", ")}</p>}
            <div className="mt-2 grid grid-cols-5 gap-1.5 text-center">
              {[["BS", d.doctors], ["ĐD", d.nurses], ["KTV", d.technicians], ["Dược", d.pharmacists], ["Tổng", d.totalStaff]].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-black/30 py-1.5 ring-1 ring-white/5">
                  <p className="text-sm font-black text-cyan-300">{v}</p>
                  <p className="text-[9px] uppercase text-zinc-500">{k}</p>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-zinc-600">{d.units?.map((u) => u.name).join(" · ")}</p>
          </Card>
        ))}
      </div>
      {items.length === 0 && <Card><p className="animate-pulse text-sm text-zinc-500">Đang tải…</p></Card>}
    </div>
  );
}

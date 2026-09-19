import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { fetchOrgSummary, fetchStaff, fetchDoctors } from "../../services/hospitalApi.js";
import { Card, SectionTitle, DemoBanner } from "./ui.jsx";

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10 backdrop-blur-xl">
      <p className="text-[11px] font-semibold uppercase text-zinc-400">{label}</p>
      <p className={`mt-1 text-2xl font-black ${accent || "text-white"}`}>{value}</p>
    </div>
  );
}

function MiniBar({ title, data, dataKey = "value" }) {
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      <div className="mt-2 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="2 6" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#a1a1aa" }} axisLine={false} tickLine={false} interval={0} angle={-12} dy={8} height={44} />
            <YAxis tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "rgba(0,0,0,.8)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, fontSize: 12, color: "#fff" }} />
            <Bar dataKey={dataKey} fill="#22d3ee" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/** Dashboard nhân sự: tổng + biểu đồ theo tòa / role / chuyên khoa. */
export default function StaffDashboard() {
  const [summary, setSummary] = useState(null);
  const [byBuilding, setByBuilding] = useState([]);
  const [byRole, setByRole] = useState([]);
  const [bySpecialty, setBySpecialty] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await fetchOrgSummary();
        if (!alive) return;
        setSummary(s);
        const all = await fetchStaff({ limit: 100 });
        // gom theo tòa / role / chuyên khoa từ trang đầu + tổng (đủ cho demo trực quan)
        const bb = {};
        const br = {};
        (all.items || []).forEach((u) => {
          bb[u.building || "?"] = (bb[u.building || "?"] || 0) + 1;
          br[u.role] = (br[u.role] || 0) + 1;
        });
        // scale theo tổng để phản ánh toàn viện
        const scale = (all.total || 1) / Math.max(1, (all.items || []).length);
        setByBuilding(Object.entries(bb).map(([name, value]) => ({ name: `Tòa ${name}`, value: Math.round(value * scale) })));
        setByRole(Object.entries(br).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value: Math.round(value * scale) })));
        const docs = await fetchDoctors({});
        const sp = {};
        (docs.items || []).forEach((d) => { sp[d.specialty || "—"] = (sp[d.specialty || "—"] || 0) + 1; });
        setBySpecialty(Object.entries(sp).map(([name, value]) => ({ name, value })));
      } catch (e) {
        if (alive) setErr(e?.response?.data?.error || "Không tải được dữ liệu (cần đăng nhập CEO/ADMIN).");
      }
    })();
    return () => { alive = false; };
  }, []);

  if (err) return <Card><p className="text-sm text-red-300">{err}</p></Card>;
  if (!summary) return <Card><p className="animate-pulse text-sm text-zinc-400">Đang tải dashboard nhân sự…</p></Card>;

  return (
    <div className="space-y-3">
      <DemoBanner />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total staff" value={summary.totalAccounts} accent="text-cyan-300" />
        <Stat label="Doctors" value={summary.doctors} />
        <Stat label="Nurses" value={summary.nurses} />
        <Stat label="Technicians" value={summary.technicians} />
        <Stat label="Pharmacists" value={summary.pharmacists} />
        <Stat label="IT" value={summary.it} />
        <Stat label="Managers" value={summary.managers} />
        <Stat label="Admin/Support" value={summary.admin} />
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <MiniBar title="Nhân sự theo tòa" data={byBuilding} />
        <MiniBar title="Nhân sự theo role (top)" data={byRole} />
        <MiniBar title="Bác sĩ theo chuyên khoa" data={bySpecialty} />
      </div>
      <Card>
        <SectionTitle>Tổ chức</SectionTitle>
        <p className="mt-1 text-[13px] text-zinc-300">
          {summary.buildings} tòa · {summary.departments} khoa/phòng · {summary.roles} roles · {summary.permissions} permissions ·
          Active {summary.active} · Inactive {summary.inactive} · Locked {summary.locked} · Pending {summary.pending}
        </p>
      </Card>
    </div>
  );
}

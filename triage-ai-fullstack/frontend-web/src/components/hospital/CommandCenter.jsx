import React, { useEffect, useState } from "react";
import { fetchOverview, fetchSos, patchSos, fetchEncounters, patchEncounter, patchCapacity, fetchCapacity } from "../../services/hospitalApi.js";
import { Card, SectionTitle, DemoBanner } from "./ui.jsx";

const PRI = { CRITICAL: "bg-red-500/15 text-red-300", HIGH: "bg-orange-500/15 text-orange-300", WARNING: "bg-amber-400/15 text-amber-300", INFO: "bg-white/10 text-zinc-300" };

function Kpi({ label, value, tone }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/10">
      <p className="text-[10px] font-bold uppercase text-zinc-500">{label}</p>
      <p className={`text-xl font-black ${tone || "text-white"}`}>{value ?? "—"}</p>
    </div>
  );
}

function Overview({ data, reload }) {
  if (!data) return <Card><p className="animate-pulse text-sm text-zinc-500">Đang tải overview live…</p></Card>;
  const i = data.intake, f = data.finance;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Kpi label="Tiếp nhận" value={i.received} tone="text-cyan-300" />
        <Kpi label="Đang chờ" value={i.waiting} tone="text-amber-300" />
        <Kpi label="Đang khám" value={i.inExam} />
        <Kpi label="Hoàn tất" value={i.completed} tone="text-emerald-300" />
        <Kpi label="Cấp cứu" value={i.emergency} tone="text-red-300" />
        <Kpi label="Từ chối" value={i.rejected} />
        <Kpi label="Chuyển tuyến" value={i.referred} />
        <Kpi label="Nhập viện" value={i.admitted} />
        <Kpi label="Xuất viện" value={i.discharged} />
        <Kpi label="Doanh thu (đ)" value={f.revenue.toLocaleString("vi-VN")} tone="text-emerald-300" />
      </div>
      <Card>
        <SectionTitle>⚠️ Cần chú ý</SectionTitle>
        <div className="mt-2 space-y-1.5">
          {data.resources.alerts.slice(0, 5).map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2 ring-1 ring-white/5">
              <span className="text-[12px] text-zinc-200">{a.name} — còn {a.qty} {a.unit} ({a.location}) · Chủ quản: {a.owner}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${PRI[a.priority]}`}>{a.priority} · {a.status}</span>
            </div>
          ))}
          {data.emergency.cases.slice(0, 3).map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2 ring-1 ring-white/5">
              <span className="text-[12px] text-zinc-200">SOS {s.id} — {s.name || "chưa rõ tên"} · {s.status}</span>
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-black text-red-300">EMERGENCY</span>
            </div>
          ))}
          {data.documents.overdue > 0 && <p className="text-[12px] text-amber-300">⚠️ {data.documents.overdue} văn bản quá hạn — Văn thư xử lý.</p>}
          {data.anomaly.open > 0 && <p className="text-[12px] text-orange-300">🛡️ {data.anomaly.open} review case anomaly đang mở — không tự kết luận.</p>}
          {data.resources.alerts.length === 0 && data.emergency.cases.length === 0 && <p className="text-[12px] text-zinc-500">Không có cảnh báo mới.</p>}
        </div>
      </Card>
      <Card>
        <SectionTitle>Theo khoa</SectionTitle>
        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {data.byDept.map((d) => (
            <div key={d.department} className="flex justify-between rounded-xl bg-black/30 px-3 py-2 text-[12px] ring-1 ring-white/5">
              <b className="text-white">{d.department}</b>
              <span className="text-zinc-400">{d.total} ca · {d.waiting} chờ · {d.emergency} cấp cứu</span>
            </div>
          ))}
          {data.byDept.length === 0 && <p className="text-[12px] text-zinc-500">— (chưa có ca trong kỳ)</p>}
        </div>
      </Card>
      <button onClick={reload} className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold">↻ Tải lại (live-stores)</button>
    </div>
  );
}

function IntakeFlow() {
  const [list, setList] = useState([]);
  const [f, setF] = useState({ range: "today", status: "" });
  const load = async () => {
    try { const r = await fetchEncounters({ range: f.range, status: f.status || undefined, }); setList(r.items || []); } catch {}
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [f.range, f.status]);
  const move = async (id, status) => {
    try { await patchEncounter(id, { status }); load(); } catch (e) { alert(e?.response?.data?.error || "Lỗi"); }
  };
  return (
    <Card>
      <SectionTitle>Dòng ca tiếp nhận</SectionTitle>
      <div className="mt-2 flex gap-2">
        <select value={f.range} onChange={(e) => setF({ ...f, range: e.target.value })} className="rounded-xl bg-white/5 px-2 py-1.5 text-xs ring-1 ring-white/10">
          <option value="today">Hôm nay</option><option value="7d">7 ngày</option><option value="30d">30 ngày</option><option value="all">Tất cả</option>
        </select>
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="rounded-xl bg-white/5 px-2 py-1.5 text-xs ring-1 ring-white/10">
          <option value="">Mọi trạng thái</option>
          {["REGISTERED", "WAITING", "IN_EXAM", "COMPLETED", "REJECTED", "REFERRED", "EMERGENCY", "ADMITTED", "DISCHARGED"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="mt-2 max-h-96 space-y-1.5 overflow-y-auto">
        {list.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/30 px-3 py-2 ring-1 ring-white/5">
            <div><b className="font-mono text-[12px] text-cyan-300">{e.id}</b>
              <p className="text-[11px] text-zinc-400">{e.patientId} · {e.department} · {e.building} · {e.status}</p></div>
            <div className="flex gap-1">
              {[["IN_EXAM", "Khám"], ["COMPLETED", "Xong"], ["ADMITTED", "Nhập viện"], ["REFERRED", "Chuyển tuyến"], ["REJECTED", "Từ chối"]].map(([st, lb]) => (
                <button key={st} onClick={() => move(e.id, st)} className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold">{lb}</button>
              ))}
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-[12px] text-zinc-500">— (chưa có ca)</p>}
      </div>
    </Card>
  );
}

function EmergencyDesk() {
  const [cases, setCases] = useState([]);
  const load = async () => { try { setCases((await fetchSos()).items || []); } catch {} };
  useEffect(() => { load(); }, []);
  const flow = ["SOS_REQUESTED", "ACKNOWLEDGED", "DISPATCHING", "EN_ROUTE", "ARRIVED", "CLOSED"];
  return (
    <Card>
      <SectionTitle>Cấp cứu / SOS (DEMO/SIMULATED khi chưa có API điều phối thật)</SectionTitle>
      <div className="mt-2 space-y-1.5">
        {cases.slice(0, 10).map((c) => (
          <div key={c.id} className="rounded-xl bg-black/30 px-3 py-2 ring-1 ring-white/5">
            <div className="flex justify-between text-[12px]"><b className="font-mono text-cyan-300">{c.id}</b><span className="text-red-300 font-bold">{c.status}</span></div>
            <p className="text-[11px] text-zinc-400">{c.name} · {c.phone} · GPS {c.lat},{c.lng}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {flow.slice(flow.indexOf(c.status) + 1).map((st) => (
                <button key={st} onClick={async () => { try { await patchSos(c.id, st); load(); } catch (e) { alert(e?.response?.data?.error); } }} className="rounded-lg bg-red-500/20 px-2 py-1 text-[10px] font-bold text-red-200">→ {st}</button>
              ))}
            </div>
          </div>
        ))}
        {cases.length === 0 && <p className="text-[12px] text-zinc-500">— (chưa có SOS)</p>}
      </div>
    </Card>
  );
}

function DeptCapacity() {
  const [caps, setCaps] = useState([]);
  const [msg, setMsg] = useState("");
  const load = async () => { try { setCaps(await fetchCapacity()); } catch {} };
  useEffect(() => { load(); }, []);
  const set = async (dept, status) => {
    try { const r = await patchCapacity(dept, { status }); setMsg(r.guidance || "OK"); load(); }
    catch (e) { setMsg(e?.response?.data?.error || "Lỗi"); }
  };
  return (
    <Card>
      <SectionTitle>Trạng thái khoa (đặc thù từng khoa — xem chi tiết ở tab Khoa)</SectionTitle>
      {msg && <p className="mt-1 text-[12px] text-amber-300">{msg}</p>}
      <div className="mt-2 space-y-1.5">
        {caps.map((c) => (
          <div key={c.department} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/30 px-3 py-2 ring-1 ring-white/5">
            <b className="text-[13px] text-white">{c.department} — <span className={c.status === "NORMAL" ? "text-emerald-300" : "text-red-300"}>{c.status}</span></b>
            <div className="flex gap-1">{["NORMAL", "BUSY", "FULL", "CRITICAL", "EMERGENCY"].map((s) => (
              <button key={s} onClick={() => set(c.department, s)} className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold">{s}</button>
            ))}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

const TABS = [
  ["ov", "🗺️ Overview"], ["flow", "🧾 Tiếp nhận"], ["sos", "🚨 Cấp cứu"], ["cap", "🏥 Khoa/Capacity"],
];

/** Command Center: WHAT/ATTENTION/OWNER/ACTION — số liệu từ live-stores. */
export default function CommandCenter() {
  const [tab, setTab] = useState("ov");
  const [data, setData] = useState(null);
  const [range, setRange] = useState("today");
  const [err, setErr] = useState("");
  const load = async () => {
    try { setErr(""); setData(await fetchOverview({ range })); }
    catch (e) { setErr(e?.response?.data?.error || "Cần quyền điều hành (CEO/ADMIN/Giám đốc/Command)."); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range]);
  return (
    <div className="space-y-3">
      <DemoBanner />
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-white/[0.04] p-2 ring-1 ring-white/10">
        {TABS.map(([id, lb]) => (
          <button key={id} onClick={() => setTab(id)} className={`rounded-xl px-3 py-1.5 text-xs font-black ${tab === id ? "bg-white text-zinc-950" : "text-zinc-300"}`}>{lb}</button>
        ))}
        <select value={range} onChange={(e) => setRange(e.target.value)} className="ml-auto rounded-xl bg-white/5 px-2 py-1.5 text-xs ring-1 ring-white/10">
          <option value="today">Hôm nay</option><option value="7d">7 ngày</option><option value="30d">30 ngày</option><option value="all">Tất cả</option>
        </select>
      </div>
      {err && <Card><p className="text-sm text-red-300">{err}</p></Card>}
      {tab === "ov" && <Overview data={data} reload={load} />}
      {tab === "flow" && <IntakeFlow />}
      {tab === "sos" && <EmergencyDesk />}
      {tab === "cap" && <DeptCapacity />}
    </div>
  );
}

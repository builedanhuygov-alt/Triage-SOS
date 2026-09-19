import React, { useEffect, useState } from "react";
import { CalendarCheck, CircleDollarSign, FileImage, FlaskConical, FolderOpen, Loader2, UserRound } from "lucide-react";
import { api } from "../services/api.js";
import { useSession } from "../context/SessionContext.jsx";

const TABS = [
  ["record", "Hồ sơ", FolderOpen],
  ["appointments", "Lịch hẹn", CalendarCheck],
  ["lab", "Xét nghiệm", FlaskConical],
  ["imaging", "CĐHA", FileImage],
  ["billing", "Chi phí", CircleDollarSign],
];

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString("vi-VN")} đ`;
}

function Status({ children }) {
  return <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700">{children}</span>;
}

export default function PatientHealthView() {
  const { user } = useSession();
  const [active, setActive] = useState("record");
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(user?.patientId || "");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isCaregiver = user?.role === "CAREGIVER";

  useEffect(() => {
    if (!isCaregiver) return;
    api.get("/api/me/linked-patients").then((r) => {
      const linked = r.data.data || [];
      setPatients(linked);
      setSelected((current) => current || linked[0]?.patientId || "");
    }).catch((e) => setError(e?.response?.data?.error || "Không tải được người đang chăm sóc"));
  }, [isCaregiver]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true); setError("");
    const query = isCaregiver ? `?patientId=${encodeURIComponent(selected)}` : "";
    const endpoint = active === "record" ? "/api/me/profile" : `/api/me/${active}${query}`;
    api.get(endpoint).then((r) => {
      if (!cancelled) setData(r.data.data);
    }).catch((e) => {
      if (!cancelled) { setData(null); setError(e?.response?.data?.error || "Không tải được dữ liệu"); }
    }).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [active, selected, isCaregiver]);

  const profile = active === "record" ? data : null;
  const items = Array.isArray(data) ? data : [];

  return (
    <div className="min-h-full bg-slate-50 px-4 pb-32 pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[.18em] text-cyan-700">Personal Health Command Center</p>
          <h1 className="mt-1 text-xl font-black text-slate-900">{isCaregiver ? "Chăm sóc người thân" : `Xin chào, ${user?.name || "bạn"}`}</h1>
          <p className="mt-1 text-xs text-slate-500">Dữ liệu DEMO / SEEDED · quyền truy cập được kiểm tra ở backend</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700"><UserRound className="h-5 w-5" /></span>
      </div>

      {isCaregiver && (
        <label className="mt-4 block rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Người đang chăm sóc</span>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="mt-1 w-full bg-transparent text-sm font-black text-slate-900 outline-none">
            {patients.map((p) => <option key={p.patientId} value={p.patientId}>{p.fullName} · {p.medicalId}</option>)}
          </select>
        </label>
      )}

      <div className="mt-4 flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
        {TABS.map(([id, label, Icon]) => <button key={id} onClick={() => setActive(id)} className={`flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-black ${active === id ? "bg-slate-900 text-white" : "text-slate-500"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
      </div>

      {loading && <div className="flex justify-center py-10 text-cyan-700"><Loader2 className="h-5 w-5 animate-spin" /></div>}
      {error && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}
      {!loading && !error && active === "record" && profile && (
        <div className="mt-4 space-y-3">
          <section className="rounded-3xl bg-slate-900 p-4 text-white shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-cyan-300">Medical ID</p><p className="mt-1 font-mono text-2xl font-black">{profile.medicalId}</p><p className="mt-2 text-xs text-slate-300">{profile.fullName} · {profile.dateOfBirth}</p></section>
          <section className="grid grid-cols-2 gap-2">{[["Nhóm máu", profile.bloodType], ["BHYT demo", profile.insurance], ["Dị ứng", profile.allergies?.join(", ") || "NOT PROVIDED"], ["Tiền sử", profile.chronicConditions?.join(", ") || "NOT PROVIDED"]].map(([label, value]) => <div key={label} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200"><p className="text-[10px] font-black uppercase text-slate-400">{label}</p><p className="mt-1 text-xs font-bold text-slate-800">{value}</p></div>)}</section>
          <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Hồ sơ khám</p>{profile.visits?.length ? profile.visits.map((visit) => <div key={visit.id} className="mt-3 border-t border-slate-100 pt-3"><p className="text-xs font-black text-slate-800">{visit.department}</p><p className="mt-1 text-xs text-slate-600">{visit.reason}</p><p className="mt-1 text-[11px] text-slate-400">{visit.status} · {new Date(visit.date).toLocaleDateString("vi-VN")}</p></div>) : <p className="mt-2 text-xs text-slate-400">Chưa có lượt khám trong phạm vi.</p>}</section>
        </div>
      )}
      {!loading && !error && active !== "record" && (
        <div className="mt-4 space-y-2">
          {!items.length && <p className="rounded-2xl bg-white p-6 text-center text-xs text-slate-400 ring-1 ring-slate-200">Chưa có dữ liệu trong phạm vi được cấp.</p>}
          {items.map((item) => <article key={item.id || `${item.date}-${item.test || item.service}`} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            {active === "appointments" && <><div className="flex items-start justify-between"><div><p className="text-sm font-black text-slate-900">{item.time} · {item.type}</p><p className="mt-1 text-xs text-slate-600">{item.date} · {item.location || "Phòng khám DEMO"}</p></div><Status>{item.status}</Status></div><p className="mt-2 text-xs text-slate-500">{item.doctor?.name || "Bác sĩ DEMO"} · {item.doctor?.specialty || item.departmentId}</p></>}
            {active === "lab" && <><div className="flex items-start justify-between"><p className="text-sm font-black text-slate-900">{item.test}</p><Status>{item.status}</Status></div><p className="mt-2 text-xs text-slate-600">Kết quả: {item.result || "Đang chờ"} {item.unit}</p><p className="mt-1 text-[11px] text-slate-400">{item.abnormal ? "ABNORMAL FLAG · nhân viên y tế cần xem xét" : "Thông tin hệ thống, không phải chẩn đoán"}</p></>}
            {active === "imaging" && <><div className="flex items-start justify-between"><p className="text-sm font-black text-slate-900">{item.test}</p><Status>{item.status}</Status></div><p className="mt-2 text-xs text-slate-600">Radiology Report: {item.report}</p><p className="mt-1 text-[11px] text-slate-400">Không thay thế báo cáo của bác sĩ chẩn đoán hình ảnh.</p></>}
            {active === "billing" && <><div className="flex items-start justify-between"><p className="text-sm font-black text-slate-900">{item.service}</p><Status>{item.status}</Status></div><p className="mt-2 text-sm font-black text-slate-800">{formatMoney(item.amount)}</p><p className="mt-1 text-[11px] text-amber-700">{item.paymentMode} · chưa kết nối cổng thanh toán thật</p></>}
          </article>)}
        </div>
      )}
    </div>
  );
}

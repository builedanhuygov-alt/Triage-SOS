import React, { useState } from "react";
import { intakePatient, fetchChart, fetchJourney, addNote, addDiagnosis, createOrder, bhytVerify, bhytManual } from "../../services/hospitalApi.js";
import { Card, SectionTitle } from "./ui.jsx";

const inp = "rounded-xl bg-white/5 px-2.5 py-1.5 text-xs text-white ring-1 ring-white/10 outline-none w-full";

export function IntakeForm() {
  const [f, setF] = useState({ fullName: "", cccd: "", phone: "", department: "er", building: "A", symptom: "", bhytCode: "" });
  const [msg, setMsg] = useState("");
  const [dup, setDup] = useState([]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (confirmDuplicate = false) => {
    try {
      setMsg(""); setDup([]);
      const r = await intakePatient({ ...f, confirmDuplicate });
      setMsg(`✓ BN ${r.patient.patientId} · Ca ${r.encounter.id} (${r.encounter.status})`);
    } catch (e) {
      if (e?.response?.status === 409) { setDup(e.response.data.data.candidates || []); setMsg("⚠️ Nghi trùng hồ sơ (DUPLICATE DETECTION) — kiểm tra rồi bấm Ghi đè xác nhận."); }
      else setMsg(e?.response?.data?.error || "Lỗi");
    }
  };
  return (
    <Card>
      <SectionTitle>🧾 Tiếp nhận bệnh nhân (định danh + BHYT + liên hệ + y tế)</SectionTitle>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input value={f.fullName} onChange={set("fullName")} placeholder="Họ tên *" className={inp} />
        <input value={f.cccd} onChange={set("cccd")} placeholder="CCCD" className={inp} />
        <input value={f.phone} onChange={set("phone")} placeholder="SĐT" className={inp} />
        <input value={f.bhytCode} onChange={set("bhytCode")} placeholder="Mã BHYT" className={inp} />
        <input value={f.symptom} onChange={set("symptom")} placeholder="Lý do khám" className={inp} />
        <div className="flex gap-2">
          <select value={f.department} onChange={set("department")} className={inp}>
            {["er", "cardio", "trauma", "respiratory", "neuro", "icu"].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={f.building} onChange={set("building")} className={inp}>
            {["A", "B", "C", "D"].map((b) => <option key={b} value={b}>Tòa {b}</option>)}
          </select>
        </div>
      </div>
      {msg && <p className="mt-2 text-[12px] text-cyan-300">{msg}</p>}
      {dup.map((d) => <p key={d.patientId} className="text-[12px] text-amber-300">Ứng viên trùng: {d.patientId} — {d.fullName} · CCCD {d.cccd} · {d.phone}</p>)}
      <div className="mt-2 flex gap-2">
        <button onClick={() => submit(false)} className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-black text-zinc-950">Tiếp nhận</button>
        {dup.length > 0 && <button onClick={() => submit(true)} className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-black text-zinc-950">Ghi đè xác nhận (đã kiểm tra)</button>}
      </div>
    </Card>
  );
}

export function PatientChart() {
  const [pid, setPid] = useState("P001");
  const [chart, setChart] = useState(null);
  const [msg, setMsg] = useState("");
  const [note, setNote] = useState("");
  const [dx, setDx] = useState("");
  const load = async () => {
    try { setMsg(""); setChart(await fetchChart(pid)); }
    catch (e) { setMsg(e?.response?.data?.error || "Lỗi"); }
  };
  return (
    <div className="space-y-3">
      <Card>
        <SectionTitle>📋 Sổ bệnh nhân — PATIENT CHART (1 nguồn cho Web + App)</SectionTitle>
        <div className="mt-2 flex gap-2">
          <input value={pid} onChange={(e) => setPid(e.target.value)} placeholder="Patient ID" className={`${inp} font-mono`} />
          <button onClick={load} className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-black text-zinc-950">Mở hồ sơ</button>
        </div>
        {msg && <p className="mt-1 text-[12px] text-red-300">{msg}</p>}
      </Card>
      {chart && (
        <Card>
          <p className="text-[11px] text-amber-300">{chart.banner}</p>
          <p className="mt-1 text-sm font-black text-white">{chart.profile.fullName} · {chart.profile.patientId} · BHYT {chart.bhyt?.status || "—"}</p>
          <p className="text-[12px] text-zinc-400">Dị ứng: {(chart.allergies || []).join(", ") || "—"} · Bệnh nền: {(chart.conditions || []).join(", ") || "—"}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
            <span className="rounded-lg bg-black/30 p-2">Lần khám: <b className="text-white">{chart.encounters.length}</b></span>
            <span className="rounded-lg bg-black/30 p-2">Chẩn đoán: <b className="text-white">{chart.diagnoses.length}</b></span>
            <span className="rounded-lg bg-black/30 p-2">Xét nghiệm/CĐHA: <b className="text-white">{chart.orders.length}</b></span>
            <span className="rounded-lg bg-black/30 p-2">Đơn thuốc: <b className="text-white">{chart.prescriptions.length}</b></span>
          </div>
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {chart.encounters.slice(0, 10).map((e) => <JourneyRow key={e.id} enc={e} onAct={load} />)}
          </div>
          <div className="mt-2 flex gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú lâm sàng…" className={inp} />
            <button onClick={async () => { try { const id = chart.encounters[0]?.id; if (id) { await addNote(id, { text: note }); setNote(""); load(); } } catch (e) { setMsg(e?.response?.data?.error); } }} className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold">+ Note</button>
            <input value={dx} onChange={(e) => setDx(e.target.value)} placeholder="Chẩn đoán…" className={inp} />
            <button onClick={async () => { try { const id = chart.encounters[0]?.id; if (id) { await addDiagnosis(id, { text: dx }); setDx(""); load(); } } catch (e) { setMsg(e?.response?.data?.error); } }} className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold">+ Dx</button>
          </div>
        </Card>
      )}
    </div>
  );
}

function JourneyRow({ enc, onAct }) {
  const [open, setOpen] = useState(false);
  const [j, setJ] = useState(null);
  const toggle = async () => {
    if (!open) { try { setJ(await fetchJourney(enc.id)); } catch {} }
    setOpen(!open);
  };
  return (
    <div className="rounded-xl bg-black/30 px-3 py-2 ring-1 ring-white/5">
      <button onClick={toggle} className="flex w-full justify-between text-left text-[12px]">
        <b className="font-mono text-cyan-300">{enc.id}</b>
        <span className="text-zinc-400">{enc.department} · {enc.status} · {String(enc.createdAt).slice(0, 10)}</span>
      </button>
      {open && j && (
        <div className="mt-1 flex flex-wrap gap-1">
          {j.steps.map((s) => (
            <span key={s.key} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.done ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-zinc-500"}`}>
              {s.done ? "✓" : "○"} {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function BhytPanel() {
  const [pid, setPid] = useState("P002");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <Card>
      <SectionTitle>💳 BHYT — ADAPTER READY (thủ công khi chưa có API chính thức)</SectionTitle>
      <div className="mt-2 flex flex-wrap gap-2">
        <input value={pid} onChange={(e) => setPid(e.target.value)} placeholder="Patient ID" className={`${inp} font-mono`} style={{ maxWidth: 140 }} />
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Mã BHYT" className={inp} style={{ maxWidth: 200 }} />
        <button onClick={async () => { try { const r = await bhytVerify({ patientId: pid, code }); setMsg(`${r.status} · ${r.external}`); } catch (e) { setMsg(e?.response?.data?.error); } }} className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-black text-zinc-950">Xác minh</button>
        <button onClick={async () => { try { const r = await bhytManual({ patientId: pid, result: "VERIFIED", note: "Đối chiếu thẻ (demo)" }); setMsg(`${r.status} bởi ${r.verifiedBy}`); } catch (e) { setMsg(e?.response?.data?.error); } }} className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold">Nhập KQ thủ công: VERIFIED</button>
      </div>
      {msg && <p className="mt-1 text-[12px] text-cyan-300">{msg}</p>}
    </Card>
  );
}

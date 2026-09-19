import React, { useEffect, useState } from "react";
import { fetchResources, fetchResourceAlerts, requestResource, fetchApprovals, processApproval, approveApproval,
  createBill, confirmPayment, fetchDocuments, createDocument, receiveDocument, processDocument, approveDocument,
  fetchAnomaly, reviewAnomaly } from "../../services/hospitalApi.js";
import { Card, SectionTitle } from "./ui.jsx";

const inp = "rounded-xl bg-white/5 px-2.5 py-1.5 text-xs text-white ring-1 ring-white/10 outline-none";

export function ResourceControl() {
  const [items, setItems] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [aprs, setAprs] = useState([]);
  const [msg, setMsg] = useState("");
  const [req, setReq] = useState({ id: "", qty: 1, reason: "" });
  const load = async () => {
    try {
      setItems((await fetchResources()).items || []);
      setAlerts((await fetchResourceAlerts()).items || []);
      setAprs((await fetchApprovals()).items || []);
    } catch (e) { setMsg(e?.response?.data?.error || "Cần quyền RESOURCE_VIEW"); }
  };
  useEffect(() => { load(); }, []);
  const sendReq = async () => {
    try { await requestResource(req.id, { qty: Number(req.qty), reason: req.reason }); setMsg("Đã REQUEST → PENDING_APPROVAL"); load(); }
    catch (e) { setMsg(e?.response?.data?.error || "Lỗi"); }
  };
  return (
    <div className="space-y-3">
      {msg && <Card><p className="text-[13px] text-cyan-300">{msg}</p></Card>}
      <Card>
        <SectionTitle>📦 Tồn kho (Tòa→Tầng→Khoa→Phòng→Kho)</SectionTitle>
        <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
          {items.map((r) => (
            <div key={r.id} className="flex justify-between rounded-xl bg-black/30 px-3 py-1.5 text-[12px] ring-1 ring-white/5">
              <span className="text-zinc-200"><b className="font-mono text-cyan-300">{r.id}</b> {r.name} · {r.batch} · HSD {r.expiry || "—"} · {r.building}/{r.department}/{r.room}</span>
              <span className={r.status === "NORMAL" ? "text-emerald-300" : "text-red-300 font-bold"}>{r.qty} {r.unit} · {r.status}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <SectionTitle>Xin xuất kho (Trưởng khoa REQUEST → Kho PROCESS → Authority APPROVE)</SectionTitle>
        <div className="mt-2 flex flex-wrap gap-2">
          <select value={req.id} onChange={(e) => setReq({ ...req, id: e.target.value })} className={inp}>
            <option value="">Chọn resource…</option>{items.map((r) => <option key={r.id} value={r.id}>{r.id} — {r.name} ({r.qty})</option>)}
          </select>
          <input type="number" min="1" value={req.qty} onChange={(e) => setReq({ ...req, qty: e.target.value })} className={`${inp} w-20`} />
          <input value={req.reason} onChange={(e) => setReq({ ...req, reason: e.target.value })} placeholder="Lý do thay đổi" className={`${inp} min-w-[180px] flex-1`} />
          <button onClick={sendReq} className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-black text-zinc-950">REQUEST</button>
        </div>
        <div className="mt-2 space-y-1">
          {aprs.slice(0, 8).map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/30 px-3 py-1.5 text-[12px] ring-1 ring-white/5">
              <span className="font-mono text-cyan-300">{a.id}</span>
              <span className="text-zinc-400">{a.refId} · {a.qtyBefore}→{a.qtyAfter} · {a.state} · {a.reason}</span>
              <span className="flex gap-1">
                <button onClick={async () => { try { await processApproval(a.id); load(); } catch (e) { setMsg(e?.response?.data?.error); } }} className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold">Kho PROCESS</button>
                <button onClick={async () => { try { await approveApproval(a.id, "APPROVE"); setMsg("APPROVED ✓"); load(); } catch (e) { setMsg(e?.response?.data?.error); } }} className="rounded-lg bg-emerald-500/20 px-2 py-1 text-[10px] font-bold text-emerald-200">APPROVE</button>
              </span>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <SectionTitle>Cảnh báo ({alerts.length})</SectionTitle>
        {alerts.map((a) => <p key={a.id} className="mt-1 text-[12px] text-red-300">⬤ {a.priority} — {a.name}: còn {a.qty} {a.unit} · {a.location} · Chủ quản {a.manager}</p>)}
        {alerts.length === 0 && <p className="text-[12px] text-zinc-500">Không có cảnh báo.</p>}
      </Card>
    </div>
  );
}

export function FinanceDesk() {
  const [encId, setEncId] = useState("");
  const [items, setItems] = useState([{ label: "Khám", amount: 200000 }]);
  const [bill, setBill] = useState(null);
  const [msg, setMsg] = useState("");
  const [method, setMethod] = useState("CASH");
  const mk = async () => {
    try { const r = await createBill(encId, items); setBill(r); setMsg("Đã tạo BILL + QR (không chứa dữ liệu y tế nhạy cảm)"); }
    catch (e) { setMsg(e?.response?.data?.error || "Lỗi — cần quyền PAYMENT_CREATE"); }
  };
  const cf = async () => {
    try { const r = await confirmPayment(bill.payment.id, { method }); setBill({ ...bill, payment: r.payment }); setMsg(`PAID ✓ ${method} — biên nhận ${r.receipt.txn}`); }
    catch (e) { setMsg(e?.response?.data?.error || "Lỗi — cần quyền PAYMENT_VERIFY (kế toán xác nhận, không phải BS)"); }
  };
  return (
    <div className="space-y-3">
      {msg && <Card><p className="text-[13px] text-cyan-300">{msg}</p></Card>}
      <Card>
        <SectionTitle>💰 Kế toán: doanh thu / giao dịch / BHYT (không KPI y tế)</SectionTitle>
        <div className="mt-2 flex flex-wrap gap-2">
          <input value={encId} onChange={(e) => setEncId(e.target.value)} placeholder="Encounter ID (ENC-…)" className={`${inp} min-w-[200px] flex-1 font-mono`} />
          <input value={items[0]?.label || ""} onChange={(e) => setItems([{ ...items[0], label: e.target.value }])} className={`${inp} w-32`} />
          <input type="number" value={items[0]?.amount || 0} onChange={(e) => setItems([{ ...items[0], amount: Number(e.target.value) }])} className={`${inp} w-32`} />
          <button onClick={mk} className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-black text-zinc-950">Tạo BILL + QR</button>
        </div>
        {bill && (
          <div className="mt-2 rounded-xl bg-black/30 p-3 ring-1 ring-white/10">
            <p className="font-mono text-[12px] text-cyan-300">{bill.bill.id} — {bill.bill.total.toLocaleString("vi-VN")}đ · {bill.payment.status}</p>
            <p className="mt-1 break-all font-mono text-[10px] text-zinc-500">{bill.payment.qr}</p>
            <div className="mt-2 flex gap-2">
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={inp}>
                <option>CASH</option><option>TRANSFER</option><option>QR</option>
              </select>
              <button onClick={cf} className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-black text-white">Kế toán xác nhận thu</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export function DocControl() {
  const [docs, setDocs] = useState([]);
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState("");
  const load = async () => { try { setDocs((await fetchDocuments()).items || []); } catch (e) { setMsg(e?.response?.data?.error || "Cần quyền văn thư"); } };
  useEffect(() => { load(); }, []);
  const act = async (fn, id, arg) => { try { await fn(id, arg); load(); } catch (e) { setMsg(e?.response?.data?.error || "Lỗi quyền"); } };
  return (
    <div className="space-y-3">
      {msg && <Card><p className="text-[13px] text-cyan-300">{msg}</p></Card>}
      <Card>
        <SectionTitle>📄 Văn thư: đến / đi / xử lý / quá hạn / chờ duyệt</SectionTitle>
        <div className="mt-2 flex gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tiêu đề công văn…" className={`${inp} flex-1`} />
          <button onClick={async () => { try { await createDocument({ direction: "IN", title, deadline: "2026-12-31" }); setTitle(""); load(); } catch (e) { setMsg(e?.response?.data?.error); } }} className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-black text-zinc-950">Tạo</button>
        </div>
        <div className="mt-2 space-y-1">
          {docs.slice(0, 12).map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/30 px-3 py-1.5 text-[12px] ring-1 ring-white/5">
              <span><b className="font-mono text-cyan-300">{d.id}</b> <span className="text-zinc-300">{d.title}</span> <span className={d.computedStatus === "OVERDUE" ? "text-red-300 font-bold" : "text-zinc-500"}>· {d.computedStatus} · hạn {d.deadline || "—"}</span></span>
              <span className="flex gap-1">
                <button onClick={() => act(receiveDocument, d.id)} className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold">Tiếp nhận</button>
                <button onClick={() => act(processDocument, d.id, "xử lý")} className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold">Xử lý</button>
                <button onClick={() => act(approveDocument, d.id)} className="rounded-lg bg-emerald-500/20 px-2 py-1 text-[10px] font-bold text-emerald-200">Phê duyệt</button>
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function SecurityCenter() {
  const [cases, setCases] = useState([]);
  const [msg, setMsg] = useState("");
  const load = async () => { try { setCases((await fetchAnomaly("OPEN")).items || []); } catch (e) { setMsg(e?.response?.data?.error || "Cần quyền ANOMALY_VIEW"); } };
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-3">
      {msg && <Card><p className="text-[13px] text-cyan-300">{msg}</p></Card>}
      <Card>
        <SectionTitle>🛡️ Security & Anomaly — ANOMALY DETECTED → REVIEW CASE (không tự kết luận/khóa)</SectionTitle>
        <div className="mt-2 space-y-1.5">
          {cases.map((c) => (
            <div key={c.id} className="rounded-xl bg-black/30 px-3 py-2 ring-1 ring-white/5">
              <div className="flex justify-between text-[12px]"><b className="font-mono text-orange-300">{c.id}</b><span className="text-zinc-400">{c.severity} · {c.state}</span></div>
              <p className="text-[12px] text-zinc-300">{c.signals?.join(", ")} — {c.subject} · {c.detail}</p>
              <div className="mt-1 flex gap-1">
                <button onClick={async () => { try { await reviewAnomaly(c.id, "RESOLVED", "đã xác minh"); load(); } catch (e) { setMsg(e?.response?.data?.error); } }} className="rounded-lg bg-emerald-500/20 px-2 py-1 text-[10px] font-bold text-emerald-200">Xác minh xong</button>
                <button onClick={async () => { try { await reviewAnomaly(c.id, "DISMISSED", "bỏ qua"); load(); } catch (e) { setMsg(e?.response?.data?.error); } }} className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold">Bỏ qua</button>
              </div>
            </div>
          ))}
          {cases.length === 0 && <p className="text-[12px] text-zinc-500">Không có review case đang mở.</p>}
        </div>
      </Card>
    </div>
  );
}

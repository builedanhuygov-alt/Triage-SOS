import React, { useEffect, useState } from "react";
import { fetchStaff, fetchStaffDetail, updateStaffStatus, resetStaffPassword, API_BASE,
  adminSetStatus, adminUserAudit } from "../../services/hospitalApi.js";
import CreateUserModal from "./CreateUserModal.jsx";
import { Card, SectionTitle, StatusBadge, RoleBadge, Field, initials, DemoBanner } from "./ui.jsx";

/** Quản lý tài khoản (/admin/users): bảng + filter + drawer chi tiết + actions. */
export default function StaffDirectory() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("");
  const [building, setBuilding] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [fullAudit, setFullAudit] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = async (p = 1) => {
    try {
      setErr("");
      const r = await fetchStaff({ q, role: role || undefined, department: department || undefined, building: building || undefined, status: status || undefined, page: p, limit: 15 });
      setData(r); setSummary(r.summary); setPage(r.page);
    } catch (e) {
      setErr(e?.response?.data?.error || "Không tải được (cần quyền staff.view — đăng nhập CEO/ADMIN).");
    }
  };

  useEffect(() => { load(1); /* eslint-disable-next-line */ }, []);
  useEffect(() => { const t = setTimeout(() => load(1), 350); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [q, role, department, building, status]);

  const open = async (u) => {
    setSelected(u); setDetail(null); setFullAudit(null);
    try { setDetail(await fetchStaffDetail(u.username)); }
    catch (e) { setMsg(e?.response?.data?.error || "Không xem được chi tiết"); }
  };

  const doStatus = async (st) => {
    try {
      await updateStaffStatus(selected.username, st);
      setMsg(`Đã chuyển ${selected.username} → ${st}`);
      const d = await fetchStaffDetail(selected.username); setDetail(d); load(page);
    } catch (e) { setMsg(e?.response?.data?.error || "Đổi trạng thái thất bại"); }
  };
  const doAdminStatus = async (st) => {
    try {
      await adminSetStatus(selected.username, st, "thao tác từ Staff Directory");
      setMsg(`Đã chuyển ${selected.username} → ${st} (persistent)`);
      const d = await fetchStaffDetail(selected.username); setDetail(d); load(page);
    } catch (e) { setMsg(e?.response?.data?.error || "Đổi trạng thái thất bại"); }
  };
  const doReset = async () => {
    try {
      const r = await resetStaffPassword(selected.username);
      setMsg(`Đã reset mật khẩu demo của ${selected.username} → ${r.demoPassword}`);
      const d = await fetchStaffDetail(selected.username); setDetail(d);
    } catch (e) { setMsg(e?.response?.data?.error || "Reset thất bại"); }
  };

  const pages = Math.max(1, Math.ceil((data.total || 0) / 15));
  const sel = "rounded-xl bg-white/5 px-2.5 py-2 text-xs font-semibold text-zinc-200 ring-1 ring-white/10 outline-none";

  return (
    <div className="space-y-3">
      <DemoBanner />
      {summary && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {[["Tổng", summary.totalAccounts], ["Active", summary.active], ["Inactive", summary.inactive], ["Locked", summary.locked], ["Roles", summary.roles], ["Khoa", summary.departments]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/[0.04] p-2.5 text-center ring-1 ring-white/10">
              <p className="text-lg font-black text-white">{v}</p>
              <p className="text-[10px] uppercase text-zinc-500">{k}</p>
            </div>
          ))}
        </div>
      )}
      <Card>
        <div className="flex flex-wrap gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên / username / mã NV…" className="min-w-[200px] flex-1 rounded-xl bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10 outline-none placeholder:text-zinc-500" />
          <select value={building} onChange={(e) => setBuilding(e.target.value)} className={sel}>
            <option value="">Mọi tòa</option>{["GATE", "A", "B", "C", "D"].map((b) => <option key={b} value={b}>Tòa {b}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
            <option value="">Mọi trạng thái</option>{["ACTIVE", "INACTIVE", "LOCKED", "PENDING"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (VD: DOCTOR)" className="w-36 rounded-xl bg-white/5 px-3 py-2 text-xs text-white ring-1 ring-white/10 outline-none" />
          <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Mã khoa (VD: emergency)" className="w-44 rounded-xl bg-white/5 px-3 py-2 text-xs text-white ring-1 ring-white/10 outline-none" />
          <button onClick={() => setShowCreate(true)} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white">+ Tạo tài khoản</button>
          <a href={`${API_BASE}/release/demo-hospital-accounts.xlsx`} className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white">⬇ Excel</a>
        </div>
      </Card>
      {err && <Card><p className="text-sm text-red-300">{err}</p></Card>}
      {msg && <Card><p className="text-sm text-cyan-300">{msg}</p></Card>}
      <Card>
        <SectionTitle>Nhân sự ({data.total})</SectionTitle>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[12px]">
            <thead><tr className="text-[10px] uppercase text-zinc-500">
              {["", "Họ tên", "Username", "Chức danh", "Role", "Khoa", "Tòa", "Status"].map((h) => <th key={h} className="px-2 py-1.5">{h}</th>)}
            </tr></thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.username} onClick={() => open(u)} className="cursor-pointer border-t border-white/5 hover:bg-white/5">
                  <td className="px-2 py-2"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-black text-cyan-200">{initials(u.fullName)}</span></td>
                  <td className="px-2 py-2 font-bold text-white">{u.fullName}<p className="font-mono text-[10px] font-normal text-zinc-500">{u.employeeId}</p></td>
                  <td className="px-2 py-2 font-mono text-cyan-300">{u.username}</td>
                  <td className="px-2 py-2 text-zinc-300">{u.jobTitle}</td>
                  <td className="px-2 py-2"><RoleBadge role={u.role} /></td>
                  <td className="px-2 py-2 text-zinc-300">{u.departmentName}</td>
                  <td className="px-2 py-2 text-zinc-300">{u.building}·T{u.floor}</td>
                  <td className="px-2 py-2"><StatusBadge status={u.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-zinc-400">
          <span>Trang {page}/{pages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(p); }} className="rounded-lg bg-white/10 px-3 py-1.5 font-bold disabled:opacity-40">‹ Trước</button>
            <button disabled={page >= pages} onClick={() => { const p = page + 1; setPage(p); load(p); }} className="rounded-lg bg-white/10 px-3 py-1.5 font-bold disabled:opacity-40">Sau ›</button>
          </div>
        </div>
      </Card>

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setSelected(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-zinc-950 p-5 ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/20 text-sm font-black text-cyan-200">{initials(selected.fullName)}</span>
                <div><p className="font-black text-white">{selected.fullName}</p><p className="font-mono text-xs text-cyan-300">{selected.username}</p></div>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg bg-white/10 px-2.5 py-1 text-sm">✕</button>
            </div>
            {!detail ? <p className="mt-4 animate-pulse text-sm text-zinc-500">Đang tải…</p> : (
              <div className="mt-4 space-y-4">
                <div><p className="mb-1 text-[11px] font-black text-zinc-400">PERSON</p><div className="grid grid-cols-2 gap-2"><Field label="Employee ID">{detail.user.employeeId}</Field><Field label="Chức danh">{detail.user.jobTitle}</Field><Field label="Email">{detail.user.email}</Field><Field label="SĐT">{detail.user.phone}</Field></div></div>
                <div><p className="mb-1 text-[11px] font-black text-zinc-400">ORGANIZATION</p><div className="grid grid-cols-2 gap-2"><Field label="Tòa">{detail.user.building}</Field><Field label="Tầng">{detail.user.floor}</Field><Field label="Khoa">{detail.user.departmentName}</Field><Field label="Quản lý">{detail.user.supervisor}</Field></div></div>
                <div><p className="mb-1 text-[11px] font-black text-zinc-400">ACCESS</p><div className="flex flex-wrap gap-1.5"><RoleBadge role={detail.user.role} />{detail.permissions.slice(0, 14).map((p) => <span key={p} className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300">✓ {p}</span>)}<span className="text-[11px] text-zinc-500">+{Math.max(0, detail.permissions.length - 14)} quyền khác</span></div></div>
                <div><p className="mb-1 text-[11px] font-black text-zinc-400">ACCOUNT</p><div className="grid grid-cols-2 gap-2"><Field label="Status"><StatusBadge status={detail.user.status} /></Field><Field label="Scope">Level {detail.scope?.level}</Field></div></div>
                <div><p className="mb-1 text-[11px] font-black text-zinc-400">AUDIT GẦN ĐÂY</p>{(detail.recentAudit || []).length === 0 ? <p className="text-xs text-zinc-500">Chưa có hoạt động.</p> : detail.recentAudit.map((a, i) => <p key={i} className="font-mono text-[11px] text-zinc-400">{a.timestamp?.slice(0, 19)} · {a.action} · {a.result}</p>)}
                  <button onClick={async () => { try { setFullAudit(await adminUserAudit(selected.username)); } catch (e) { setMsg(e?.response?.data?.error || "Không xem được audit"); } }} className="mt-1 text-xs font-bold text-cyan-300">VIEW AUDIT →</button>
                  {fullAudit && fullAudit.items.map((a, i) => <p key={"f" + i} className="font-mono text-[11px] text-amber-200/80">{a.timestamp?.slice(0, 19)} · {a.actor} · {a.action} · {a.resourceId} · {a.result}</p>)}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => doStatus(detail.user.status === "LOCKED" ? "ACTIVE" : "LOCKED")} className="rounded-xl bg-amber-500/80 py-2 text-xs font-bold text-white">{detail.user.status === "LOCKED" ? "MỞ KHÓA" : "KHÓA TÀI KHOẢN"}</button>
                  <button onClick={doReset} className="rounded-xl bg-white/10 py-2 text-xs font-bold ring-1 ring-white/10">RESET MẬT KHẨU DEMO</button>
                  <button onClick={() => doAdminStatus("SUSPENDED")} className="rounded-xl bg-orange-600/80 py-2 text-xs font-bold text-white">SUSPEND</button>
                  <button onClick={() => doAdminStatus("DISABLED")} className="rounded-xl bg-red-600/80 py-2 text-xs font-bold text-white">DISABLE (không xóa)</button>
                  <button onClick={() => doAdminStatus("ACTIVE")} className="rounded-xl bg-emerald-600/80 py-2 text-xs font-bold text-white">REACTIVATE</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} onCreated={() => load(1)} />}
    </div>
  );
}

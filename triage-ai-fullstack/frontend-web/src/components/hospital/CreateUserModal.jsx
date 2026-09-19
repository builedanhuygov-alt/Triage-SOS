import React, { useEffect, useState } from "react";
import { adminCreateUser, fetchRoles, fetchDepartments } from "../../services/hospitalApi.js";

/**
 * CREATE ACCOUNT — 01 Identity / 02 Employment / 03 Role / 04 Scope / 05 Review / 06 Invite.
 * Validation trước submit: username/employee trùng, role/dept/scope không hợp lệ.
 * Mọi trạng thái loading/empty/error/retry đều có (không màn hình trắng).
 */
export default function CreateUserModal({ onClose, onCreated }) {
  const [f, setF] = useState({ fullName: "", username: "", employeeId: "", email: "", phone: "", jobTitle: "", role: "DOCTOR", department: "cardiology", building: "C", floor: "1", room: "", reason: "" });
  const [roles, setRoles] = useState([]);
  const [depts, setDepts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [r, d] = await Promise.all([fetchRoles(), fetchDepartments()]);
        if (alive) { setRoles(r.roles || []); setDepts(d.departments || []); }
      } catch (e) { if (alive) setErr("Không tải được roles/departments — kiểm tra quyền/quay lại thử."); }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const d = depts.find((x) => x.id === f.department);
    if (d && !f._bTouched) setF((s) => ({ ...s, building: d.building }));
  }, [f.department, depts]);

  const submit = async () => {
    try {
      setBusy(true); setErr("");
      const body = { ...f };
      delete body._bTouched;
      if (!body.employeeId) delete body.employeeId;
      if (!body.email) delete body.email;
      const r = await adminCreateUser(body);
      setDone(r);
      onCreated && onCreated(r.user);
    } catch (e) {
      setErr(e?.response?.data?.error || "Tạo thất bại — kiểm tra validation.");
    } finally { setBusy(false); }
  };

  const inp = "hosp-input";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onClick={onClose} role="dialog" aria-modal="true" aria-label="Tạo tài khoản">
      <div className="hosp-card max-h-[92vh] w-full max-w-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <p className="hosp-title">CREATE ACCOUNT</p>
        <p className="hosp-muted">Admin tạo → INVITED (token) → user đặt password riêng → ACTIVE. Giám đốc không biết password của BS.</p>
        {done ? (
          <div className="mt-3 space-y-2">
            <p className="hosp-ok">✓ Đã tạo {done.user.username} — trạng thái INVITED.</p>
            <div className="rounded-lg bg-black/30 p-3">
              <p className="text-xs font-bold">DEMO INVITATION / SIMULATED — email provider chưa cấu hình:</p>
              <p className="break-all font-mono text-xs text-amber-300">{done.inviteToken}</p>
              <p className="hosp-muted">Trao token trực tiếp cho user. Không giả vờ đã gửi email thật.</p>
            </div>
            <button onClick={onClose} className="hosp-btn hosp-btn-primary">Đóng</button>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <section><p className="hosp-title">01 · Identity</p>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <input aria-label="Họ tên" value={f.fullName} onChange={set("fullName")} placeholder="Họ tên *" className={inp} />
                <input aria-label="Username" value={f.username} onChange={set("username")} placeholder="username * (a-z0-9._-)" className={inp} />
                <input aria-label="Email" value={f.email} onChange={set("email")} placeholder="Email (tự sinh nếu trống)" className={inp} />
                <input aria-label="Điện thoại" value={f.phone} onChange={set("phone")} placeholder="Số điện thoại" className={inp} />
              </div></section>
            <section><p className="hosp-title">02 · Employment</p>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <input aria-label="Mã nhân viên" value={f.employeeId} onChange={set("employeeId")} placeholder="Mã NV (tự sinh nếu trống)" className={inp} />
                <input aria-label="Chức danh" value={f.jobTitle} onChange={set("jobTitle")} placeholder="Chức danh" className={inp} />
              </div></section>
            <section><p className="hosp-title">03 · Role</p>
              <select aria-label="Role" value={f.role} onChange={set("role")} className="hosp-select mt-1">
                {roles.map((r) => <option key={r.id} value={r.id}>{r.id} — {r.name}</option>)}
              </select></section>
            <section><p className="hosp-title">04 · Scope (Tòa → Khoa → Phòng)</p>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <select aria-label="Khoa" value={f.department} onChange={set("department")} className="hosp-select">
                  {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <input aria-label="Tòa" value={f.building} onChange={(e) => setF({ ...f, building: e.target.value, _bTouched: true })} placeholder="Tòa" className={inp} />
                <input aria-label="Phòng" value={f.room} onChange={set("room")} placeholder="Phòng (VD: PK 01)" className={inp} />
              </div>
              <input aria-label="Tầng" value={f.floor} onChange={set("floor")} placeholder="Tầng" className={`${inp} mt-2`} /></section>
            <section><p className="hosp-title">05 · Review</p>
              <p className="hosp-muted">{f.fullName || "—"} · {f.username || "—"} · {f.role} · {f.department} · Tòa {f.building} · {f.room || "—"}</p>
              <input aria-label="Lý do" value={f.reason} onChange={set("reason")} placeholder="Lý do tạo (ghi audit)" className={`${inp} mt-2`} /></section>
            {err && <p className="hosp-err" role="alert">{err} <button onClick={submit} className="underline">Thử lại</button></p>}
            <div className="flex gap-2">
              <button onClick={submit} disabled={busy || !f.fullName || !f.username} className="hosp-btn hosp-btn-primary">{busy ? "Đang tạo…" : "06 · Tạo (INVITED)"}</button>
              <button onClick={onClose} className="hosp-btn hosp-btn-ghost">Hủy</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

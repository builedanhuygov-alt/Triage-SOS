/**
 * lib/routesAdmin — User Management TRỌNG TÂM (§5-8, §20):
 * Admin → INVITED (+token) → user đặt password → ACTIVE.
 * Password scrypt-hash, không plaintext, không trả hash/token ngoài accept flow.
 * Không hard-delete (không có DELETE route — DISABLED là cuối).
 * Email chưa cấu hình: token trả về cho Admin UI kèm SIMULATED (không giả vờ đã gửi).
 */
"use strict";
const crypto = require("crypto");

const STATUSES = ["INVITED", "PENDING", "ACTIVE", "SUSPENDED", "LOCKED", "DISABLED"];
const HEAD_CREATABLE = ["DOCTOR", "NURSE", "TECHNICIAN", "PHARMACIST", "ADMIN_STAFF", "SUPPORT_STAFF"];
const HR_BLOCKED = ["SUPER_ADMIN", "IT_ADMIN", "HOSPITAL_DIRECTOR", "DEPUTY_DIRECTOR", "MEDICAL_BOARD"];

module.exports = function registerAdmin(ctx) {
  const { app, Auth, Hospital, Perms2, UserStore, audit, auditRich, auditTrail, ok, err, stamp, rateLimit, idempotent } = ctx;
  const rl = typeof rateLimit === "function" ? rateLimit : () => (req, res, next) => next();
  const idem = typeof idempotent === "function" ? idempotent : () => (req, res, next) => next();
  const roleIds = new Set(Hospital.ROLES.map((r) => r.id));
  const deptIds = new Set(Hospital.DEPARTMENTS.map((d) => d.id));

  const actorRole = (req) => req.user.hospitalRole || req.user.role;
  const actorRow = (req) => { try { return UserStore.findById(req.user.sub); } catch { return null; } };

  // Ai được quản lý ai (backend enforce, frontend chỉ UX)
  function manageError(actorClaims, actor, targetRole, targetDept) {
    const hr = actorClaims.hospitalRole;
    const role = actorClaims.role;
    if (hr === "SUPER_ADMIN" || role === "CEO" && !hr) {
      if (targetRole === "SUPER_ADMIN" && hr !== "SUPER_ADMIN") return "only SUPER_ADMIN creates SUPER_ADMIN";
      return null;
    }
    if (["IT_ADMIN"].includes(hr)) {
      if (targetRole === "SUPER_ADMIN") return "only SUPER_ADMIN creates SUPER_ADMIN";
      return null;
    }
    if (hr === "HOSPITAL_DIRECTOR" || role === "CEO") {
      if (["SUPER_ADMIN", "IT_ADMIN"].includes(targetRole)) return "cannot manage system admins";
      return null; // toàn viện, trừ SUPER_ADMIN kỹ thuật (§10 tách bạch)
    }
    if (hr === "HR_MANAGER" || role === "ADMIN") {
      if (HR_BLOCKED.includes(targetRole)) return `HR cannot manage ${targetRole}`;
      return null;
    }
    if (hr === "DEPARTMENT_HEAD") {
      const ownDept = actor?.department || actorClaims.department;
      if (!HEAD_CREATABLE.includes(targetRole)) return `head cannot manage role ${targetRole}`;
      if (targetDept && targetDept !== ownDept) return "head manages own department only";
      return null;
    }
    return "forbidden: staff managers only";
  }
  const requireManager = (req, res, next) => {
    const hr = req.user.hospitalRole;
    const okRole = ["SUPER_ADMIN", "IT_ADMIN", "HOSPITAL_DIRECTOR", "HR_MANAGER", "DEPARTMENT_HEAD"].includes(hr)
      || ["CEO", "ADMIN"].includes(req.user.role);
    if (!okRole) return err(res, 403, "forbidden: staff managers only");
    next();
  };

  const validUsername = (u) => /^[a-z0-9._-]{3,40}$/.test(String(u || ""));
  const validEmployee = (e) => /^[A-Z0-9-]{3,20}$/.test(String(e || ""));
  function nextEmployeeId() {
    const all = UserStore.list();
    let n = all.length + 1;
    for (;;) {
      const cand = `NV-NEW-${String(n).padStart(4, "0")}`;
      if (!all.some((u) => u.employeeId === cand)) return cand;
      n++;
    }
  }
  function buildScope(b) {
    if (b.scope && typeof b.scope === "object") {
      const d = Hospital.DEPARTMENTS.find((x) => x.id === (b.scope.department || b.department));
      return { level: b.scope.level ?? (d ? 3 : 2), building: b.scope.building ?? b.building ?? null,
        department: b.scope.department ?? b.department ?? null, unit: b.scope.unit ?? b.unit ?? null };
    }
    const d = Hospital.DEPARTMENTS.find((x) => x.id === b.department);
    return { level: d ? 4 : 2, building: b.building || (d ? d.building : null),
      department: b.department || null, unit: b.unit || (d && d.units[0] ? d.units[0].id : null) };
  }

  /* ---------- Danh sách + lọc (ADMIN > Users) ---------- */
  app.get("/api/admin/users", Auth.authRequired, requireManager, (req, res) => {
    const { q, role, department, building, status } = req.query;
    const items = UserStore.list({ q, role, department, building, status }).map((u) => UserStore.safeUser(u));
    res.json(ok({ total: items.length, items, banner: "DEMO ENVIRONMENT — NOT FOR PRODUCTION" }));
  });

  /* ---------- Tạo tài khoản → INVITED + token (DEMO INVITATION / SIMULATED) ---------- */
  app.post("/api/admin/users", Auth.authRequired, requireManager, idem(), (req, res) => {
    const b = req.body || {};
    const username = String(b.username || "").toLowerCase().trim();
    if (!b.fullName || !username) return err(res, 400, "missing required: fullName, username");
    if (!validUsername(username)) return err(res, 422, "username 3-40 ký tự [a-z0-9._-]");
    if (!b.role || !roleIds.has(b.role)) return err(res, 422, "role không hợp lệ");
    if (b.department && !deptIds.has(b.department)) return err(res, 422, "department không tồn tại");
    const merr = manageError(req.user, actorRow(req), b.role, b.department || null);
    if (merr) { audit("CREATE_USER", req.user.email, actorRole(req), "user", username, "denied:" + merr); return err(res, 403, "forbidden: " + merr); }
    if (UserStore.findByUsername(username)) return err(res, 409, "username đã tồn tại");
    const employeeId = b.employeeId || nextEmployeeId();
    if (!validEmployee(employeeId)) return err(res, 422, "employee ID không hợp lệ");
    if (UserStore.list().some((u) => u.employeeId === employeeId)) return err(res, 409, "employee ID đã tồn tại");
    const email = (b.email || `${username}@demo1.hospital.demo`).toLowerCase();
    if (UserStore.findByEmail(email)) return err(res, 409, "email đã tồn tại");
    const dept = Hospital.DEPARTMENTS.find((d) => d.id === b.department);
    const token = crypto.randomBytes(24).toString("hex");
    const now = stamp();
    const row = {
      id: `u-local-${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`,
      employee_id: employeeId, username, email, phone: b.phone || "",
      full_name: b.fullName, job_title: b.jobTitle || b.role,
      role: b.role, department: b.department || null,
      department_name: dept ? dept.name : (b.departmentName || ""),
      unit: b.unit || (dept && dept.units[0] ? dept.units[0].id : null),
      building: b.building || (dept ? dept.building : ""), floor: String(b.floor ?? (dept ? dept.floors[0] : "")),
      room: b.room || "", scope_json: JSON.stringify(buildScope(b)),
      supervisor: b.supervisor || (dept ? dept.head : "director.demo"),
      status: "INVITED", password_hash: "", invite_token: token,
      legacy_role: b.legacyRole || null, legacy_dept: b.legacyDept || null,
      specialty: b.specialty || null, seed: 0,
      created_by: req.user.email, created_at: now, updated_at: now, last_login: null,
    };
    UserStore.insertRow(row);
    const u = UserStore.findByUsername(username);
    auditRich({ action: "CREATE_USER", actor: req.user.email, role: actorRole(req), resource: "user",
      resourceId: username, result: "INVITED", after: { role: b.role, department: b.department },
      why: b.reason || "admin tạo tài khoản" });
    res.status(201).json(ok({ user: UserStore.safeUser(u), inviteToken: token,
      emailSimulated: true,
      note: "DEMO INVITATION / SIMULATED — email provider chưa cấu hình, Admin trao token trực tiếp. Không giả vờ đã gửi email thật." }));
  });

  /* ---------- Nhận invitation → đặt password → ACTIVE (public + rate-limit) ---------- */
  app.post("/api/admin/users/accept", rl(20, 60000), (req, res) => {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ success: false, data: null, error: "missing required: token, password", code: "BAD_REQUEST", requestId: req.id || null, timestamp: stamp() });
    if (String(password).length < 8) return res.status(422).json({ success: false, data: null, error: "password tối thiểu 8 ký tự", code: "UNPROCESSABLE", requestId: req.id || null, timestamp: stamp() });
    const raw = UserStore.findRaw("invite_token", token);
    if (!raw) return res.status(404).json({ success: false, data: null, error: "invitation không hợp lệ/đã dùng", code: "NOT_FOUND", requestId: req.id || null, timestamp: stamp() });
    UserStore.updateRow(raw.id, { password_hash: UserStore.hashPassword(password), invite_token: null, status: "ACTIVE" });
    const u = UserStore.findById(raw.id);
    auditRich({ action: "INVITE_ACCEPT", actor: u.email, role: u.role, resource: "user", resourceId: u.username, result: "ACTIVE" });
    res.json(ok({ user: UserStore.safeUser(u) }));
  });

  /* ---------- Chi tiết ---------- */
  app.get("/api/admin/users/:username", Auth.authRequired, requireManager, (req, res) => {
    const u = UserStore.findByUsername(req.params.username);
    if (!u) return err(res, 404, "user_not_found");
    const perms = Hospital.ROLES.some((r) => r.id === u.role) ? (Hospital.ROLE_PERMISSIONS[u.role] || []) : [];
    res.json(ok({ user: UserStore.safeUser(u), permissions: perms,
      invitePending: (() => { try { return !!UserStore.findRaw("username", u.username).invite_token; } catch { return false; } })() }));
  });

  /* ---------- Sửa / gán role / gán scope ---------- */
  app.patch("/api/admin/users/:username", Auth.authRequired, requireManager, (req, res) => {
    const u = UserStore.findByUsername(req.params.username);
    if (!u) return err(res, 404, "user_not_found");
    if (u.role === "SUPER_ADMIN" && actorRole(req) !== "SUPER_ADMIN") return err(res, 403, "forbidden: only SUPER_ADMIN manages SUPER_ADMIN");
    const b = req.body || {};
    const patch = {};
    for (const k of ["fullName", "phone", "jobTitle", "building", "floor", "room", "unit", "supervisor"]) {
      const col = { fullName: "full_name", phone: "phone", jobTitle: "job_title", building: "building", floor: "floor", room: "room", unit: "unit", supervisor: "supervisor" }[k];
      if (b[k] !== undefined) patch[col] = b[k];
    }
    if (b.role !== undefined) {
      if (!roleIds.has(b.role)) return err(res, 422, "role không hợp lệ");
      const merr = manageError(req.user, actorRow(req), b.role, b.department || u.department);
      if (merr) return err(res, 403, "forbidden: " + merr);
      if (b.role !== u.role) {
        auditRich({ action: "ASSIGN_ROLE", actor: req.user.email, role: actorRole(req), resource: "user",
          resourceId: u.username, result: "ok", before: { role: u.role }, after: { role: b.role }, why: b.reason || "" });
        patch.role = b.role;
      }
    }
    if (b.department !== undefined) {
      if (b.department && !deptIds.has(b.department)) return err(res, 422, "department không tồn tại");
      const merr = manageError(req.user, actorRow(req), b.role || u.role, b.department);
      if (merr) return err(res, 403, "forbidden: " + merr);
      if (b.department !== u.department) {
        const dept = Hospital.DEPARTMENTS.find((d) => d.id === b.department);
        auditRich({ action: "ASSIGN_SCOPE", actor: req.user.email, role: actorRole(req), resource: "user",
          resourceId: u.username, result: "ok",
          before: { department: u.department, building: u.building },
          after: { department: b.department, building: b.building || u.building }, why: b.reason || "" });
        patch.department = b.department;
        patch.department_name = dept ? dept.name : "";
        patch.building = b.building || (dept ? dept.building : u.building);
        patch.scope_json = JSON.stringify(buildScope({ ...b, department: b.department, building: patch.building, unit: b.unit || u.unit }));
      }
    }
    if (b.scope !== undefined) {
      patch.scope_json = JSON.stringify(buildScope({ ...b, department: b.department || u.department }));
      auditRich({ action: "ASSIGN_SCOPE", actor: req.user.email, role: actorRole(req), resource: "user",
        resourceId: u.username, result: "ok", after: b.scope, why: b.reason || "" });
    }
    if (!Object.keys(patch).length) return err(res, 400, "nothing to update");
    UserStore.updateRow(u.id, patch);
    audit("UPDATE_USER", req.user.email, actorRole(req), "user", u.username, "ok");
    res.json(ok({ user: UserStore.safeUser(UserStore.findByUsername(u.username)) }));
  });

  /* ---------- Trạng thái: SUSPEND / LOCK / DISABLE / REACTIVATE (không hard-delete) ---------- */
  app.post("/api/admin/users/:username/status", Auth.authRequired, requireManager, (req, res) => {
    const u = UserStore.findByUsername(req.params.username);
    if (!u) return err(res, 404, "user_not_found");
    const me = UserStore.findByEmail(req.user.email);
    if (me && me.username === u.username) return err(res, 400, "cannot change own status");
    if (u.role === "SUPER_ADMIN" && actorRole(req) !== "SUPER_ADMIN") return err(res, 403, "forbidden");
    const { status, reason = "" } = req.body || {};
    if (!["ACTIVE", "SUSPENDED", "LOCKED", "DISABLED"].includes(status)) return err(res, 422, "status must be ACTIVE|SUSPENDED|LOCKED|DISABLED");
    const before = { status: u.status };
    UserStore.updateRow(u.id, { status });
    const act = status === "SUSPENDED" ? "SUSPEND_USER" : status === "DISABLED" ? "DISABLE_USER" : "UPDATE_USER";
    auditRich({ action: act, actor: req.user.email, role: actorRole(req), resource: "user",
      resourceId: u.username, result: status, before, after: { status }, why: reason });
    res.json(ok({ user: UserStore.safeUser(UserStore.findByUsername(u.username)) }));
  });

  /* ---------- Reset password → token mới + PENDING (SIMULATED) ---------- */
  app.post("/api/admin/users/:username/reset-password", Auth.authRequired, requireManager, (req, res) => {
    const u = UserStore.findByUsername(req.params.username);
    if (!u) return err(res, 404, "user_not_found");
    const token = crypto.randomBytes(24).toString("hex");
    UserStore.updateRow(u.id, { invite_token: token, status: "PENDING" });
    auditRich({ action: "RESET_PASSWORD", actor: req.user.email, role: actorRole(req), resource: "user",
      resourceId: u.username, result: "PENDING" });
    res.json(ok({ username: u.username, inviteToken: token, emailSimulated: true,
      note: "DEMO / SIMULATED — user dùng token đặt password mới qua /api/admin/users/accept." }));
  });

  /* ---------- Audit của 1 user ---------- */
  app.get("/api/admin/users/:username/audit", Auth.authRequired, requireManager, (req, res) => {
    const u = UserStore.findByUsername(req.params.username);
    if (!u) return err(res, 404, "user_not_found");
    const items = auditTrail.filter((a) => a.actor === u.email || a.resourceId === u.username).slice(0, 50);
    res.json(ok({ total: items.length, items }));
  });

  /* ---------- Tóm tắt cho DIRECTOR CONSOLE ---------- */
  app.get("/api/admin/summary", Auth.authRequired, (req, res) => {
    const hr = req.user.hospitalRole;
    if (!["SUPER_ADMIN", "HOSPITAL_DIRECTOR", "DEPUTY_DIRECTOR", "HR_MANAGER", "IT_ADMIN"].includes(hr)
      && !["CEO", "ADMIN"].includes(req.user.role)) return err(res, 403, "forbidden");
    const all = UserStore.list();
    const byStatus = {}, byRole = {}, byBuilding = {};
    for (const u of all) {
      byStatus[u.status] = (byStatus[u.status] || 0) + 1;
      byRole[u.role] = (byRole[u.role] || 0) + 1;
      byBuilding[u.building || "?"] = (byBuilding[u.building || "?"] || 0) + 1;
    }
    res.json(ok({ total: all.length, seed: all.filter((u) => u.seed).length, created: all.filter((u) => !u.seed).length,
      byStatus, byRole, byBuilding,
      recent: all.slice(-5).reverse().map((u) => UserStore.safeUser(u)),
      database: UserStore.dbPath(), banner: "DEMO ENVIRONMENT — NOT FOR PRODUCTION" }));
  });
};

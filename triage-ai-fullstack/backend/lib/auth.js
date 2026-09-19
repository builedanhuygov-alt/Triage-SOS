/**
 * lib/auth — demo auth production-like (không hardcode secret production).
 * Token: base64url(payload).hmac-sha256, secret từ AUTH_SECRET (default demo-only).
 * KHÔNG dùng users thật — toàn bộ là tài khoản demo cho pitch.
 */
const crypto = require("crypto");

const SECRET = process.env.AUTH_SECRET || (process.env.NODE_ENV === "production" ? null : "demo-only-secret-change-in-production");
if (!SECRET) {
  console.error("[FATAL] AUTH_SECRET missing in production — refusing to start (no demo key fallback).");
  process.exit(1);
}

const USERS = [
  { id: "u-ceo", name: "Ban Giám đốc", email: "ceo@hospital.demo", password: "demo123", role: "CEO" },
  { id: "u-admin", name: "Điều phối Admin", email: "admin@hospital.demo", password: "demo123", role: "ADMIN" },
  { id: "u-doc-er", name: "BS. Cấp cứu", email: "doctor.er@hospital.demo", password: "demo123", role: "DOCTOR", dept: "er" },
  { id: "u-doc-cardio", name: "BS. Tim mạch", email: "doctor.cardio@hospital.demo", password: "demo123", role: "DOCTOR", dept: "cardio" },
  { id: "u-patient", name: "Nguyễn Văn A", email: "patient@hospital.demo", password: "demo123", role: "PATIENT", patientId: "P001", medicalId: "PT-0926-001" },
  { id: "u-patient-01", name: "Nguyễn Văn A Demo", email: "patient.demo.01@hospital.demo", password: "Demo@2026!", role: "PATIENT", patientId: "P001", medicalId: "PT-0926-001", demo: true },
  { id: "u-patient-02", name: "Trần Minh Demo", email: "patient.demo.02@hospital.demo", password: "Demo@2026!", role: "PATIENT", patientId: "P002", medicalId: "PT-0926-002", demo: true },
  { id: "u-patient-03", name: "Lê Gia Demo", email: "patient.demo.03@hospital.demo", password: "Demo@2026!", role: "PATIENT", patientId: "P003", medicalId: "PT-0926-003", demo: true },
  { id: "u-caregiver", name: "Trần Thị B (người nhà)", email: "caregiver@hospital.demo", password: "demo123", role: "CAREGIVER", linkedPatientId: "P001", demo: true },
  { id: "u-caregiver-01", name: "Nguyễn Chăm Sóc Demo", email: "caregiver.demo.01@hospital.demo", password: "Demo@2026!", role: "CAREGIVER", linkedPatientId: "P001", demo: true },
  { id: "u-caregiver-02", name: "Lê Gia Đình Demo", email: "caregiver.demo.02@hospital.demo", password: "Demo@2026!", role: "CAREGIVER", linkedPatientId: "P002", demo: true },
  { id: "u-caregiver-03", name: "Phạm Hỗ Trợ Demo", email: "caregiver.demo.03@hospital.demo", password: "Demo@2026!", role: "CAREGIVER", linkedPatientId: "P001", demo: true },
  { id: "u-nurse", name: "Điều dưỡng Lan", email: "nurse@hospital.demo", password: "demo123", role: "NURSE", dept: "er" },
];

// Nối 200+ tài khoản demo BVĐK TW DEMO1 (lib/hospital.js, DEMO/MOCK/SEEDED).
// Không đổi hành vi 7 tài khoản gốc. Hospital user có thêm:
//   hospitalRole (role mới), department/building/scope, status (ACTIVE/...).
let Hospital = null;
try {
  Hospital = require("./hospital.js");
  for (const h of Hospital.USERS) {
    if (!USERS.some((x) => x.email === h.email)) USERS.push(h);
  }
} catch (e) {
  console.warn("[auth] hospital seed not loaded:", e.message);
}

function sign(payloadB64) {
  return crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
}

function isHospitalRole(roleId) {
  return !!(Hospital && Hospital.ROLES.some((r) => r.id === roleId));
}

function issueToken(user) {
  const hospitalRole = isHospitalRole(user.role) ? user.role : null;
  const payload = Buffer.from(JSON.stringify({
    sub: user.id, email: user.email,
    // role legacy để API/RBAC cũ tiếp tục chạy (hospital user map qua legacyRole);
    // hospitalRole giữ role mới thật của hệ thống DEMO1.
    role: user.legacyRole || user.role,
    hospitalRole,
    dept: user.legacyDept || user.dept || user.department || null,
    department: user.department || null,
    building: user.building || null,
    scope: user.scope || null,
    patientId: user.patientId || user.linkedPatientId || null, iat: Date.now(),
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token) return null;
  const [payload, sig] = String(token).split(".");
  if (!payload || !sig) return null;
  try {
    if (sig !== sign(payload)) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function login(email, password) {
  const em = String(email || "").toLowerCase().trim();
  // 1) Persistent user store (SQLite) — source of truth: seed + admin-created, scrypt-hash.
  try {
    const Store = require("./userStore.js");
    Store.open();
    seedImportOnce();
    const su = Store.findByEmailOrUsername(em);
    if (su) {
      if (su.status !== "ACTIVE") {
        const map = { INVITED: "account_invited", PENDING: "account_pending", SUSPENDED: "account_suspended", LOCKED: "account_locked", DISABLED: "account_disabled", INACTIVE: "account_inactive" };
        return { error: map[su.status] || `account_${String(su.status).toLowerCase()}`, status: su.status };
      }
      const raw = Store.findRaw("id", su.id);
      if (raw && Store.verifyPassword(password, raw.password_hash)) {
        Store.updateRow(su.id, { last_login: new Date().toISOString() });
        const fresh = Store.findById(su.id);
        const user = Store.safeUser(fresh);
        if (isHospitalRole(user.role)) user.hospitalRole = user.role;
        return { token: issueToken(user), user };
      }
      return null;
    }
  } catch (e) {
    console.warn("[auth] userstore login fallback:", e.message);
  }
  // 2) Legacy static (7 tài khoản gốc + tương thích)
  const u = USERS.find((x) => x.email === em);
  // Hash trước rồi so sánh hằng thời gian (timingSafeEqual đòi cùng độ dài)
  const digest = (s) => crypto.createHash("sha256").update(String(s || "")).digest();
  const ok = u && crypto.timingSafeEqual(digest(u.password), digest(password));
  if (!ok) return null;
  // Hospital demo accounts: chặn trạng thái không ACTIVE (test bắt buộc)
  if (u.status && u.status !== "ACTIVE") return { error: `account_${u.status.toLowerCase()}`, status: u.status };
  const { password: _pw, ...safe } = u;
  if (isHospitalRole(u.role)) safe.hospitalRole = u.role;
  return { token: issueToken(u), user: safe };
}

// Import 250 seed 1 lần/process (INSERT OR IGNORE — nhanh, an toàn đa process).
let _seeded = false;
function seedImportOnce() {
  if (_seeded || !Hospital) return;
  const Store = require("./userStore.js");
  const r = Store.importSeed(Hospital.USERS, Hospital.DEMO_PASSWORD);
  _seeded = true;
  if (r.added) console.log(`[auth] userstore seed import: +${r.added} (total ${r.total})`);
}

// Express middleware
function authRequired(req, res, next) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  const claims = verifyToken(m && m[1]);
  if (!claims) return res.status(401).json({ success: false, data: null, error: "unauthorized", timestamp: new Date().toISOString() });
  req.user = claims;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    // Chấp nhận cả role legacy và hospitalRole mới (DEMO1 RBAC)
    const got = [req.user && req.user.role, req.user && req.user.hospitalRole].filter(Boolean);
    if (!req.user || !roles.some((r) => got.includes(r))) {
      return res.status(403).json({ success: false, data: null, error: "forbidden: insufficient role", timestamp: new Date().toISOString() });
    }
    next();
  };
}

module.exports = { USERS, login, verifyToken, issueToken, authRequired, requireRole, isHospitalRole };

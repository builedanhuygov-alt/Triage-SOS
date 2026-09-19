/**
 * Triage AI Command Center — Enterprise Backend (Express + Socket.io)
 * Chạy:  cd backend && npm install && npm start   (port 5000, PORT động cho Render)
 *
 * STATE MACHINE: PENDING_TRIAGE -> DEPARTMENT_ROUTED -> DOCTOR_ACCEPTED
 *   -> IN_TREATMENT -> REFERRAL_PENDING -> TRANSFERRED / COMPLETED
 * Tương thích ngược: trường legacy (severity critical/medium/low, notes string,
 *   referral {hospital{name,phone},reason}) vẫn giữ để dashboard/app cũ chạy.
 *
 * REST:
 *   GET  /api/dashboard        -> toàn trạng thái (stats, chart, patients)
 *   GET  /api/emergency/:id    -> chi tiết 1 ca (kèm auditLog)
 *   POST /api/emergency        -> tạo ca (ESI engine tự chấm + định tuyến)
 *   PUT  /api/emergency/:id    -> y lệnh {action, notes, disposition, hospital, reason}
 * SOCKET (client -> server):
 *   ACCEPT_PATIENT {emergencyId, doctor}   (kèm check RBAC khoa/CEO)
 *   REQUEST_UPWARD_REFERRAL {emergencyId, targetHospital, reason, doctorId}
 *   OVERRIDE_EMERGENCY {targetDept?, ...} (CEO only)
 * SOCKET (server -> client): NEW_EMERGENCY | EMERGENCY_UPDATED |
 *   UPDATE_RESOURCES (legacy) | CEO_ALERT | ACTION_DENIED
 */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const crypto = require("crypto");
const { Server } = require("socket.io");
// Enterprise libs (pure, unit-test được)
const Contracts = require("../shared/api-contracts.js");
const Auth = require("./lib/auth.js");
const AntiSabotage = require("./lib/antiSabotage.js");
const { assertTransition } = require("./lib/stateMachine.js");
const { PATIENT_TIMELINE, validTimelineState } = require("./lib/stateMachine.js");
const GPS = require("./lib/gps.js");
const Persistence = require("./lib/persistence.js");
const Hospital = require("./lib/hospital.js");
const Perms2 = require("./lib/permissions2.js");
const Bus = require("./lib/eventBus.js");
const Care = require("./lib/careStore.js");
const Ops = require("./lib/opsStore.js");

const PORT = process.env.PORT || 5000;
const ENV = process.env.NODE_ENV || "development";
const APP_VERSION = "1.5.0";
// DEMO DATA != PRODUCTION DATA: production không tự seed demo (trừ khi ALLOW_DEMO_SEED=1).
const DEMO_SEED = ENV !== "production" || process.env.ALLOW_DEMO_SEED === "1";
// AUTH SECRET: production FAIL FAST — không fallback demo key (§10).
const AUTH_SECRET = process.env.AUTH_SECRET;
if (ENV === "production" && !AUTH_SECRET) {
  console.error("[FATAL] AUTH_SECRET missing in production — refusing to start (no demo key fallback).");
  process.exit(1);
}
const app = express();
app.set("trust proxy", 1); // chạy sau reverse proxy (Render/VPS) — rate limit + IP đúng

// CORS allowlist (§12-13): production KHÔNG bao giờ "*".
// CORS_ORIGINS=a,b (env) | mặc định production = 2 web Vercel | dev = "*" (log rõ).
const PROD_DEFAULT_ORIGINS = ["https://triage-command-center.vercel.app", "https://triage-sos-app.vercel.app"];
const CORS_ORIGINS = ENV === "production"
  ? (process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean) : [...PROD_DEFAULT_ORIGINS])
  : (process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean) : ["*"]);
console.log(`[cors] configured: ${CORS_ORIGINS.length} origin(s) [${ENV}]`);
app.use(cors({ origin: CORS_ORIGINS.includes("*") ? "*" : CORS_ORIGINS, methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"] }));
app.use(express.json({ limit: "1mb" }));

// Security headers nhẹ, không phá frontend (§23 — không CSP chặn bundle).
app.use((_req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Frame-Options", "DENY");
  next();
});

/* requestId + server log (requestId/timestamp/route/method/user/status/error).
 * Không trả stack trace cho client. */
app.use((req, _res, next) => {
  req.id = crypto.randomUUID().slice(0, 8);
  next();
});
function slog(req, status, error = "") {
  const user = (req.user && req.user.email) || "-";
  console.log(`[api] ${new Date().toISOString()} ${req.id} ${req.method} ${req.path} user=${user} status=${status}${error ? ` error=${error}` : ""}`);
}
// Rate limit nhẹ chống brute-force (in-memory, DEMO): login 60/phút/IP, SOS 30/phút/IP.
const buckets = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const k = `${req.ip}:${req.path}`;
    const now = Date.now();
    const arr = (buckets.get(k) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      slog(req, 429, "rate_limited");
      return res.status(429).json({ success: false, data: null, error: "rate limited, thử lại sau", code: "RATE_LIMITED", requestId: req.id, timestamp: new Date().toISOString() });
    }
    arr.push(now);
    buckets.set(k, arr);
    next();
  };
}
// Idempotency-Key cho POST quan trọng (PAYMENT/SOS/APPOINTMENT/RX/ISSUE/NOTIF):
// cùng key -> trả đúng response lần đầu, không tạo dữ liệu trùng.
// Persistent SQLite (§33, restart không mất), fallback memory nếu DB lỗi.
const idemCache = new Map();
function idemStoreGet(key) {
  try {
    const Store = require("./lib/userStore.js");
    return Store.idemGet(key);
  } catch { return idemCache.get(key) || null; }
}
function idemStoreSet(key, status, body) {
  try {
    const Store = require("./lib/userStore.js");
    Store.idemSet(key, status, body);
  } catch {}
  idemCache.set(key, { status, body });
  if (idemCache.size > 500) idemCache.delete(idemCache.keys().next().value);
}
function idempotent() {
  return (req, res, next) => {
    const key = req.headers["idempotency-key"];
    if (!key || req.method !== "POST") return next();
    const prev = idemStoreGet(key) || idemCache.get(key);
    if (prev) {
      res.set("X-Idempotent-Replayed", "true");
      return res.status(prev.status).json({ ...prev.body, replayed: true });
    }
    const orig = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 300) idemStoreSet(key, res.statusCode, body);
      return orig(body);
    };
    next();
  };
}
// Artifact release (Excel tài khoản demo DEMO1 + báo cáo)
app.use("/release", express.static(require("path").join(__dirname, "..", "release")));

/* ================= ESI RULE ENGINE =================
 * Quét từ khóa tiếng Việt (không dấu) -> { esi 1-5, severity legacy, deptKey, deptVi }.
 * ESI 1 = nguy kịch tức thì -> ICU. ESI 2 = khẩn cao. ESI 3 = khẩn vừa.
 * ESI 4-5 = nhẹ, xử lý tại Cấp cứu.
 */
const norm = (s = "") =>
  String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
const has = (t, ...ks) => ks.some((k) => t.includes(norm(k)));

function calculateESIEngine(symptomText = "") {
  const t = norm(symptomText);
  // ESI 1 — ICU
  if (has(t, "ngung tim", "ngung tho", "hon me sau", "bat tinh", "shock nang", "coma"))
    return { esi: 1, severity: "critical", deptKey: "icu", deptVi: "Hồi sức tích cực" };
  // ESI 2 — chuyên khoa sâu
  if (has(t, "dau nguc", "that nguc", "nhoi mau", "dot quy tim", "te tay trai"))
    return { esi: 2, severity: "critical", deptKey: "cardio", deptVi: "Tim mạch" };
  if (has(t, "tngt", "chan thuong nang", "chay mau nhieu", "gay ho", "dap nat", "vet thuong sau"))
    return { esi: 2, severity: "critical", deptKey: "trauma", deptVi: "Chấn thương" };
  if (has(t, "kho tho nang", "spo2 thap", "tim tai", "suy ho hap"))
    return { esi: 2, severity: "critical", deptKey: "respiratory", deptVi: "Hô hấp" };
  if (has(t, "dot quy", "liet nua nguoi", "meo mieng", "co giat", "dong kinh"))
    return { esi: 2, severity: "critical", deptKey: "neuro", deptVi: "Thần kinh" };
  // ESI 2 — critical chung chưa rõ khoa -> Cấp cứu
  if (has(t, "ngat xiu", "chay mau", "gay", "tai nan", "kho tho", "dau nguc"))
    return { esi: 2, severity: "critical", deptKey: "er", deptVi: "Cấp cứu" };
  // ESI 3 — khẩn vừa
  if (has(t, "sot cao", "dau bung du doi", "non oe", "tieu chay nang", "ho keo dai", "dau dau du doi"))
    return { esi: 3, severity: "medium", deptKey: "er", deptVi: "Cấp cứu" };
  // ESI 4-5 — nhẹ
  return { esi: 5, severity: "low", deptKey: "er", deptVi: "Cấp cứu" };
}

// deptKey -> tên TV (đồng bộ với deptOf() phía dashboard)
const DEPT_VI = { er: "Cấp cứu", cardio: "Tim mạch", trauma: "Chấn thương", respiratory: "Hô hấp", neuro: "Thần kinh", icu: "Hồi sức tích cực" };

/* ================= AUDIT ================= */
const stamp = () => new Date().toISOString();
const log = (p, action, actor) => {
  p.auditLog.push({ action, actor: actor || "system", timestamp: stamp() });
};

/* ================= FACTORY: enterprise emergency object ================= */
let counter = 205;
function createEmergency(input = {}, actor = "Patient App") {
  const esi = calculateESIEngine(input.symptom || "");
  // Ưu tiên khoa app gửi lên; trống mới dùng engine định tuyến
  const deptVi = input.department || esi.deptVi;
  const patient = {
    id: `#BN-${counter++}`, // mã hiển thị (dashboard/app cũ dùng)
    uuid: crypto.randomUUID(), // id chuẩn enterprise
    patientName: input.patientName || "",
    patientId: input.patientId || "", // mã BNaster (P001...) nếu app gửi
    emState: "CREATED", // máy screening mới (status giữ cho dashboard cũ)
    screening: null, // {verdict, riskScore, reasons} sau khi qua AntiSabotage
    statusTimeline: [], // timeline doctor -> patient (realtime về mobile)
    symptom: input.symptom || "Chưa rõ triệu chứng",
    severity: input.severity || esi.severity, // legacy: critical|medium|low
    department: deptVi, // TV, tương thích deptOf() dashboard
    deptKey: esi.deptKey,
    esiLevel: esi.esi,
    status: "PENDING_TRIAGE", // chờ screening (POST/moderation đẩy tiếp)
    eta: input.eta || "5 phút",
    timestamp: stamp(),
    assignedDoctor: null,
    clinicalNotes: [], // chuẩn mới (mảng)
    notes: "", // legacy string (đồng bộ note mới nhất)
    referralData: null, // chuẩn mới
    referral: null, // legacy (đồng bộ)
    hr: input.hr ?? null,
    spo2: input.spo2 ?? null,
    aiInsight: input.aiInsight || "Ca mới từ app. Đo sinh tồn rồi phân luồng.",
    bloodType: input.bloodType || "",
    conditions: input.conditions || [],
    allergies: input.allergies || [],
    emergencyContact: input.emergencyContact || {},
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    priorityCode: input.priorityCode || "",
    source: input.source || "app",
    registration: input.registration || null,
    auditLog: [],
  };
  log(patient, "CREATED", actor);
  return patient;
}

/* ============ Screening + định tuyến (gọi ngay sau create) ============ */
function screenAndRoute(patient, input = {}) {
  patient.emState = "SCREENING";
  const v = AntiSabotage.screen({
    symptom: patient.symptom,
    deviceId: input.deviceId,
    contactPhone: patient.emergencyContact?.phone,
    patientName: patient.patientName,
    lat: patient.lat, lng: patient.lng,
  });
  patient.screening = v;
  if (v.verdict === "FLAGGED") {
    patient.emState = "FLAGGED";
    patient.status = "FLAGGED"; // vào moderation, KHÔNG báo động toàn viện
    log(patient, "FLAGGED", `AntiSabotage (risk ${v.riskScore})`);
  } else {
    patient.emState = "NORMAL";
    patient.status = "DEPARTMENT_ROUTED";
    log(patient, "DEPARTMENT_ROUTED", `ESI-Engine (ESI ${patient.esiLevel} -> ${patient.department})`);
    if (v.verdict === "SUSPICIOUS") log(patient, "NOTE_ADDED", `Suspicious: ${v.reasons.join("; ")}`);
  }
  return patient;
}

/* ============ Helpers dùng chung (envelope, audit toàn cục, notify) ============ */
const ok = (data) => ({ success: true, data, error: null, timestamp: stamp() });
// Error thống nhất (cộng thêm, KHÔNG vỡ envelope legacy {success,data,error}):
// {success:false, data:null, error:message, code, requestId, timestamp}. Không stack trace.
const CODE_OF = { 400: "BAD_REQUEST", 401: "UNAUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "CONFLICT", 422: "UNPROCESSABLE", 429: "RATE_LIMITED", 500: "INTERNAL" };
const err = (res, code, message) => {
  const req = res.req || {};
  if (req.id) slog(req, code, message);
  return res.status(code).json({ success: false, data: null, error: message, code: CODE_OF[code] || "ERROR", requestId: req.id || null, timestamp: new Date().toISOString() });
};

const auditTrail = [];
function audit(action, actor, role, resource, resourceId, result = "ok") {
  auditTrail.unshift({ action, actor, role, resource, resourceId, result, timestamp: stamp() });
  if (auditTrail.length > 500) auditTrail.pop();
}
/* Audit giàu §XXXIX: WHO/WHAT/WHEN/WHERE/BEFORE/AFTER/WHY. Không cho xóa (không có API xóa). */
function auditRich(e = {}) {
  auditTrail.unshift({
    action: e.action, actor: e.actor || "system", role: e.role || "SYSTEM",
    resource: e.resource || "", resourceId: e.resourceId || "", result: e.result || "ok",
    where: e.where || "", before: e.before ?? null, after: e.after ?? null, why: e.why || "",
    timestamp: stamp(),
  });
  if (auditTrail.length > 500) auditTrail.pop();
}
/* Chuẩn đoán anomaly: ghi nhận mọi lần login (thành/bại) để phát hiện bất thường. */
function recordLoginAttempt(email, okFlag) {
  Ops.stores.loginAttempts.push({ email: String(email || "?"), ok: !!okFlag, at: stamp() });
  if (Ops.stores.loginAttempts.length > 200) Ops.stores.loginAttempts.splice(0, Ops.stores.loginAttempts.length - 200);
  if (!okFlag) maybeAnomaly("REPEATED_LOGIN_FAILURE", String(email || "?"), `Đăng nhập thất bại: ${email}`);
}
function maybeAnomaly(signal, subject, detail) {
  const recent = Ops.stores.loginAttempts.filter((x) => x.email === subject && !x.ok);
  const count = signal === "REPEATED_LOGIN_FAILURE" ? recent.length : 1;
  if (signal === "REPEATED_LOGIN_FAILURE" && count < 3) return null;
  if (Ops.stores.anomalyCases.some((c) => c.subject === subject && c.state === "OPEN" && c.signals.includes(signal))) return null;
  const c = { id: `ANO-${String(Ops.counters.ano++).padStart(4, "0")}`, signals: [signal],
    subject, detail: detail || "", severity: "WARNING", state: "OPEN",
    createdAt: stamp(), reviewedBy: null, note: "", isDemo: true };
  Ops.stores.anomalyCases.unshift(c);
  Bus.emit("ANOMALY_DETECTED", { actor: "system", role: "SYSTEM", resource: "anomaly", resourceId: c.id,
    title: "Anomaly detected (cần xác minh)", body: `${signal}: ${subject}`, category: "Security" });
  return c;
}

let notifCounter = 1;
function notify(toUserId, category, title, body, extra = {}) {
  // Gắn dept từ ca liên quan để lọc RBAC phía người nhận (doctor/nurse chỉ thấy khoa mình)
  const em = extra.emergencyId ? db.patients.find((p) => p.id === extra.emergencyId) : null;
  const n = { id: `N${notifCounter++}`, toUserId, patientId: extra.patientId || null,
    emergencyId: extra.emergencyId || null, dept: em ? em.deptKey : (extra.dept || null),
    category, title, body, read: false, at: stamp() };
  db.notifications.unshift(n);
  io.emit("NOTIFICATION_CREATED", n);
  return n;
}

/* ================= Mock Database (in-memory) ================= */
const db = {
  stats: {
    icu: { free: 6, total: 10 },
    ventilators: { free: 3, total: 5 },
    blood: 100,
    waiting: 15,
  },
  chart: [
    { time: "-12h", actual: 18, forecast: null },
    { time: "-10h", actual: 22, forecast: null },
    { time: "-8h", actual: 26, forecast: null },
    { time: "-6h", actual: 24, forecast: null },
    { time: "-4h", actual: 31, forecast: null },
    { time: "-2h", actual: 35, forecast: null },
    { time: "Now", actual: 38, forecast: 38 },
    { time: "+1h", actual: null, forecast: 41 },
    { time: "+2h", actual: null, forecast: 44 },
    { time: "+3h", actual: null, forecast: 47 },
    { time: "+4h", actual: null, forecast: 51 },
    { time: "+5h", actual: null, forecast: 54 },
    { time: "+6h", actual: null, forecast: 57 },
  ],
  patients: [],
  appointments: [], // {id, ...}
  medications: [], // {id, ...}
  notifications: [],
  beds: [], // {id, ward, building, floor, room, status, patientId}
  grants: [], // caregiver grants {id, caregiverId, patientId, scopes[], expiresAt, by}
  labs: [], // {id, patientId, emergencyId, kind: LAB|IMAGING, test, status, orderedBy, performedBy, result, createdAt, completedAt}
  patientProfiles: [], // DEMO patient-owned profile and medical ID data
  billing: [], // DEMO billing statements; no real payment gateway
};

/* ============ Danh mục demo (DEMO DATA) ============ */
const META = {
  departments: [
    { id: "er", code: "ER", name: "Khoa Cấp cứu", specialty: "Emergency", floor: 1, building: "A", headDoctor: "BS. Cấp cứu", status: "active", capacity: 12 },
    { id: "cardio", code: "CARDIO", name: "Khoa Tim mạch", specialty: "Cardiology", floor: 3, building: "A", headDoctor: "BS. Tim mạch", status: "active", capacity: 8 },
    { id: "trauma", code: "TRAUMA", name: "Khoa Chấn thương", specialty: "Orthopedic & Trauma", floor: 2, building: "B", headDoctor: "BS. Chấn thương", status: "active", capacity: 10 },
    { id: "respiratory", code: "RESP", name: "Khoa Hô hấp", specialty: "Respiratory", floor: 4, building: "A", headDoctor: "BS. Hô hấp", status: "active", capacity: 10 },
    { id: "neuro", code: "NEURO", name: "Khoa Thần kinh", specialty: "Neurology", floor: 5, building: "A", headDoctor: "BS. Thần kinh", status: "active", capacity: 6 },
    { id: "icu", code: "ICU", name: "Hồi sức tích cực", specialty: "Intensive Care", floor: 6, building: "A", headDoctor: "BS. Hồi sức", status: "active", capacity: 10 },
    { id: "peds", code: "PEDS", name: "Khoa Nhi", specialty: "Pediatrics", floor: 2, building: "C", headDoctor: "BS. Nhi", status: "active", capacity: 10 },
    { id: "surgery", code: "SURG", name: "Khoa Ngoại", specialty: "Surgery", floor: 3, building: "B", headDoctor: "BS. Ngoại", status: "active", capacity: 12 },
  ],
  doctors: [
    { doctorId: "D001", name: "BS. Cấp cứu", specialty: "Emergency", department: "er", licenseNumber: "LIC-ER-001", phone: "0901000001", email: "doctor.er@hospital.demo", status: "AVAILABLE", experience: 10 },
    { doctorId: "D002", name: "BS. Tim mạch", specialty: "Cardiology", department: "cardio", licenseNumber: "LIC-CD-002", phone: "0901000002", email: "doctor.cardio@hospital.demo", status: "BUSY", experience: 12 },
    { doctorId: "D003", name: "BS. Chấn thương", specialty: "Trauma", department: "trauma", licenseNumber: "LIC-TR-003", phone: "0901000003", email: "doctor.trauma@hospital.demo", status: "AVAILABLE", experience: 8 },
    { doctorId: "D004", name: "BS. Hô hấp", specialty: "Respiratory", department: "respiratory", licenseNumber: "LIC-RS-004", phone: "0901000004", email: "doctor.resp@hospital.demo", status: "ON_CALL", experience: 9 },
    { doctorId: "D005", name: "BS. Thần kinh", specialty: "Neurology", department: "neuro", licenseNumber: "LIC-NR-005", phone: "0901000005", email: "doctor.neuro@hospital.demo", status: "AVAILABLE", experience: 11 },
    { doctorId: "D006", name: "BS. Hồi sức", specialty: "Intensive Care", department: "icu", licenseNumber: "LIC-IC-006", phone: "0901000006", email: "doctor.icu@hospital.demo", status: "BUSY", experience: 14 },
    { doctorId: "D007", name: "BS. Nhi", specialty: "Pediatrics", department: "peds", licenseNumber: "LIC-PD-007", phone: "0901000007", email: "doctor.peds@hospital.demo", status: "AVAILABLE", experience: 7 },
    { doctorId: "D008", name: "BS. Ngoại", specialty: "Surgery", department: "surgery", licenseNumber: "LIC-SG-008", phone: "0901000008", email: "doctor.surg@hospital.demo", status: "OFFLINE", experience: 13 },
  ],
  ambulances: [
    { vehicleId: "AMB-01", driver: "Nguyễn Tài", team: "Kíp A", location: "Q.1", status: "AVAILABLE", assignedEmergency: null, eta: null },
    { vehicleId: "AMB-02", driver: "Trần Lái", team: "Kíp B", location: "Q.5", status: "AVAILABLE", assignedEmergency: null, eta: null },
    { vehicleId: "AMB-03", driver: "Lê Tốc", team: "Kíp C", location: "Q.10", status: "MAINTENANCE", assignedEmergency: null, eta: null },
  ],
};

// DEMO DATA — seed tập trung để reset được (POST /api/admin/reset)
// Seed qua factory + screening (triệu chứng sạch nên ra NORMAL)
let apptCounter = 3, medCounter = 3, grantCounter = 2, labCounter = 1;
function seedDemo() {
counter = 205; // ID deterministic sau mỗi reset (#BN-205/206...)
db.patients.push(
  screenAndRoute(createEmergency(
    { patientId: "P001", patientName: "Nguyễn Văn A", symptom: "Đau ngực trái lan vai, khó thở", eta: "4 phút", severity: "critical", department: "Tim mạch", hr: 128, spo2: 89,
      aiInsight: "Nguy cơ nhồi máu cơ tim cao. Chuẩn bị ECG + báo Đội Tim mạch." },
    "seed"
  )),
  screenAndRoute(createEmergency(
    { patientId: "P023", patientName: "Trần Thị B", symptom: "TNGT — chấn thương sọ não", eta: "9 phút", severity: "critical", department: "Chấn thương", hr: 142, spo2: 91,
      aiInsight: "Shock mất máu. Giữ 2 đơn vị máu O, chuẩn bị phòng mổ." },
    "seed"
  ))
);

// Seed lịch hẹn + thuốc demo (đồng bộ mobile qua socket khi bác sĩ tạo mới)
apptCounter = 3;
db.appointments.push(
  { id: "A001", patientId: "#BN-205", doctorId: "D002", departmentId: "cardio", type: "FOLLOW_UP", date: "2026-10-02", time: "14:30", location: "Phòng khám 03", note: "Tái khám sau 2 tuần", status: "SCHEDULED" },
  { id: "A002", patientId: "#BN-206", doctorId: "D003", departmentId: "trauma", type: "IMAGING", date: "2026-09-20", time: "09:00", location: "X-quang 01", note: "Chụp CT sọ não", status: "SCHEDULED" }
);
medCounter = 3;
db.medications.push(
  { id: "M001", patientId: "#BN-205", name: "Aspirin", dosage: "100mg", schedule: "1 viên/ngày", instructions: "Sau ăn sáng", status: "active" },
  { id: "M002", patientId: "#BN-205", name: "Paracetamol", dosage: "500mg", schedule: "2 lần/ngày", instructions: "Sau ăn 07:30 / 19:30", status: "active" }
);
  db.appointments.push(
    { id: "A003", patientId: "P002", doctorId: "D001", departmentId: "er", type: "CONSULTATION", date: "2026-10-05", time: "08:30", location: "Phòng khám B-101", note: "Khám tổng quát demo", status: "CONFIRMED" },
    { id: "A004", patientId: "P003", doctorId: "D002", departmentId: "cardio", type: "FOLLOW_UP", date: "2026-10-07", time: "10:00", location: "Phòng khám C-302", note: "Theo dõi tim mạch demo", status: "SCHEDULED" }
  );
  db.medications.push({ id: "M003", patientId: "P002", name: "Amlodipin", dosage: "5mg", schedule: "1 lần/ngày", instructions: "08:00 sau ăn", status: "active" });
  db.labs.push(
    { id: "L001", patientId: "P001", kind: "LAB", test: "Công thức máu", status: "RELEASED", result: "WBC 7.2", unit: "10^9/L", referenceRange: "4.0-10.0", abnormal: false, orderedBy: "doctor.cardio@hospital.demo", performedBy: "KTV Demo", createdAt: stamp(), completedAt: stamp() },
    { id: "L002", patientId: "P002", kind: "IMAGING", test: "X-Ray ngực", status: "REVIEWED", result: "Radiology report demo: không có kết luận tự động.", unit: "", referenceRange: "Bác sĩ CĐHA xem xét", abnormal: false, orderedBy: "doctor.er@hospital.demo", performedBy: "KTV Demo", createdAt: stamp(), completedAt: stamp() }
  );
  db.patientProfiles.push(
    { patientId: "P001", medicalId: "PT-0926-001", fullName: "Nguyễn Văn A", dateOfBirth: "1990-04-12", contact: "0900000001", emergencyContact: "Trần Thị B — 0900000002", insurance: "BHYT-DEMO-001", bloodType: "O+", allergies: ["Chưa ghi nhận"], chronicConditions: [], status: "ACTIVE" },
    { patientId: "P002", medicalId: "PT-0926-002", fullName: "Trần Minh Demo", dateOfBirth: "1988-08-20", contact: "0900000003", emergencyContact: "Nguyễn Chăm Sóc Demo", insurance: "BHYT-DEMO-002", bloodType: "A+", allergies: ["Chưa ghi nhận"], chronicConditions: ["Tăng huyết áp (demo)"], status: "ACTIVE" },
    { patientId: "P003", medicalId: "PT-0926-003", fullName: "Lê Gia Demo", dateOfBirth: "1979-02-14", contact: "0900000004", emergencyContact: "Không cung cấp", insurance: "BHYT-DEMO-003", bloodType: "B+", allergies: [], chronicConditions: [], status: "ACTIVE" },
    { patientId: "P004", medicalId: "PT-0926-004", fullName: "Phạm An Demo", dateOfBirth: "2001-11-02", contact: "0900000005", emergencyContact: "Không cung cấp", insurance: "BHYT-DEMO-004", bloodType: "Chưa cung cấp", allergies: [], chronicConditions: [], status: "ACTIVE" },
    { patientId: "P005", medicalId: "PT-0926-005", fullName: "Võ Khang Demo", dateOfBirth: "1968-06-30", contact: "0900000006", emergencyContact: "Không cung cấp", insurance: "BHYT-DEMO-005", bloodType: "Chưa cung cấp", allergies: [], chronicConditions: [], status: "ACTIVE" }
  );
  db.billing.push(
    { id: "B001", patientId: "P001", service: "Tái khám Tim mạch", date: "2026-10-02", amount: 250000, insurance: "BHYT-DEMO-001", status: "PENDING", demo: true },
    { id: "B002", patientId: "P002", service: "Khám tổng quát", date: "2026-10-05", amount: 180000, insurance: "BHYT-DEMO-002", status: "PROCESSING", demo: true }
  );
  // Grant demo: granular caregiver access, never implicit patient-wide access.
  db.grants.push(
    { id: "G001", caregiverId: "u-caregiver", patientId: "P001", scopes: ["MEDICATION", "APPOINTMENT", "EMERGENCY", "MEDICAL_RECORD", "LAB", "IMAGING"], expiresAt: null, by: "P001" },
    { id: "G002", caregiverId: "u-caregiver-01", patientId: "P001", scopes: ["APPOINTMENT", "MEDICATION", "EMERGENCY", "LAB"], expiresAt: null, by: "P001" },
    { id: "G003", caregiverId: "u-caregiver-02", patientId: "P002", scopes: ["APPOINTMENT", "MEDICATION", "EMERGENCY"], expiresAt: null, by: "P002" },
    { id: "G004", caregiverId: "u-caregiver-03", patientId: "P001", scopes: ["APPOINTMENT", "EMERGENCY"], expiresAt: null, by: "P001" }
  );
  // 100 giường demo: [ward, count, building, floor]
  [["ICU", 10, "A", 6], ["ER", 12, "A", 1], ["CARDIO", 8, "A", 3], ["RESP", 10, "A", 4],
   ["NEURO", 6, "A", 5], ["SURG", 12, "B", 3], ["PEDS", 10, "C", 2], ["OB", 8, "C", 3], ["GEN", 24, "B", 4]
  ].forEach(([ward, n, building, floor]) => {
    for (let i = 1; i <= n; i++) {
      db.beds.push({ id: `${ward}-${String(i).padStart(2, "0")}`, ward, building, floor,
        room: `${floor}0${(i % 4) + 1}`, status: i % 3 === 0 ? "OCCUPIED" : "AVAILABLE", patientId: null });
    }
  });
} // end seedDemo

// Migrate an older persisted snapshot without duplicating fresh seed data.
function seedPatientExtensions() {
  if (db.patientProfiles.length) return;
  db.patientProfiles.push(
    { patientId: "P001", medicalId: "PT-0926-001", fullName: "Nguyễn Văn A", dateOfBirth: "1990-04-12", contact: "0900000001", emergencyContact: "Trần Thị B — 0900000002", insurance: "BHYT-DEMO-001", bloodType: "O+", allergies: ["Chưa ghi nhận"], chronicConditions: [], status: "ACTIVE" },
    { patientId: "P002", medicalId: "PT-0926-002", fullName: "Trần Minh Demo", dateOfBirth: "1988-08-20", contact: "0900000003", emergencyContact: "Nguyễn Chăm Sóc Demo", insurance: "BHYT-DEMO-002", bloodType: "A+", allergies: ["Chưa ghi nhận"], chronicConditions: ["Tăng huyết áp (demo)"], status: "ACTIVE" },
    { patientId: "P003", medicalId: "PT-0926-003", fullName: "Lê Gia Demo", dateOfBirth: "1979-02-14", contact: "0900000004", emergencyContact: "Không cung cấp", insurance: "BHYT-DEMO-003", bloodType: "B+", allergies: [], chronicConditions: [], status: "ACTIVE" },
    { patientId: "P004", medicalId: "PT-0926-004", fullName: "Phạm An Demo", dateOfBirth: "2001-11-02", contact: "0900000005", emergencyContact: "Không cung cấp", insurance: "BHYT-DEMO-004", bloodType: "Chưa cung cấp", allergies: [], chronicConditions: [], status: "ACTIVE" },
    { patientId: "P005", medicalId: "PT-0926-005", fullName: "Võ Khang Demo", dateOfBirth: "1968-06-30", contact: "0900000006", emergencyContact: "Không cung cấp", insurance: "BHYT-DEMO-005", bloodType: "Chưa cung cấp", allergies: [], chronicConditions: [], status: "ACTIVE" }
  );
  if (!db.appointments.some((a) => a.id === "A003")) db.appointments.push(
    { id: "A003", patientId: "P002", doctorId: "D001", departmentId: "er", type: "CONSULTATION", date: "2026-10-05", time: "08:30", location: "Phòng khám B-101", note: "Khám tổng quát demo", status: "CONFIRMED" },
    { id: "A004", patientId: "P003", doctorId: "D002", departmentId: "cardio", type: "FOLLOW_UP", date: "2026-10-07", time: "10:00", location: "Phòng khám C-302", note: "Theo dõi tim mạch demo", status: "SCHEDULED" }
  );
  if (!db.medications.some((m) => m.id === "M003")) db.medications.push({ id: "M003", patientId: "P002", name: "Amlodipin", dosage: "5mg", schedule: "1 lần/ngày", instructions: "08:00 sau ăn", status: "active" });
  if (!db.labs.some((l) => l.id === "L001")) db.labs.push(
    { id: "L001", patientId: "P001", kind: "LAB", test: "Công thức máu", status: "RELEASED", result: "WBC 7.2", unit: "10^9/L", referenceRange: "4.0-10.0", abnormal: false, orderedBy: "doctor.cardio@hospital.demo", performedBy: "KTV Demo", createdAt: stamp(), completedAt: stamp() },
    { id: "L002", patientId: "P002", kind: "IMAGING", test: "X-Ray ngực", status: "REVIEWED", result: "Radiology report demo: không có kết luận tự động.", unit: "", referenceRange: "Bác sĩ CĐHA xem xét", abnormal: false, orderedBy: "doctor.er@hospital.demo", performedBy: "KTV Demo", createdAt: stamp(), completedAt: stamp() }
  );
  if (!db.billing.length) db.billing.push(
    { id: "B001", patientId: "P001", service: "Tái khám Tim mạch", date: "2026-10-02", amount: 250000, insurance: "BHYT-DEMO-001", status: "PENDING", demo: true },
    { id: "B002", patientId: "P002", service: "Khám tổng quát", date: "2026-10-05", amount: 180000, insurance: "BHYT-DEMO-002", status: "PROCESSING", demo: true }
  );
  if (!db.grants.some((g) => g.id === "G002")) db.grants.push(
    { id: "G002", caregiverId: "u-caregiver-01", patientId: "P001", scopes: ["APPOINTMENT", "MEDICATION", "EMERGENCY", "LAB"], expiresAt: null, by: "P001" },
    { id: "G003", caregiverId: "u-caregiver-02", patientId: "P002", scopes: ["APPOINTMENT", "MEDICATION", "EMERGENCY"], expiresAt: null, by: "P002" },
    { id: "G004", caregiverId: "u-caregiver-03", patientId: "P001", scopes: ["APPOINTMENT", "EMERGENCY"], expiresAt: null, by: "P001" }
  );
}

/* ============ Persistence: snapshot JSON + boot restore ============ */
function persist() {
  Persistence.save({
    patients: db.patients, appointments: db.appointments, medications: db.medications,
    notifications: db.notifications, beds: db.beds, grants: db.grants, labs: db.labs,
    patientProfiles: db.patientProfiles, billing: db.billing, auditTrail,
    ...Care.snapshot(), ...Ops.snapshot(),
    counters: { counter, apptCounter, medCounter, notifCounter, grantCounter, labCounter },
  });
}
(function boot() {
  const snap = Persistence.load();
  if (snap && Array.isArray(snap.patients)) {
    db.patients.push(...snap.patients);
    db.appointments.push(...(snap.appointments || []));
    db.medications.push(...(snap.medications || []));
    db.notifications.push(...(snap.notifications || []));
    if (Array.isArray(snap.beds) && snap.beds.length) db.beds.push(...snap.beds);
    db.grants.push(...(snap.grants || []));
    db.labs.push(...(snap.labs || []));
    db.patientProfiles.push(...(snap.patientProfiles || []));
    db.billing.push(...(snap.billing || []));
    Care.restore(snap); Ops.restore(snap);
    auditTrail.push(...(snap.auditTrail || []).slice(0, 500));
    if (snap.counters) {
      counter = snap.counters.counter ?? counter;
      apptCounter = snap.counters.apptCounter ?? apptCounter;
      medCounter = snap.counters.medCounter ?? medCounter;
      notifCounter = snap.counters.notifCounter ?? notifCounter;
      grantCounter = snap.counters.grantCounter ?? grantCounter;
      labCounter = snap.counters.labCounter ?? labCounter;
    }
    console.log(`[db] restored snapshot (${snap.savedAt}, ${db.patients.length} emergencies)`);
  } else {
    if (DEMO_SEED) seedDemo();
    else console.log("[db] production mode: DEMO seed OFF (DEMO DATA != PRODUCTION DATA)");
  }
  if (DEMO_SEED) seedPatientExtensions();
  if (DEMO_SEED && (!snap || !Array.isArray(snap.encounters))) Care.seedCare();
  if (DEMO_SEED && (!snap || !Array.isArray(snap.resources))) Ops.seedOps();
})();
const persistTimer = setInterval(persist, 15000);
if (persistTimer.unref) persistTimer.unref();
process.on("SIGINT", () => { console.log("[backend] shutdown: persisting snapshot"); persist(); process.exit(0); });

/* ================= REST API ================= */
const SERVICE = "hospital-backend";
app.get("/api/health", (_req, res) => res.json({
  status: "ok", service: SERVICE, version: APP_VERSION,
  environment: ENV === "production" ? "production" : "staging/demo",
  demoSeed: ENV === "production" && process.env.ALLOW_DEMO_SEED !== "1" ? "off" : "on",
  timestamp: new Date().toISOString(),
}));
// Dependencies: chỉ READY khi kết nối thật; adapter demo trả SIMULATED (không giả CONNECTED).
app.get("/api/health/dependencies", (_req, res) => res.json({
  status: "ok",
  storage: "READY", // snapshot JSON local (DEMO persistence, không phải DB production)
  eventBus: Bus && Bus.EVENT_TYPES ? "READY" : "UNAVAILABLE",
  notification: "READY", // realtime socket + in-app
  paymentGateway: "SIMULATED", // QR/biên nhận nội bộ, chưa gateway thật
  bhyt: "SIMULATED", // ADAPTER READY, xác minh thủ công
  map: "SIMULATED", // ADAPTER READY, ETA minh họa
  timestamp: new Date().toISOString(),
}));

app.get("/api/dashboard", (_req, res) => {
  res.json({ stats: db.stats, chart: db.chart, patients: db.patients });
});

app.get("/api/emergency/:id", (req, res) => {
  const p = db.patients.find((x) => x.id === req.params.id || x.uuid === req.params.id);
  if (!p) return res.status(404).json({ error: "patient_not_found" });
  res.json(p);
});

// App bệnh nhân / chat-agent / widget POST ca mới.
// Luồng: CREATED -> SCREENING -> NORMAL (báo động toàn viện) | FLAGGED (chờ duyệt, KHÔNG báo động)
app.post("/api/emergency", (req, res) => {
  const body = req.body || {};
  const actor = body.source === "widget" ? "SOS Widget" : body.source === "chat-agent" ? "AI Chat Agent" : "Patient App";
  const patient = createEmergency(body, actor);
  db.patients.unshift(patient);
  screenAndRoute(patient, body);
  audit("CREATE_EMERGENCY", actor, "PATIENT", "emergency", patient.id, patient.emState);
  if (patient.emState === "FLAGGED") {
    io.emit("EMERGENCY_FLAGGED", patient);
    notify(null, "Security", "SOS cần kiểm duyệt",
      `${patient.id} risk ${patient.screening.riskScore}: ${patient.screening.reasons.join("; ")}`, { emergencyId: patient.id });
    audit("FLAG_EMERGENCY", "AntiSabotage", "SYSTEM", "emergency", patient.id, `risk=${patient.screening.riskScore}`);
  } else {
    io.emit("EMERGENCY_CREATED", patient);
    io.emit("NEW_EMERGENCY", patient); // legacy cho dashboard cũ
  }
  persist();
  res.status(201).json(patient);
});

// Bác sĩ y lệnh: accept | note | startTreatment | disposition | refer
app.put("/api/emergency/:id", (req, res) => {
  const p = db.patients.find((x) => x.id === req.params.id || x.uuid === req.params.id);
  if (!p) return res.status(404).json({ error: "patient_not_found" });
  const actor = req.body?.doctorId || req.body?.actor || "doctor";
  const { action = "note", notes, disposition, hospital, reason } = req.body || {};

  if (typeof notes === "string" && notes.trim()) {
    const entry = { text: notes.slice(0, 500), by: actor, at: stamp() };
    p.clinicalNotes.push(entry);
    p.notes = entry.text; // đồng bộ legacy
    log(p, "NOTE_ADDED", actor);
  }
  if (action === "accept") {
    p.status = "DOCTOR_ACCEPTED";
    p.assignedDoctor = actor;
    db.stats.icu.free = Math.max(0, db.stats.icu.free - 1);
    log(p, "DOCTOR_ACCEPTED", actor);
  }
  if (action === "startTreatment") {
    p.status = "IN_TREATMENT";
    log(p, "IN_TREATMENT", actor);
  }
  if (action === "refer") {
    p.status = "REFERRAL_PENDING";
    p.referralData = { hospital: hospital || {}, reason: reason || "", by: actor, at: stamp() };
    p.referral = { hospital: hospital || {}, reason: reason || "" }; // legacy
    log(p, "REFERRAL_PENDING", actor);
  }
  if (action === "referralAccept") {
    // Viện tuyến trên tiếp nhận -> TRANSFERRED + gán xe + rời feed
    p.status = "TRANSFERRED";
    p.emState = "TRANSFERRED";
    if (p.referralData) { p.referralData.acceptedAt = stamp(); p.referralData.acceptedBy = actor; }
    const amb = META.ambulances.find((a) => a.status === "AVAILABLE");
    if (amb) { amb.status = "DISPATCHED"; amb.assignedEmergency = p.id; }
    log(p, "TRANSFERRED", actor);
    audit("REFERRAL_ACCEPT", actor, "DOCTOR", "emergency", p.id, "ok");
    io.emit("REFERRAL_UPDATED", p);
    db.patients.splice(db.patients.findIndex((x) => x.id === p.id), 1);
  }
  if (action === "disposition" && ["discharged", "transferred", "icu"].includes(disposition)) {
    // Map legacy disposition -> canonical
    p.status = disposition === "discharged" ? "COMPLETED" : "TRANSFERRED";
    p.closedAt = stamp();
    log(p, p.status, actor);
    db.patients.splice(db.patients.findIndex((x) => x.id === p.id), 1);
  }
  // Đồng bộ máy screening + audit toàn cục (giữ nguyên status chăm sóc cho dashboard cũ)
  if (action === "accept") p.emState = "DOCTOR_ACCEPTED";
  if (action === "startTreatment") p.emState = "IN_TREATMENT";
  if (action === "refer") p.emState = "REFERRAL_PENDING";
  if (action === "disposition") p.emState = p.status; // TRANSFERRED | COMPLETED
  audit(`EMERGENCY_${action.toUpperCase()}`, actor, "DOCTOR", "emergency", p.id, p.status);
  persist();
  io.emit("EMERGENCY_UPDATED", p); // chuẩn mới toàn hệ thống + app BN
  io.emit("UPDATE_RESOURCES", { stats: db.stats, acceptedId: action === "accept" ? p.id : undefined }); // legacy
  if (p.status === "REFERRAL_PENDING") {
    io.emit("CEO_ALERT", { type: "REFERRAL", id: p.id, hospital: p.referralData?.hospital?.name, at: stamp() });
  }
  res.json(p);
});

/* ================= AUTH (demo, production-like) ================= */
app.post("/api/auth/login", rateLimit(120, 60000), (req, res) => {
  let { email, password, username } = req.body || {};
  // Demo portal đăng nhập bằng username: suy ra email demo DEMO1
  if (!email && username) {
    const un = String(username).toLowerCase().trim();
    email = un.includes("@") ? un : `${un}@demo1.hospital.demo`;
  }
  const r = Auth.login(email, password);
  if (!r) {
    audit("LOGIN", String(email || "?"), "?", "auth", "-", "failed");
    recordLoginAttempt(email, false);
    return err(res, 401, "invalid credentials (thử ceo@hospital.demo / demo123 hoặc tài khoản DEMO1 / Demo@2026!)");
  }
  if (r.error) {
    audit("LOGIN", String(email || "?"), "?", "auth", "-", r.error);
    recordLoginAttempt(email, false);
    return err(res, 403, r.error);
  }
  audit("LOGIN", r.user.email, r.user.hospitalRole || r.user.role, "auth", r.user.id, "ok");
  recordLoginAttempt(email, true);
  res.json(ok(r));
});
app.post("/api/auth/logout", Auth.authRequired, (req, res) => {
  audit("LOGOUT", req.user.email, req.user.role, "auth", req.user.sub, "ok");
  res.json(ok({ bye: req.user.email }));
});
// me/refresh ưu tiên persistent store (phản ánh đúng status sau admin thay đổi), fallback static.
function meSafe(sub) {
  try {
    const Store = require("./lib/userStore.js");
    const su = Store.findById(sub);
    if (su) {
      const user = Store.safeUser(su);
      if (Auth.isHospitalRole && Auth.isHospitalRole(user.role)) user.hospitalRole = user.role;
      return user;
    }
  } catch {}
  const u = Auth.USERS.find((x) => x.id === sub);
  if (!u) return null;
  const { password: _pw, ...safe } = u;
  if (Auth.isHospitalRole && Auth.isHospitalRole(u.role)) safe.hospitalRole = u.role;
  return safe;
}
app.get("/api/auth/me", Auth.authRequired, (req, res) => {
  const safe = meSafe(req.user.sub);
  if (!safe) return err(res, 401, "unknown user");
  res.json(ok(safe));
});
app.post("/api/auth/refresh", Auth.authRequired, (req, res) => {
  const safe = meSafe(req.user.sub);
  if (!safe) return err(res, 401, "unknown user");
  res.json(ok({ token: Auth.issueToken(safe), user: safe }));
});
// Readiness (§25): DB mở + snapshot ghi được, không secret.
app.get("/api/ready", (_req, res) => {
  let database = "connected";
  try {
    const Store = require("./lib/userStore.js");
    Store.open();
    Store.count();
  } catch (e) { database = "failed: " + String(e.message).slice(0, 80); }
  const ready = database === "connected";
  res.status(ready ? 200 : 503).json({ status: ready ? "ok" : "not-ready", database, version: APP_VERSION, timestamp: new Date().toISOString() });
});

/* ================= MODERATION (CEO/ADMIN) ================= */
app.get("/api/moderation/flagged", Auth.authRequired, Auth.requireRole("CEO", "ADMIN"), (_req, res) => {
  res.json(ok(db.patients.filter((p) => p.emState === "FLAGGED")));
});
app.post("/api/moderation/:id/review", Auth.authRequired, Auth.requireRole("CEO", "ADMIN"), (req, res) => {
  const p = db.patients.find((x) => x.id === req.params.id || x.uuid === req.params.id);
  if (!p) return err(res, 404, "patient_not_found");
  const { decision, note } = req.body || {};
  if (!["APPROVE", "DISMISS", "ESCALATE"].includes(decision)) return err(res, 400, "decision must be APPROVE|DISMISS|ESCALATE");
  const who = req.user.email;
  if (note) { p.clinicalNotes.push({ text: String(note).slice(0, 300), by: who, at: stamp() }); p.notes = p.clinicalNotes.at(-1).text; }
  if (decision === "APPROVE") {
    assertTransition(p.emState, "ACTIVE");
    p.emState = "ACTIVE";
    p.status = "DEPARTMENT_ROUTED";
    log(p, "APPROVED", who);
    audit("APPROVE_EMERGENCY", who, req.user.role, "emergency", p.id, "ok");
    io.emit("EMERGENCY_APPROVED", p);
    io.emit("EMERGENCY_CREATED", p);
    io.emit("NEW_EMERGENCY", p); // giờ mới báo động toàn viện
    persist();
  } else if (decision === "DISMISS") {
    p.emState = "DISMISSED";
    p.status = "DISMISSED";
    log(p, "DISMISSED", who);
    audit("DISMISS_EMERGENCY", who, req.user.role, "emergency", p.id, "ok");
    io.emit("EMERGENCY_UPDATED", p);
  } else {
    log(p, "ESCALATED", who);
    audit("ESCALATE_EMERGENCY", who, req.user.role, "emergency", p.id, "ok");
    io.emit("CEO_ALERT", { type: "ESCALATION", id: p.id, by: who, at: stamp() });
  }
  res.json(ok(p));
});

/* ================= DOCTOR -> PATIENT STATUS ================= */
app.post("/api/patients/:patientId/status", Auth.authRequired, Auth.requireRole("DOCTOR", "ADMIN", "CEO"), (req, res) => {
  const p = db.patients.find((x) => x.id === req.params.patientId || x.uuid === req.params.patientId || x.patientId === req.params.patientId);
  if (!p) return err(res, 404, "patient_not_found");
  const { status, message = "", severity = "INFO", type = "UPDATE_PATIENT_STATUS" } = req.body || {};
  if (!validTimelineState(status)) return err(res, 400, `status must be one of ${PATIENT_TIMELINE.join(",")}`);
  // BS chỉ được cập nhật khoa mình (CEO/ADMIN qua hết)
  if (req.user.role === "DOCTOR" && req.user.dept && !deptMatch(req.user.dept, p)) {
    audit("UPDATE_PATIENT_STATUS", req.user.email, req.user.role, "patient", p.id, "denied:wrong-dept");
    return err(res, 403, `forbidden: patient thuộc khoa ${p.department}`);
  }
  const entry = { state: status, message: String(message).slice(0, 300), severity, by: req.user.email, at: stamp() };
  p.statusTimeline.push(entry);
  log(p, `STATUS_${status}`, req.user.email);
  audit("UPDATE_PATIENT_STATUS", req.user.email, req.user.role, "patient", p.id, status);
  const payload = { patientId: p.id, emergencyId: p.id, ...entry };
  io.to(`patient:${p.id}`).emit("PATIENT_STATUS_UPDATED", payload);
  io.to(`emergency:${p.id}`).emit("PATIENT_STATUS_UPDATED", payload);
  io.emit("PATIENT_STATUS_UPDATED", payload);
  notify(null, "Doctor update", `BS cập nhật: ${status}`, message, { patientId: p.patientId || p.id, emergencyId: p.id });
  persist();
  res.json(ok(entry));
});
app.get("/api/patients/:patientId/timeline", Auth.authRequired, (req, res) => {
  const p = db.patients.find((x) => x.id === req.params.patientId || x.uuid === req.params.patientId || x.patientId === req.params.patientId);
  if (!p) return err(res, 404, "patient_not_found");
  res.json(ok(p.statusTimeline));
});

/* ================= APPOINTMENTS ================= */
const APPT_TYPES = ["FOLLOW_UP", "VACCINATION", "CONSULTATION", "LAB", "IMAGING", "PROCEDURE"];
app.get("/api/appointments", Auth.authRequired, (req, res) => {
  const { patientId } = req.query;
  res.json(ok(patientId ? db.appointments.filter((a) => a.patientId === patientId) : db.appointments));
});
app.post("/api/appointments", Auth.authRequired, Auth.requireRole("DOCTOR", "ADMIN", "CEO"), (req, res) => {
  const { patientId, doctorId, departmentId, type, date, time, location, note } = req.body || {};
  if (!patientId || !doctorId || !departmentId || !type || !date || !time)
    return err(res, 400, "missing required: patientId, doctorId, departmentId, type, date, time");
  if (!APPT_TYPES.includes(type)) return err(res, 400, `type must be one of ${APPT_TYPES.join(",")}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return err(res, 400, "date YYYY-MM-DD, time HH:MM");
  const a = { id: `A${String(apptCounter++).padStart(3, "0")}`, patientId, doctorId, departmentId, type, date, time,
    location: location || "", note: note || "", status: "SCHEDULED" };
  db.appointments.unshift(a);
  audit("CREATE_APPOINTMENT", req.user.email, req.user.role, "appointment", a.id, "ok");
  io.to(`patient:${patientId}`).emit("APPT_CREATED", a);
  io.emit("APPT_CREATED", a);
  notify(null, "Appointment", `Lịch hẹn mới ${date} ${time}`, `${type} tại ${a.location}`, { patientId });
  persist();
  res.status(201).json(ok(a));
});
app.patch("/api/appointments/:id", Auth.authRequired, Auth.requireRole("DOCTOR", "ADMIN", "CEO"), (req, res) => {
  const a = db.appointments.find((x) => x.id === req.params.id);
  if (!a) return err(res, 404, "appointment_not_found");
  const { status, date, time, note } = req.body || {};
  if (status) a.status = status;
  if (date) a.date = date;
  if (time) a.time = time;
  if (note !== undefined) a.note = note;
  audit("UPDATE_APPOINTMENT", req.user.email, req.user.role, "appointment", a.id, "ok");
  io.to(`patient:${a.patientId}`).emit("APPT_UPDATED", a);
  io.emit("APPT_UPDATED", a);
  res.json(ok(a));
});
app.delete("/api/appointments/:id", Auth.authRequired, Auth.requireRole("DOCTOR", "ADMIN", "CEO"), (req, res) => {
  const i = db.appointments.findIndex((x) => x.id === req.params.id);
  if (i === -1) return err(res, 404, "appointment_not_found");
  const [a] = db.appointments.splice(i, 1);
  audit("CANCEL_APPOINTMENT", req.user.email, req.user.role, "appointment", a.id, "ok");
  io.to(`patient:${a.patientId}`).emit("APPT_CANCELLED", { id: a.id, patientId: a.patientId });
  io.emit("APPT_CANCELLED", { id: a.id, patientId: a.patientId });
  res.json(ok({ id: a.id }));
});

/* ================= MEDICATIONS ================= */
app.get("/api/patients/:patientId/medications", Auth.authRequired, (req, res) => {
  res.json(ok(db.medications.filter((m) => m.patientId === req.params.patientId)));
});
app.post("/api/patients/:patientId/medications", Auth.authRequired, Auth.requireRole("DOCTOR", "ADMIN", "CEO"), (req, res) => {
  const { name, dosage, schedule, instructions } = req.body || {};
  if (!name) return err(res, 400, "missing required: name");
  const m = { id: `M${String(medCounter++).padStart(3, "0")}`, patientId: req.params.patientId,
    name, dosage: dosage || "", schedule: schedule || "", instructions: instructions || "", status: "active" };
  db.medications.unshift(m);
  audit("UPDATE_MEDICATION", req.user.email, req.user.role, "medication", m.id, "prescribed");
  audit("PRESCRIPTION_CREATE", req.user.email, req.user.role, "prescription", m.id, "prescribed");
  io.to(`patient:${m.patientId}`).emit("MEDICATION_UPDATED", m);
  io.emit("MEDICATION_UPDATED", m);
  persist();
  res.status(201).json(ok(m));
});
app.patch("/api/medications/:id", Auth.authRequired, Auth.requireRole("DOCTOR", "ADMIN", "CEO", "NURSE"), (req, res) => {
  const m = db.medications.find((x) => x.id === req.params.id);
  if (!m) return err(res, 404, "medication_not_found");
  const { dosage, schedule, instructions, status } = req.body || {};
  if (dosage !== undefined) m.dosage = dosage;
  if (schedule !== undefined) m.schedule = schedule;
  if (instructions !== undefined) m.instructions = instructions;
  if (status !== undefined) m.status = status;
  audit("UPDATE_MEDICATION", req.user.email, req.user.role, "medication", m.id, status || "updated");
  io.to(`patient:${m.patientId}`).emit("MEDICATION_UPDATED", m);
  io.emit("MEDICATION_UPDATED", m);
  res.json(ok(m));
});

/* ================= META / NOTIFICATIONS / AUDIT ================= */
app.get("/api/meta", (_req, res) => res.json(ok(META)));
// RBAC: PATIENT/CAREGIVER chỉ thấy của mình; DOCTOR/NURSE chỉ khoa mình;
// CEO/ADMIN toàn viện. Không gửi clinical vượt scope.
app.get("/api/notifications", Auth.authRequired, (req, res) => {
  const { role, sub, patientId, dept } = req.user;
  let list = db.notifications;
  if (role === "PATIENT") {
    list = list.filter((n) => !n.toUserId || n.toUserId === sub || (patientId && n.patientId === patientId));
  } else if (role === "CAREGIVER") {
    const now = Date.now();
    const pids = db.grants
      .filter((g) => g.caregiverId === sub && (!g.expiresAt || new Date(g.expiresAt).getTime() > now))
      .map((g) => g.patientId);
    list = list.filter((n) => !n.toUserId || n.toUserId === sub || (n.patientId && pids.includes(n.patientId)));
  } else if (role === "DOCTOR" || role === "NURSE") {
    list = list.filter((n) => !n.dept || n.dept === dept || n.category === "System");
  }
  // §XXXVI Notification Center: filter READ/UNREAD + ACTION_REQUIRED (Appointment/Payment/Followup)
  const ACTION_CATS = new Set(["Appointment", "Payment", "Pharmacy"]);
  list = list.map((n) => ({ ...n, actionRequired: !n.read && ACTION_CATS.has(n.category) }));
  if (req.query.category) list = list.filter((n) => n.category === req.query.category);
  if (req.query.unread === "1") list = list.filter((n) => !n.read);
  if (req.query.actionRequired === "1") list = list.filter((n) => n.actionRequired);
  const unread = list.filter((n) => !n.read).length;
  res.json(ok({ items: list.slice(0, 50), unread }));
});
app.post("/api/notifications/:id/read", Auth.authRequired, (req, res) => {
  const n = db.notifications.find((x) => x.id === req.params.id);
  if (!n) return err(res, 404, "notification_not_found");
  n.read = true;
  persist();
  res.json(ok(n));
});
app.post("/api/notifications/read-all", Auth.authRequired, (req, res) => {
  const { sub } = req.user;
  let count = 0;
  db.notifications.forEach((n) => {
    if (!n.read && (!n.toUserId || n.toUserId === sub)) { n.read = true; count++; }
  });
  persist();
  res.json(ok({ marked: count }));
});
app.get("/api/audit", Auth.authRequired, Auth.requireRole("CEO", "ADMIN"), (req, res) => {
  res.json(ok(auditTrail.slice(0, Number(req.query.limit) || 100)));
});

/* ============ HOSPITAL DEMO1: ORG + STAFF + RBAC (DEMO/MOCK/SEEDED) ============
 * BỆNH VIỆN ĐA KHOA TW DEMO1 — Tòa -> Tầng -> Khoa -> Phòng/Đơn vị ->
 * Chức danh -> User -> Role -> Permission -> Scope (LEVEL 0..5).
 * Không đụng API legacy phía trên. */
const STAFF_MANAGERS = ["CEO", "ADMIN", "SUPER_ADMIN", "HOSPITAL_DIRECTOR", "HR_MANAGER", "IT_ADMIN"];
function viewerIsStaffManager(req) {
  return STAFF_MANAGERS.includes(req.user.role) || STAFF_MANAGERS.includes(req.user.hospitalRole);
}
function viewerCan(req, perm) {
  if (req.user.role === "CEO" || req.user.role === "ADMIN") return true;
  const hr = req.user.hospitalRole;
  if (!hr || !Hospital) return false;
  return Hospital.userHasPermission({ role: hr }, perm);
}
function viewerHospitalUser(req) {
  if (!Hospital) return null;
  return Hospital.USERS.find((u) => u.id === req.user.sub) || null;
}

app.get("/api/org/summary", Auth.authRequired, (req, res) => {
  res.json(ok({ ...Hospital.summary(), banner: Hospital.DEMO_BANNER }));
});
app.get("/api/org/tree", Auth.authRequired, (req, res) => {
  res.json(ok({ hospital: Hospital.HOSPITAL_NAME, banner: Hospital.DEMO_BANNER, tree: Hospital.orgTree() }));
});
app.get("/api/org/departments", Auth.authRequired, (req, res) => {
  const list = Hospital.DEPARTMENTS.map((d) => {
    const head = Hospital.USERS.find((u) => u.username === d.head);
    const staff = Hospital.USERS.filter((u) => u.department === d.id);
    const count = (fn) => staff.filter(fn).length;
    return {
      id: d.id, code: d.code, name: d.name, building: d.building, floors: d.floors,
      head: head ? { fullName: head.fullName, username: head.username, jobTitle: head.jobTitle } : null,
      deputies: staff.filter((u) => u.role === "DEPUTY_HEAD").map((u) => u.fullName),
      doctors: count((u) => u.role === "DOCTOR" || (["DEPARTMENT_HEAD", "DEPUTY_HEAD"].includes(u.role) && u.specialty)),
      nurses: count((u) => u.role === "NURSE"),
      technicians: count((u) => u.role === "TECHNICIAN"),
      pharmacists: count((u) => u.role === "PHARMACIST"),
      totalStaff: staff.length,
      units: d.units, status: "active",
    };
  });
  res.json(ok({ hospital: Hospital.HOSPITAL_NAME, banner: Hospital.DEMO_BANNER, departments: list }));
});

// Danh sách nhân sự: cần staff.view (CEO/ADMIN qua hết)
app.get("/api/staff", Auth.authRequired, (req, res) => {
  if (!viewerCan(req, "staff.view")) {
    audit("STAFF_VIEW", req.user.email, req.user.hospitalRole || req.user.role, "staff", "-", "denied:no-permission");
    return err(res, 403, "forbidden: missing staff.view");
  }
  const { q = "", role, department, building, status, page = "1", limit = "20" } = req.query;
  const nq = String(q).toLowerCase();
  let list = Hospital.USERS.map(Hospital.safeUser);
  if (nq) list = list.filter((u) => [u.fullName, u.username, u.employeeId, u.email].some((s) => String(s || "").toLowerCase().includes(nq)));
  if (role) list = list.filter((u) => u.role === role);
  if (department) list = list.filter((u) => u.department === department);
  if (building) list = list.filter((u) => u.building === building);
  if (status) list = list.filter((u) => u.status === status);
  const total = list.length;
  const pg = Math.max(1, Number(page) || 1);
  const lm = Math.min(100, Math.max(1, Number(limit) || 20));
  const items = list.slice((pg - 1) * lm, pg * lm);
  res.json(ok({ items, total, page: pg, limit: lm, summary: Hospital.summary(), banner: Hospital.DEMO_BANNER }));
});

// Danh sách bác sĩ + filter tòa/khoa/chuyên khoa/trạng thái/role
app.get("/api/staff/doctors", Auth.authRequired, (req, res) => {
  const { building, department, specialty, status, q = "" } = req.query;
  const nq = String(q).toLowerCase();
  let list = Hospital.doctors();
  if (building) list = list.filter((u) => u.building === building);
  if (department) list = list.filter((u) => u.department === department);
  if (specialty) list = list.filter((u) => (u.specialty || "").toLowerCase().includes(String(specialty).toLowerCase()));
  if (status) list = list.filter((u) => u.status === status);
  if (nq) list = list.filter((u) => [u.fullName, u.username, u.employeeId].some((s) => String(s || "").toLowerCase().includes(nq)));
  res.json(ok({
    banner: Hospital.DEMO_BANNER, total: list.length,
    items: list.map((u) => ({
      doctorId: u.employeeId, fullName: u.fullName, specialty: u.specialty || "—",
      department: u.departmentName, departmentId: u.department, building: u.building,
      position: u.jobTitle, username: u.username, status: u.status, onDuty: u.onDuty, role: u.role,
    })),
  }));
});

// Chi tiết tài khoản + permissions + audit gần đây (cần staff.view + đúng scope)
app.get("/api/staff/:username", Auth.authRequired, (req, res) => {
  const target = Hospital.findByUsername(req.params.username);
  if (!target) return err(res, 404, "staff_not_found");
  if (!viewerCan(req, "staff.view")) return err(res, 403, "forbidden: missing staff.view");
  const viewer = viewerHospitalUser(req);
  if (viewer && !Hospital.inScope(viewer, { building: target.building, department: target.department })) {
    audit("STAFF_VIEW", req.user.email, req.user.hospitalRole || req.user.role, "staff", target.username, "denied:out-of-scope");
    return err(res, 403, "forbidden: ngoài phạm vi tổ chức");
  }
  const perms = Hospital.getPermissions(target.role);
  const recent = auditTrail.filter((a) => a.actor === target.email).slice(0, 10);
  audit("STAFF_VIEW", req.user.email, req.user.hospitalRole || req.user.role, "staff", target.username, "ok");
  res.json(ok({ user: Hospital.safeUser(target), permissions: perms, scope: target.scope, recentAudit: recent, banner: Hospital.DEMO_BANNER }));
});

// Khóa/mở khóa + đổi trạng thái (chỉ quản lý nhân sự) — write-through SQLite để login thật đổi theo
app.patch("/api/staff/:username", Auth.authRequired, (req, res) => {
  if (!viewerIsStaffManager(req)) return err(res, 403, "forbidden: staff managers only");
  const target = Hospital.findByUsername(req.params.username);
  if (!target) return err(res, 404, "staff_not_found");
  const { status } = req.body || {};
  if (!["ACTIVE", "INACTIVE", "LOCKED", "PENDING"].includes(status)) return err(res, 400, "status must be ACTIVE|INACTIVE|LOCKED|PENDING");
  target.status = status;
  try {
    const Store = require("./lib/userStore.js");
    const row = Store.findByUsername(target.username);
    if (row) Store.updateRow(row.id, { status });
  } catch {}
  audit("USER_UPDATE", req.user.email, req.user.hospitalRole || req.user.role, "staff", target.username, status);
  persist();
  res.json(ok({ user: Hospital.safeUser(target) }));
});

// Reset mật khẩu demo (về Demo@2026!) — chỉ quản lý nhân sự (write-through hash mới)
app.post("/api/staff/:username/reset-password", Auth.authRequired, (req, res) => {
  if (!viewerIsStaffManager(req)) return err(res, 403, "forbidden: staff managers only");
  const target = Hospital.findByUsername(req.params.username);
  if (!target) return err(res, 404, "staff_not_found");
  target.password = Hospital.DEMO_PASSWORD;
  if (target.status === "LOCKED") target.status = "ACTIVE";
  try {
    const Store = require("./lib/userStore.js");
    const row = Store.findByUsername(target.username);
    if (row) Store.updateRow(row.id, { password_hash: Store.hashPassword(Hospital.DEMO_PASSWORD), status: target.status });
  } catch {}
  audit("PASSWORD_RESET", req.user.email, req.user.hospitalRole || req.user.role, "staff", target.username, "ok");
  persist();
  res.json(ok({ username: target.username, demoPassword: Hospital.DEMO_PASSWORD, banner: Hospital.DEMO_BANNER }));
});

// RBAC: roles / permissions / matrix
app.get("/api/rbac/roles", Auth.authRequired, (req, res) => {
  res.json(ok({ banner: Hospital.DEMO_BANNER, roles: Hospital.ROLES }));
});
app.get("/api/rbac/permissions", Auth.authRequired, (req, res) => {
  res.json(ok({ banner: Hospital.DEMO_BANNER, permissions: Hospital.PERMISSIONS }));
});
app.get("/api/rbac/matrix", Auth.authRequired, (req, res) => {
  const matrix = {};
  for (const r of Hospital.ROLES) matrix[r.id] = Hospital.getPermissions(r.id);
  res.json(ok({ banner: Hospital.DEMO_BANNER, matrix, roleCount: Hospital.ROLES.length, permissionCount: Hospital.PERMISSIONS.length }));
});

// Permission Inspector: user X có quyền Y trong scope Z không?
app.get("/api/rbac/check", Auth.authRequired, (req, res) => {
  const { username, permission, department, building } = req.query;
  if (!username || !permission) return err(res, 400, "missing required: username, permission");
  const target = Hospital.findByUsername(username);
  if (!target) return err(res, 404, "staff_not_found");
  const rolePerms = Hospital.getPermissions(target.role);
  const hasPerm = rolePerms.includes(permission);
  const scopeTarget = { department: department || target.department, building: building || target.building };
  const scopeOk = Hospital.inScope(target, scopeTarget);
  const denied = Hospital.PERMISSIONS.map((p) => p.id).filter((p) => !rolePerms.includes(p));
  res.json(ok({
    user: target.fullName, username: target.username, role: target.role,
    scope: target.department ? `${target.building ? `Tòa ${target.building} / ` : ""}${target.departmentName}` : `Tòa ${target.building}`,
    permission, allowed: hasPerm && scopeOk,
    reason: !hasPerm ? `Role ${target.role} không có quyền ${permission}` : (!scopeOk ? "Ngoài phạm vi tổ chức (scope)" : "Được phép trong phạm vi"),
    allowedList: rolePerms, deniedList: denied,
    banner: Hospital.DEMO_BANNER,
  }));
});

// Demo Account Portal (public cho demo login — chỉ demo, có banner)
const DEMO_GROUPS = [
  { id: "leadership", label: "Ban Giám đốc", match: (u) => ["HOSPITAL_DIRECTOR", "DEPUTY_DIRECTOR", "MEDICAL_BOARD", "COMMAND_OPERATOR", "DATA_ANALYST"].includes(u.role) && ["board", "medical-board", "command-center"].includes(u.department) },
  { id: "managers", label: "Quản lý khoa", match: (u) => ["DEPARTMENT_HEAD", "DEPUTY_HEAD", "FUNCTIONAL_MANAGER", "HR_MANAGER", "FINANCE_MANAGER", "QUALITY_MANAGER", "BUILDING_MANAGER"].includes(u.role) },
  { id: "doctors", label: "Bác sĩ", match: (u) => u.role === "DOCTOR" },
  { id: "nurses", label: "Điều dưỡng", match: (u) => u.role === "NURSE" },
  { id: "technicians", label: "Kỹ thuật viên", match: (u) => u.role === "TECHNICIAN" },
  { id: "pharmacists", label: "Dược sĩ", match: (u) => u.role === "PHARMACIST" },
  { id: "finance", label: "Kế toán", match: (u) => ["FINANCE_MANAGER", "FINANCE_STAFF"].includes(u.role) },
  { id: "it", label: "CNTT", match: (u) => ["IT_ADMIN", "IT_STAFF", "EMR_ADMIN"].includes(u.role) },
  { id: "admin", label: "Hành chính", match: (u) => ["ADMIN_STAFF", "SUPPORT_STAFF", "HR_STAFF", "REVIEW_OFFICER"].includes(u.role) },
  { id: "buildings", label: "Tài khoản Tòa", match: (u) => u.role === "BUILDING_MANAGER" },
  { id: "patients", label: "Bệnh nhân", source: "patient", match: (u) => u.role === "PATIENT" && u.demo },
  { id: "caregivers", label: "Người chăm sóc", source: "patient", match: (u) => u.role === "CAREGIVER" && u.demo },
];
app.get("/api/demo/accounts", (req, res) => {
  const { group } = req.query;
  const pick = (u) => ({
    username: u.username || u.email, fullName: u.fullName || u.name, jobTitle: u.jobTitle || (u.role === "PATIENT" ? "Patient demo" : "Caregiver demo"), role: u.role,
    department: u.departmentName, building: u.building, floor: u.floor, status: u.status,
    email: u.email, demoPassword: u.password,
  });
  const groups = DEMO_GROUPS.map((g) => ({
    id: g.id, label: g.label,
    accounts: (g.source === "patient" ? Auth.USERS : Hospital.USERS).filter((u) => (!u.status || u.status === "ACTIVE") && g.match(u)).slice(0, 12).map(pick),
  }));
  const data = {
    hospital: Hospital.HOSPITAL_NAME, banner: Hospital.DEMO_BANNER,
    loginHint: "Tài khoản staff dùng Demo@2026!; patient legacy dùng demo123; patient/caregiver DEMO dùng password trong portal.",
    summary: Hospital.summary(),
    groups: group ? groups.filter((g) => g.id === group) : groups,
  };
  res.json(ok(data));
});

/* ================= GPS DISPATCH (SIMULATION — ghi rõ, không phải GPS thật) ================= */
app.post("/api/emergency/:id/dispatch", Auth.authRequired, Auth.requireRole("DOCTOR", "ADMIN", "CEO"), (req, res) => {
  const p = db.patients.find((x) => x.id === req.params.id || x.uuid === req.params.id);
  if (!p) return err(res, 404, "patient_not_found");
  try {
    assertTransition(p.emState, "DISPATCHED");
  } catch (e) {
    // Cho phép dispatch từ các trạng thái care đang mở (demo linh hoạt)
    if (!["ACTIVE", "NORMAL", "DOCTOR_ACCEPTED", "IN_TREATMENT"].includes(p.emState) && p.status !== "DEPARTMENT_ROUTED") {
      return err(res, 400, `cannot dispatch from ${p.emState}/${p.status}`);
    }
  }
  p.emState = "DISPATCHED";
  p.status = "DISPATCHED";
  log(p, "DISPATCHED", req.user.email);
  audit("DISPATCH_AMBULANCE", req.user.email, req.user.role, "emergency", p.id, "simulation");
  const amb = META.ambulances.find((a) => a.status === "AVAILABLE");
  if (amb) { amb.status = "DISPATCHED"; amb.assignedEmergency = p.id; }
  GPS.startSimulation(io, { id: p.id, patientId: p.patientId || p.id }, () => {
    p.emState = "ARRIVED";
    p.status = "ARRIVED";
    log(p, "ARRIVED", "GPS-sim");
    p.statusTimeline.push({ state: "AMBULANCE_DISPATCHED", message: "Xe đã tới nơi (mô phỏng)", severity: "INFO", by: "GPS-sim", at: stamp() });
    io.emit("EMERGENCY_UPDATED", p);
    if (amb) { amb.status = "AVAILABLE"; amb.assignedEmergency = null; }
  });
  io.emit("EMERGENCY_UPDATED", p);
  persist();
  res.json(ok({ id: p.id, emState: p.emState, ambulance: amb?.vehicleId || null, simulated: true }));
});

/* ================= BEDS (doctor request, nurse/admin quản lý) ================= */
const BED_STATES = ["AVAILABLE", "OCCUPIED", "RESERVED", "CLEANING", "MAINTENANCE"];
app.get("/api/beds", Auth.authRequired, Auth.requireRole("CEO", "ADMIN", "DOCTOR", "NURSE"), (req, res) => {
  const { ward, status } = req.query;
  let list = db.beds;
  if (ward) list = list.filter((b) => b.ward === ward);
  if (status) list = list.filter((b) => b.status === status);
  const summary = {};
  db.beds.forEach((b) => {
    summary[b.ward] = summary[b.ward] || { total: 0, free: 0 };
    summary[b.ward].total++;
    if (b.status === "AVAILABLE") summary[b.ward].free++;
  });
  res.json(ok({ beds: list, summary }));
});
app.patch("/api/beds/:id", Auth.authRequired, Auth.requireRole("NURSE", "ADMIN", "CEO", "DOCTOR"), (req, res) => {
  const b = db.beds.find((x) => x.id === req.params.id);
  if (!b) return err(res, 404, "bed_not_found");
  const { status, patientId } = req.body || {};
  if (!BED_STATES.includes(status)) return err(res, 400, `status must be one of ${BED_STATES.join(",")}`);
  b.status = status;
  b.patientId = patientId || null;
  audit("BED_UPDATE", req.user.email, req.user.role, "bed", b.id, status);
  io.emit("BED_UPDATED", b);
  persist();
  res.json(ok(b));
});

/* ================= ME (PATIENT/CAREGIVER — staff vào là 403) =================
 * Staff (kể cả CEO/ADMIN) KHÔNG dùng me/* — dùng /api/patients/:id/record.
 * Caregiver cần grant còn hạn + đúng scope từng endpoint. */
const ENDPOINT_SCOPE = {
  "medical-record": "MEDICAL_RECORD",
  appointments: "APPOINTMENT",
  medications: "MEDICATION",
  notifications: "EMERGENCY",
  labs: "LAB",
  imaging: "IMAGING",
  billing: "BILLING",
};
function scopeRequired(key) {
  return (req, res, next) => {
    try {
      req.scope = resolveScope(req, ENDPOINT_SCOPE[key]);
      next();
    } catch (e) {
      err(res, e.status || 500, e.message);
    }
  };
}
function resolveScope(req, scope) {
  const { role, patientId, sub } = req.user;
  if (role === "PATIENT") {
    if (!patientId) { const e = new Error("no patient linked"); e.status = 403; throw e; }
    return scopeData(patientId);
  }
  if (role === "CAREGIVER") {
    const now = Date.now();
    const mine = db.grants.filter((g) => g.caregiverId === sub && (!g.expiresAt || new Date(g.expiresAt).getTime() > now));
    const g = req.query.patientId ? mine.find((x) => x.patientId === req.query.patientId) : mine[0];
    if (!g) { const e = new Error("forbidden: no caregiver grant"); e.status = 403; throw e; }
    if (scope && !(g.scopes || []).includes(scope)) {
      audit("GRANT_ACCESS", req.user.email, role, "grant", g.id, `denied:${scope}`);
      const e = new Error(`forbidden: missing scope ${scope}`); e.status = 403; throw e;
    }
    audit("GRANT_ACCESS", req.user.email, role, "grant", g.id, `ok:${scope}`);
    return scopeData(g.patientId);
  }
  const e = new Error("forbidden: me/* chỉ dành cho patient/caregiver"); e.status = 403; throw e;
}
function scopeData(pid) {
  const emIds = db.patients.filter((p) => p.patientId === pid).map((p) => p.id);
  const match = (x) => x === pid || emIds.includes(x);
  return { pid, emIds, match };
}
const ME_ROLES = ["PATIENT", "CAREGIVER"];
app.get("/api/me/medical-record", Auth.authRequired, Auth.requireRole(...ME_ROLES), scopeRequired("medical-record"), (req, res) => {
  const { pid, match } = req.scope;
  audit("EMR_ACCESS", req.user.email, req.user.role, "emr", pid, "ok");
  res.json(ok({
    patientId: pid,
    emergencies: db.patients.filter((p) => p.patientId === pid || p.id === pid)
      .map((p) => ({ id: p.id, symptom: p.symptom, severity: p.severity, department: p.department, status: p.status, emState: p.emState, timestamp: p.timestamp })),
    appointments: db.appointments.filter((a) => match(a.patientId)),
    medications: db.medications.filter((m) => match(m.patientId)),
    labs: db.labs.filter((l) => match(l.patientId)),
  }));
});
app.get("/api/me/appointments", Auth.authRequired, Auth.requireRole(...ME_ROLES), scopeRequired("appointments"), (req, res) => {
  res.json(ok(db.appointments.filter((a) => req.scope.match(a.patientId)).map((a) => {
    const doctor = META.doctors.find((d) => d.doctorId === a.doctorId);
    return { ...a, doctor: doctor ? { name: doctor.name, specialty: doctor.specialty, department: doctor.department } : null };
  })));
});
  app.post("/api/me/appointments/:id/check-in", Auth.authRequired, Auth.requireRole(...ME_ROLES), scopeRequired("appointments"), (req, res) => {
    const appointment = db.appointments.find((a) => a.id === req.params.id && req.scope.match(a.patientId));
    if (!appointment) return err(res, 404, "appointment_not_found");
    if (["COMPLETED", "CANCELLED"].includes(appointment.status)) return err(res, 409, "appointment_not_checkin_eligible");
    appointment.status = "ARRIVED";
    appointment.checkInStatus = "ARRIVED";
    appointment.checkedInAt = stamp();
    audit("APPOINTMENT_CHECK_IN", req.user.email, req.user.role, "appointment", appointment.id, "ok");
    io.to(`patient:${appointment.patientId}`).emit("APPT_UPDATED", appointment);
    notify(null, "Appointment", `Đã check-in ${appointment.id}`, "Bạn đang ở trạng thái ARRIVED — vui lòng chờ gọi số.", { patientId: appointment.patientId });
    persist();
    res.json(ok(appointment));
  });
app.get("/api/me/medications", Auth.authRequired, Auth.requireRole(...ME_ROLES), scopeRequired("medications"), (req, res) => {
  res.json(ok(db.medications.filter((m) => req.scope.match(m.patientId))));
});
app.get("/api/me/notifications", Auth.authRequired, Auth.requireRole(...ME_ROLES), scopeRequired("notifications"), (req, res) => {
  const { pid } = req.scope;
  res.json(ok(db.notifications.filter((n) => !n.toUserId || n.toUserId === req.user.sub || (pid && n.patientId === pid)).slice(0, 50)));
});
app.get("/api/me/profile", Auth.authRequired, Auth.requireRole(...ME_ROLES), (req, res) => {
  const { pid } = resolveScope(req, null);
  const profile = db.patientProfiles.find((p) => p.patientId === pid);
  if (!profile) return err(res, 404, "patient_profile_not_found");
  const visits = db.patients.filter((p) => p.patientId === pid).map((p) => ({ id: p.id, date: p.timestamp, department: p.department, reason: p.symptom, status: p.status }));
  res.json(ok({ ...profile, visits, linkedCaregivers: db.grants.filter((g) => g.patientId === pid).map((g) => ({ id: g.id, caregiverId: g.caregiverId, scopes: g.scopes, expiresAt: g.expiresAt })) }));
});
app.patch("/api/me/profile", Auth.authRequired, Auth.requireRole("PATIENT"), (req, res) => {
  const profile = db.patientProfiles.find((p) => p.patientId === req.user.patientId);
  if (!profile) return err(res, 404, "patient_profile_not_found");
  const { contact, emergencyContact } = req.body || {};
  if (contact !== undefined) profile.contact = String(contact).slice(0, 80);
  if (emergencyContact !== undefined) profile.emergencyContact = String(emergencyContact).slice(0, 120);
  audit("PATIENT_PROFILE_UPDATE", req.user.email, "PATIENT", "profile", profile.patientId, "ok");
  persist();
  res.json(ok(profile));
});
app.get("/api/me/labs", Auth.authRequired, Auth.requireRole(...ME_ROLES), scopeRequired("labs"), (req, res) => {
  res.json(ok(db.labs.filter((l) => l.kind === "LAB" && ["REVIEWED", "RELEASED"].includes(l.status) && req.scope.match(l.patientId)).map((l) => ({ ...l, interpretation: l.abnormal ? "Kết quả được đánh dấu để nhân viên y tế xem xét." : "Chưa có cảnh báo hệ thống." }))));
});
app.get("/api/me/imaging", Auth.authRequired, Auth.requireRole(...ME_ROLES), scopeRequired("imaging"), (req, res) => {
  res.json(ok(db.labs.filter((l) => l.kind === "IMAGING" && ["REVIEWED", "RELEASED"].includes(l.status) && req.scope.match(l.patientId)).map((l) => ({ ...l, report: l.result || "Chưa có báo cáo." }))));
});
app.get("/api/me/billing", Auth.authRequired, Auth.requireRole(...ME_ROLES), scopeRequired("billing"), (req, res) => {
  res.json(ok(db.billing.filter((b) => req.scope.match(b.patientId)).map((b) => ({ ...b, paymentMode: "DEMO PAYMENT" }))));
});
app.get("/api/me/doctors", Auth.authRequired, Auth.requireRole(...ME_ROLES), scopeRequired("appointments"), (req, res) => {
  const ids = new Set(db.appointments.filter((a) => req.scope.match(a.patientId)).map((a) => a.doctorId));
  res.json(ok(META.doctors.filter((d) => ids.has(d.doctorId)).map(({ doctorId, name, specialty, department, status }) => ({ doctorId, name, specialty, department, status }))));
});
app.get("/api/me/linked-patients", Auth.authRequired, Auth.requireRole("CAREGIVER"), (req, res) => {
  const now = Date.now();
  const pids = db.grants.filter((g) => g.caregiverId === req.user.sub && (!g.expiresAt || new Date(g.expiresAt).getTime() > now)).map((g) => g.patientId);
  res.json(ok(db.patientProfiles.filter((p) => pids.includes(p.patientId)).map((p) => ({ patientId: p.patientId, medicalId: p.medicalId, fullName: p.fullName, status: p.status }))));
});
// Bệnh nhân tự cấp/thu hồi quyền caregiver (granular + audit)
const GRANT_SCOPES = ["MEDICATION", "APPOINTMENT", "EMERGENCY", "MEDICAL_RECORD", "LAB", "IMAGING", "BILLING"];
app.get("/api/me/caregivers", Auth.authRequired, Auth.requireRole("PATIENT"), (req, res) => {
  res.json(ok(db.grants.filter((g) => g.patientId === req.user.patientId)));
});
app.post("/api/me/caregivers", Auth.authRequired, Auth.requireRole("PATIENT"), (req, res) => {
  const { caregiverEmail, scopes, expiresAt } = req.body || {};
  const cg = Auth.USERS.find((u) => u.email === String(caregiverEmail || "").toLowerCase() && u.role === "CAREGIVER");
  if (!cg) return err(res, 404, "caregiver_not_found");
  if (!Array.isArray(scopes) || !scopes.length || !scopes.every((s) => GRANT_SCOPES.includes(s)))
    return err(res, 400, `scopes must be subset of ${GRANT_SCOPES.join(",")}`);
  const g = { id: `G${String(grantCounter++).padStart(3, "0")}`, caregiverId: cg.id,
    patientId: req.user.patientId, scopes, expiresAt: expiresAt || null, by: req.user.email };
  db.grants.unshift(g);
  audit("GRANT_CREATE", req.user.email, "PATIENT", "grant", g.id, scopes.join(","));
  persist();
  res.status(201).json(ok(g));
});
app.delete("/api/me/caregivers/:id", Auth.authRequired, Auth.requireRole("PATIENT"), (req, res) => {
  const i = db.grants.findIndex((g) => g.id === req.params.id && g.patientId === req.user.patientId);
  if (i === -1) return err(res, 404, "grant_not_found");
  const [g] = db.grants.splice(i, 1);
  audit("GRANT_REVOKE", req.user.email, "PATIENT", "grant", g.id, "ok");
  persist();
  res.json(ok({ id: g.id }));
});
// Hồ sơ lâm sàng cho staff (thay cho staff dùng me/*) — dept-check chặt
app.get("/api/patients/:id/record", Auth.authRequired, Auth.requireRole("CEO", "ADMIN", "DOCTOR", "NURSE"), (req, res) => {
  const pid = req.params.id;
  const ems = db.patients.filter((p) => p.patientId === pid || p.id === pid);
  if (["DOCTOR", "NURSE"].includes(req.user.role) && ems.length &&
      !ems.some((e) => deptMatch(req.user.dept, e))) {
    audit("PATIENT_VIEW", req.user.email, req.user.role, "patient", pid, "denied:wrong-dept");
    return err(res, 403, "forbidden: ngoài phạm vi khoa");
  }
  const match = (x) => x === pid || ems.some((e) => e.id === x);
  audit("PATIENT_VIEW", req.user.email, req.user.role, "patient", pid, "ok");
  res.json(ok({
    patientId: pid,
    emergencies: ems, timeline: ems.flatMap((e) => (e.statusTimeline || []).map((t) => ({ ...t, emergencyId: e.id }))),
    appointments: db.appointments.filter((a) => match(a.patientId)),
    medications: db.medications.filter((m) => match(m.patientId)),
    labs: db.labs.filter((l) => match(l.patientId)),
  }));
});
// Patient ghi nhận uống/bỏ qua/trì hoãn thuốc theo đơn (adherence về backend)
app.post("/api/me/meds/:id/adherence", Auth.authRequired, Auth.requireRole(...ME_ROLES), scopeRequired("medications"), (req, res) => {
  const m = db.medications.find((x) => x.id === req.params.id);
  if (!m || !req.scope.match(m.patientId)) return err(res, 404, "medication_not_found");
  const { state } = req.body || {};
  if (!["TAKEN", "SKIPPED", "SNOOZED"].includes(state)) return err(res, 400, "state must be TAKEN|SKIPPED|SNOOZED");
  m.adherence = m.adherence || [];
  m.adherence.push({ date: new Date().toISOString().slice(0, 10), state, at: stamp(), by: req.user.email });
  audit("MEDICATION_ADHERENCE", req.user.email, req.user.role, "medication", m.id, state);
  io.to(`patient:${m.patientId}`).emit("MEDICATION_UPDATED", m);
  io.emit("MEDICATION_UPDATED", m);
  persist();
  res.json(ok(m));
});

/* ================= LAB / IMAGING (order -> processing -> result -> review) ================= */
const LAB_STATES = ["ORDERED", "PROCESSING", "READY", "REVIEWED", "RELEASED"];
app.get("/api/labs", Auth.authRequired, Auth.requireRole("CEO", "ADMIN", "DOCTOR", "NURSE"), (req, res) => {
  const { patientId } = req.query;
  res.json(ok(patientId ? db.labs.filter((l) => l.patientId === patientId) : db.labs));
});
app.post("/api/labs", Auth.authRequired, Auth.requireRole("DOCTOR", "ADMIN", "CEO"), (req, res) => {
  const { patientId, emergencyId, kind, test } = req.body || {};
  if (!patientId || !kind || !test) return err(res, 400, "missing required: patientId, kind, test");
  if (!["LAB", "IMAGING"].includes(kind)) return err(res, 400, "kind must be LAB|IMAGING");
  const l = { id: `L${String(labCounter++).padStart(3, "0")}`, patientId, emergencyId: emergencyId || null,
    kind, test, status: "ORDERED", orderedBy: req.user.email, performedBy: "", result: "",
    createdAt: stamp(), completedAt: null };
  db.labs.unshift(l);
  audit("LAB_ORDER", req.user.email, req.user.role, "lab", l.id, `${kind}:${test}`);
  audit("ORDER_CREATE", req.user.email, req.user.role, "lab", l.id, `${kind}:${test}`);
  persist();
  res.status(201).json(ok(l));
});
app.patch("/api/labs/:id", Auth.authRequired, Auth.requireRole("DOCTOR", "ADMIN", "CEO"), (req, res) => {
  const l = db.labs.find((x) => x.id === req.params.id);
  if (!l) return err(res, 404, "lab_not_found");
  const { status, result, performedBy } = req.body || {};
  if (status && !LAB_STATES.includes(status)) return err(res, 400, `status must be one of ${LAB_STATES.join(",")}`);
  if (status) l.status = status;
  if (result !== undefined) l.result = String(result).slice(0, 1000);
  if (performedBy !== undefined) l.performedBy = performedBy;
  if (["READY", "REVIEWED", "RELEASED"].includes(l.status) && !l.completedAt) l.completedAt = stamp();
  audit("LAB_UPDATE", req.user.email, req.user.role, "lab", l.id, l.status);
  if (["READY", "RELEASED"].includes(l.status)) {
    io.to(`patient:${l.patientId}`).emit("LAB_RESULT_UPDATED", l);
    io.emit("LAB_RESULT_UPDATED", l);
    notify(null, "Lab", `Có kết quả ${l.kind}`, `${l.test}: đã có kết quả`, { patientId: l.patientId });
  }
  persist();
  res.json(ok(l));
});

app.patch("/api/me/caregivers/:id", Auth.authRequired, Auth.requireRole("PATIENT"), (req, res) => {
  const g = db.grants.find((x) => x.id === req.params.id && x.patientId === req.user.patientId);
  if (!g) return err(res, 404, "grant_not_found");
  const { scopes, expiresAt } = req.body || {};
  if (scopes !== undefined) {
    if (!Array.isArray(scopes) || !scopes.every((s) => GRANT_SCOPES.includes(s)))
      return err(res, 400, `scopes must be subset of ${GRANT_SCOPES.join(",")}`);
    g.scopes = scopes;
  }
  if (expiresAt !== undefined) g.expiresAt = expiresAt || null;
  audit("GRANT_UPDATE", req.user.email, "PATIENT", "grant", g.id, (g.scopes || []).join(","));
  persist();
  res.json(ok(g));
});

/* ================= GLOBAL SEARCH (staff, kết quả lọc theo quyền) ================= */
app.get("/api/search", Auth.authRequired, Auth.requireRole("CEO", "ADMIN", "DOCTOR", "NURSE"), (req, res) => {
  const q = norm(req.query.q || "");
  if (q.length < 2) return err(res, 400, "q phải từ 2 ký tự");
  const { role, dept } = req.user;
  const inScope = (p) => role === "CEO" || role === "ADMIN" || deptMatch(dept, p);
  const hit = (s) => norm(s || "").includes(q);
  const emergencies = db.patients
    .filter((p) => inScope(p) && (hit(p.id) || hit(p.symptom) || hit(p.patientName)))
    .slice(0, 10)
    .map((p) => ({ id: p.id, symptom: p.symptom, severity: p.severity, department: p.department, status: p.status }));
  const appointments = (role === "CEO" || role === "ADMIN" ? db.appointments
    : db.appointments.filter((a) => (META.departments.find((d) => d.id === a.departmentId)?.specialty || "") && deptMatch(dept, { department: a.departmentId })))
    .filter((a) => hit(a.id) || hit(a.patientId) || hit(a.note)).slice(0, 10);
  const beds = db.beds.filter((b) => hit(b.id) || hit(b.ward) || hit(b.room)).slice(0, 10);
  const staff = META.doctors
    .filter((d) => role === "CEO" || role === "ADMIN" || d.department === dept)
    .filter((d) => hit(d.name) || hit(d.doctorId) || hit(d.specialty))
    .map((d) => ({ doctorId: d.doctorId, name: d.name, specialty: d.specialty, department: d.department, status: d.status }));
  audit("SEARCH", req.user.email, role, "search", q, `${emergencies.length + appointments.length + beds.length + staff.length} hits`);
  res.json(ok({ emergencies, appointments, beds, staff }));
});

/* ================= AI COPILOT (decision-support, RBAC-scoped) =================
 * AI chỉ đọc dữ liệu user được phép thấy. Mọi output: AI SUGGESTION + REVIEW REQUIRED.
 * Tuyệt đối: không chẩn đoán, không kê đơn, không quyết định y khoa. */
const AI_TAG = "AI SUGGESTION — REVIEW REQUIRED: cần người có thẩm quyền duyệt trước khi hành động y khoa.";
app.post("/api/ai/ask", Auth.authRequired, (req, res) => {
  const question = String(req.body?.question || "").slice(0, 500);
  const { role, dept, patientId, sub } = req.user;
  const q = norm(question);
  const at = stamp();
  const sources = [];
  let answer = "";
  let denied = false;

  const openStates = ["PENDING_TRIAGE", "DEPARTMENT_ROUTED", "DOCTOR_ACCEPTED", "IN_TREATMENT", "REFERRAL_PENDING", "DISPATCHED", "EN_ROUTE", "ARRIVED", "waiting", "treating", "referring"];
  const scopeEmergencies = () => {
    if (role === "CEO" || role === "ADMIN") return db.patients;
    if (role === "NURSE") return db.patients.filter((p) => norm(p.department || "").includes("cap cuu") || (p.deptKey || "") === "er");
    return db.patients.filter((p) => deptMatch(dept, p));
  };
  const freeBeds = (wardList) => db.beds.filter((b) => (!wardList || wardList.includes(b.ward)) && b.status === "AVAILABLE").length;

  if (role === "PATIENT" || role === "CAREGIVER") {
    // Patient: chỉ hồ sơ của mình; hỏi ca khác -> từ chối rõ ràng
    const mine = db.patients.filter((p) => p.patientId === patientId || (req.user.role === "CAREGIVER" && false));
    const myAppts = db.appointments.filter((a) => a.patientId === patientId);
    const myMeds = db.medications.filter((m) => m.patientId === patientId);
    if (has(q, "bn-", "p00") && !question.includes(patientId || "###")) {
      denied = true;
      answer = "Tôi chỉ được phép tóm tắt hồ sơ của chính bạn, không tra cứu ca của người khác. Hãy hỏi về lịch hẹn, thuốc hoặc triệu chứng của bạn nhé.";
    } else if (has(q, "lich hen", "appointment", "kham")) {
      answer = `Bạn có ${myAppts.length} lịch hẹn. ` + (myAppts[0] ? `Gần nhất: ${myAppts[0].date} ${myAppts[0].time} (${myAppts[0].type}) tại ${myAppts[0].location}. Hãy đến sớm 15 phút và mang BHYT.` : "Chưa có lịch nào — hỏi bác sĩ để đặt.");
      sources.push("GET /api/me/appointments (live)");
    } else if (has(q, "thuoc", "medication", "uong")) {
      const names = myMeds.filter((m) => m.status === "active").map((m) => `${m.name} ${m.dosage} (${m.schedule})`);
      answer = names.length ? `Thuốc đang dùng theo đơn: ${names.join("; ")}. Uống đúng giờ, không tự tăng/giảm liều — mọi thay đổi phải do bác sĩ quyết định.` : "Hiện không có đơn thuốc nào đang dùng.";
      sources.push("GET /api/me/medications (live)");
    } else {
      answer = `Tôi có thể giải thích thuật ngữ, lịch hẹn (${myAppts.length}) và thuốc (${myMeds.length}) của bạn, hoặc hướng dẫn chuẩn bị đi khám. Có dấu hiệu nguy kịch (đau ngực, khó thở, bất tỉnh) → bấm SOS / gọi 115 ngay, đừng chờ chat.`;
      sources.push("GET /api/me/medical-record (live)");
    }
  } else {
    // Staff: context lọc theo quyền
    const scoped = scopeEmergencies();
    const waiting = scoped.filter((p) => openStates.includes(p.status));
    const askPatient = (question.match(/#BN-\d+|P\d{3}/i) || [])[0];
    if (askPatient) {
      const target = db.patients.find((p) => p.id.toLowerCase() === askPatient.toLowerCase() || p.patientId === askPatient.toUpperCase());
      const allowed = target && (role === "CEO" || role === "ADMIN" || (role === "NURSE" ? (target.deptKey === "er") : deptMatch(dept, target)));
      if (!target || !allowed) {
        denied = true;
        answer = `Ca ${askPatient} nằm ngoài phạm vi quyền của bạn (${role}${dept ? "/" + dept : ""}) nên tôi không thể tóm tắt. Hãy nhờ đồng nghiệp có thẩm quyền.`;
      } else {
        answer = `Tóm tắt ${target.id} [${target.severity}] ${target.department} — trạng thái ${target.status}. Triệu chứng: ${target.symptom}. Sinh tồn: ♥${target.hr ?? "?"} SpO2 ${target.spo2 ?? "?"}%. Y lệnh: ${(target.clinicalNotes || []).length} ghi chú. Timeline BS: ${(target.statusTimeline || []).length} mốc.`;
        sources.push(`GET /api/emergency/${target.id} (live)`);
      }
    } else if (has(q, "qua tai", "overload", "khoa nao")) {
      const byDept = {};
      waiting.forEach((p) => { const d = p.department || "?"; byDept[d] = (byDept[d] || 0) + 1; });
      const top = Object.entries(byDept).sort((a, b) => b[1] - a[1])[0];
      answer = top ? `Khoa đông nhất trong phạm vi của bạn: ${top[0]} (${top[1]} ca chờ). Tổng ca chờ: ${waiting.length}.` : "Không có ca chờ trong phạm vi của bạn. 🎉";
      sources.push("Emergency queue realtime (live)");
    } else if (has(q, "giuong", "bed")) {
      const free = role === "CEO" || role === "ADMIN" ? freeBeds() : freeBeds(["ER", "ICU"]);
      answer = `Giường trống ${role === "CEO" || role === "ADMIN" ? "toàn viện" : "ER/ICU"}: ${free}. Chi tiết xem BedBoard.`;
      sources.push("GET /api/beds (live)");
    } else if (has(q, "cho", "waiting", "workload", "tinh hinh", "tong quan")) {
      const crit = waiting.filter((p) => p.severity === "critical").length;
      answer = `Trong phạm vi của bạn: ${waiting.length} ca chờ, trong đó ${crit} nguy kịch. Ưu tiên xử lý ca critical trước, sau đó theo ETA.`;
      sources.push("Emergency queue realtime (live)");
    } else if (has(q, "thuoc chua xac nhan", "pharmacy", "don thuoc")) {
      answer = "Mở tab Pharmacy để duyệt đơn theo workflow VERIFY → DISPENSE. Tôi không tự duyệt thay bạn.";
      sources.push("Pharmacy queue (live)");
    } else {
      answer = `Tôi hỗ trợ tóm tắt ca trong phạm vi ${role}${dept ? "/" + dept : ""}, tổng hợp workload, tra giường và phác thảo ghi chú (bạn phải REVIEW trước khi lưu). Hỏi thử: "khoa nào quá tải?", "còn bao nhiêu giường?", "tóm tắt #BN-205".`;
      sources.push("Hospital ops snapshot (live)");
    }
  }

  audit("AI_QUERY", req.user.email, role, "ai", question.slice(0, 60), denied ? "denied-scope" : "ok");
  res.json(ok({
    answer, sources, scope: role + (dept ? `/${dept}` : ""), at,
    tag: AI_TAG,
    denied,
    disclaimer: "AI ASSISTANCE — Please consult your healthcare professional. AI không chẩn đoán, không kê đơn, không quyết định y khoa.",
  }));
});

/* ================= ADMIN RESET (DEMO DATA) ================= */
const UserStore = require("./lib/userStore.js");
require("./lib/routesAdmin.js")({ app, Auth, Hospital, Perms2, UserStore,
  audit, auditRich, auditTrail, ok, err, stamp, rateLimit, idempotent });
require("./lib/routesV2.js")({ app, db, Auth, Hospital, Perms2, Bus, Care, Ops,
  audit, auditRich, auditTrail, notify, persist, ok, err, stamp, maybeAnomaly,
  rateLimit, idempotent });
app.post("/api/admin/reset", Auth.authRequired, Auth.requireRole("CEO"), (_req, res) => {
  db.patients.length = 0; db.appointments.length = 0; db.medications.length = 0;
  db.notifications.length = 0; db.beds.length = 0; db.grants.length = 0; db.labs.length = 0;
  db.patientProfiles.length = 0; db.billing.length = 0; auditTrail.length = 0;
  Care.seedCare(); Ops.seedOps();
  seedDemo();
  persist();
  audit("DB_RESET", "CEO", "CEO", "database", "-", "ok");
  res.json(ok({ patients: db.patients.length, beds: db.beds.length }));
});

/* ================= WebSockets (RBAC chặt) ================= */
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ORIGINS.includes("*") ? "*" : CORS_ORIGINS, methods: ["GET", "POST"] } });
// Event bus toàn hệ thống (§XXXVIII): audit giàu + socket + notification
Bus.init({ getIo: () => io, auditRich, notify });

// deptKey của bác sĩ có khớp ca bệnh không (CEO qua hết)
function deptMatch(doctorDept, patient) {
  if (!doctorDept || doctorDept === "ceo") return true;
  const key = norm(doctorDept);
  const vi = (DEPT_VI[doctorDept] && norm(DEPT_VI[doctorDept])) || "";
  const pd = norm(patient.department || "");
  return pd.includes(key) || pd.includes(vi) || key.includes(pd);
}

io.on("connection", (socket) => {
  // Token (nếu có) -> claims thật; không token vẫn cho qua (mobile app cũ)
  try {
    socket.claims = Auth.verifyToken(socket.handshake.auth?.token || socket.handshake.query?.token);
  } catch { socket.claims = null; }
  console.log(`[socket] client connected: ${socket.id}${socket.claims ? ` (${socket.claims.email})` : ""}`);

  // Join room: verify ownership trước khi cho vào (Patient A không subscribe room Patient B).
  // patient:{id}: BN đúng id, caregiver có grant, staff (trừ PATIENT/CAREGIVER).
  // emergency:{id}: như trên (mobile join caseId của mình).
  socket.on("JOIN", (room) => {
    if (typeof room !== "string" || !/^(patient|emergency):.+/.test(room)) return;
    const id = room.split(":")[1];
    const c = socket.claims;
    if (!c) { socket.emit("JOIN_DENIED", { room, reason: "unauthenticated" }); return; }
    let allow = false;
    if (c.role === "PATIENT") {
      allow = c.patientId === id || db.patients.some((p) => (p.id === id || p.uuid === id) && p.patientId === c.patientId);
    } else if (c.role === "CAREGIVER") {
      const now = Date.now();
      allow = db.grants.some((g) => g.caregiverId === c.sub && (!g.expiresAt || new Date(g.expiresAt).getTime() > now) && g.patientId === id);
    } else {
      allow = true; // staff dùng room nghiệp vụ (RBAC nội dung vẫn check ở API/event)
    }
    if (!allow) {
      socket.emit("JOIN_DENIED", { room, reason: "not-owner" });
      audit("SOCKET_JOIN_DENIED", c.email, c.role, "room", room, "denied");
      return;
    }
    socket.join(room);
  });

  // Token claims thắng payload client (chống giả mạo khoa); legacy string id giữ compat
  socket.on("ACCEPT_PATIENT", (payload) => {
    const data = typeof payload === "string" ? { emergencyId: payload } : payload || {};
    const p = db.patients.find((x) => x.id === data.emergencyId);
    if (!p) return;
    const claims = socket.claims;
    const dept = claims?.dept || data.doctorDept;
    const ceo = claims?.role === "CEO" || claims?.role === "ADMIN" || data.isCeo;
    const actor = claims?.email || data.doctorId || "doctor";
    if (dept && !deptMatch(dept, p) && !ceo) {
      socket.emit("ACTION_DENIED", { reason: "WRONG_DEPARTMENT", id: p.id, need: p.department });
      audit("ACCEPT_PATIENT", actor, claims?.role || "?", "emergency", p.id, "denied:wrong-dept");
      console.log(`[rbac] DENIED ${actor} (${dept}) -> ${p.id} (${p.department})`);
      return;
    }
    p.status = "DOCTOR_ACCEPTED";
    p.emState = "DOCTOR_ACCEPTED";
    p.assignedDoctor = actor;
    db.stats.icu.free = Math.max(0, db.stats.icu.free - 1);
    log(p, "DOCTOR_ACCEPTED", p.assignedDoctor);
    console.log(`[socket] accepted ${p.id} -> ICU free=${db.stats.icu.free}`);
    io.emit("EMERGENCY_UPDATED", p);
    io.emit("UPDATE_RESOURCES", { stats: db.stats, acceptedId: p.id });
  });

  // Chuyển tuyến trên: { emergencyId, targetHospital, reason, doctorId }
  socket.on("REQUEST_UPWARD_REFERRAL", (data = {}) => {
    const p = db.patients.find((x) => x.id === data.emergencyId);
    if (!p) return;
    p.status = "REFERRAL_PENDING";
    p.referralData = { hospital: data.targetHospital || {}, reason: data.reason || "", by: data.doctorId || "doctor", at: stamp() };
    p.referral = { hospital: data.targetHospital || {}, reason: data.reason || "" };
    log(p, "REFERRAL_PENDING", data.doctorId || "doctor");
    io.emit("EMERGENCY_UPDATED", p);
    io.emit("CEO_ALERT", { type: "REFERRAL", id: p.id, hospital: p.referralData.hospital?.name, at: stamp() });
    console.log(`[referral] ${p.id} -> ${p.referralData.hospital?.name}`);
  });

  // CEO override: { targetDept?, emergencyId?, note?, actorRole } — chỉ CEO
  socket.on("OVERRIDE_EMERGENCY", (data = {}) => {
    if (data.actorRole !== "ceo" && !data.isCeo) {
      socket.emit("ACTION_DENIED", { reason: "CEO_ONLY" });
      return;
    }
    if (data.emergencyId) {
      const p = db.patients.find((x) => x.id === data.emergencyId);
      if (p && data.targetDept) {
        p.department = data.targetDept;
        p.deptKey = norm(data.targetDept);
        log(p, "CEO_OVERRIDE_REASSIGN", "CEO");
        io.emit("EMERGENCY_UPDATED", p);
      }
    }
    io.emit("CEO_OVERRIDE", { ...data, at: stamp() });
    console.log(`[ceo] OVERRIDE`, JSON.stringify(data));
  });

  socket.on("disconnect", () => console.log(`[socket] client disconnected: ${socket.id}`));
});

// 404 JSON cho mọi /api/* chưa định nghĩa (không HTML) + 500 JSON không stack trace (§21).
app.use("/api", (req, res) => res.status(404).json({ success: false, data: null, error: "not found", code: "NOT_FOUND", requestId: req.id || null, timestamp: new Date().toISOString() }));
// eslint-disable-next-line no-unused-vars
app.use((e, req, res, _next) => {
  console.error(`[error] ${new Date().toISOString()} ${req.id} ${req.method} ${req.path}`, e);
  if (res.headersSent) return;
  res.status(500).json({ success: false, data: null, error: "Internal server error", code: "INTERNAL", requestId: req.id || null, timestamp: new Date().toISOString() });
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`[backend] Triage AI API live on http://localhost:${PORT} [${ENV}]`));
}
module.exports = { app, server, io, db };

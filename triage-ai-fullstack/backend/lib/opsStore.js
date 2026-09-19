/**
 * lib/opsStore — Kho vận hành (DEMO/MOCK/SEEDED):
 * resources (tồn kho theo Tòa/Tầng/Khoa/Phòng/Kho + batch/hạn dùng),
 * approval 2 cấp, documents (văn thư), capacity, anomaly cases,
 * health links/timeline, BHYT verifications, version manifest, nearby hospitals.
 */
"use strict";

const stores = {
  resources: [], // {id RES-..., name, type, unit, qty, minQty, alertQty, batch, expiry, building, floor, department, room, manager, status, history[], updatedAt}
  approvals: [], // {id APR-..., kind RESOURCE|DOCUMENT|REFUND, refId, qtyBefore, qtyAfter, reason, state DRAFT|SUBMITTED|PENDING_APPROVAL|APPROVED|ACTIVE|REJECTED, createdBy, submittedBy, approvedBy, ...}
  documents: [], // {id CV-..., direction IN|OUT, title, status RECEIVED|PROCESSING|PENDING_APPROVAL|DONE|OVERDUE, deadline, handler, ...}
  capacity: [], // {department, status NORMAL|BUSY|FULL|CRITICAL|EMERGENCY, openSlots, bedsFree, bedsTotal, threshold, updatedAt, updatedBy}
  anomalyCases: [], // {id ANO-..., signals[], state OPEN|REVIEWING|RESOLVED|DISMISSED, severity, subject, note, ...}
  healthLinks: [], // {patientId, source WEARABLE|PLATFORM, device, connected, permission, lastSync, dataSource}
  healthPoints: [], // {patientId, kind HEART_RATE|STEPS|SLEEP|SPO2|ACTIVITY, value, unit, at, source DEVICE|PATIENT|HOSPITAL|DOCTOR}
  bhytChecks: [], // {patientId, code, status VERIFYING|VERIFIED|EXPIRED|INVALID|UNAVAILABLE|MANUAL_REVIEW, source, verifiedBy, at}
  loginAttempts: [], // {email, ok, at} — phục vụ anomaly (giữ 200 bản ghi)
};

const counters = { res: 1, apr: 1, doc: 12, ano: 1 };
const pad = (n, w = 4) => String(n).padStart(w, "0");

const RESOURCE_STATES = ["NORMAL", "LOW", "CRITICAL", "OUT_OF_STOCK", "EXPIRED", "QUARANTINED"];
const APPROVAL_STATES = ["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "APPROVED", "ACTIVE", "REJECTED"];
const DOC_STATES = ["RECEIVED", "PROCESSING", "PENDING_APPROVAL", "DONE", "OVERDUE"];
const CAPACITY_STATES = ["NORMAL", "BUSY", "FULL", "CRITICAL", "EMERGENCY"];
const BHYT_STATES = ["VERIFYING", "VERIFIED", "EXPIRED", "INVALID", "UNAVAILABLE", "MANUAL_REVIEW"];

function resourceStatus(r) {
  if (r.quarantined) return "QUARANTINED";
  if (r.expiry && new Date(r.expiry) < new Date()) return "EXPIRED";
  if (r.qty <= 0) return "OUT_OF_STOCK";
  if (r.qty <= (r.minQty || 0)) return "CRITICAL";
  if (r.qty <= (r.alertQty || 0)) return "LOW";
  return "NORMAL";
}

function reset() {
  for (const k of Object.keys(stores)) stores[k].length = 0;
  counters.res = 1; counters.apr = 1; counters.doc = 12; counters.ano = 1;
}
function snapshot() {
  return { resources: stores.resources, approvals: stores.approvals, documents: stores.documents,
    capacity: stores.capacity, anomalyCases: stores.anomalyCases, healthLinks: stores.healthLinks,
    healthPoints: stores.healthPoints, bhytChecks: stores.bhytChecks,
    loginAttempts: stores.loginAttempts.slice(-200), opsCounters: { ...counters } };
}
function restore(snap = {}) {
  reset();
  for (const k of Object.keys(stores)) if (Array.isArray(snap[k])) stores[k].push(...snap[k]);
  if (snap.opsCounters) Object.assign(counters, snap.opsCounters);
}

/** Seed tối thiểu: vaccine INDIRAK 20 lọ + vật tư + công văn + capacity (DEMO DATA). */
function seedOps() {
  reset();
  stores.resources.push(
    { id: `RES-${pad(counters.res++)}`, name: "INDIRAK Vaccine kháng dại", type: "VACCINE", unit: "lọ",
      qty: 20, minQty: 5, alertQty: 10, batch: "IND-2026-01", expiry: "2027-06-30",
      building: "C", floor: 2, department: "vaccination", room: "Phòng tiêm ngừa",
      manager: "vaccine.lead.demo", quarantined: false, status: "NORMAL",
      history: [], updatedAt: new Date().toISOString(), isDemo: true },
    { id: `RES-${pad(counters.res++)}`, name: "Máu O (túi)", type: "BLOOD", unit: "túi",
      qty: 3, minQty: 4, alertQty: 8, batch: "BLD-O-26", expiry: "2026-11-15",
      building: "B", floor: 2, department: "icu", room: "Blood Bank",
      manager: "icu.head.demo", quarantined: false, status: "LOW",
      history: [], updatedAt: new Date().toISOString(), isDemo: true },
  );
  stores.documents.push(
    { id: `CV-2026-${pad(counters.doc++, 4)}`, direction: "IN", title: "Công văn hướng dẫn tiêm chủng mở rộng (demo)",
      status: "PROCESSING", deadline: "2026-10-05", handler: "admin.manager.demo",
      createdAt: new Date().toISOString(), isDemo: true },
  );
  for (const d of ["emergency", "icu", "cardiology", "lab"]) {
    stores.capacity.push({ department: d, status: "NORMAL", openSlots: 5, bedsFree: 3, bedsTotal: 10,
      threshold: 90, updatedAt: new Date().toISOString(), updatedBy: "system" });
  }
}

const VERSION = {
  app: "patient-app",
  currentVersion: "1.4.0",
  latestVersion: "1.5.0",
  minSupported: "1.4.0",
  mode: "OPTIONAL_UPDATE", // OPTIONAL_UPDATE | FORCED_UPDATE
  message: "Có phiên bản mới 1.5.0. Cập nhật ngay hoặc để sau (chưa phát hành CH Play/App Store).",
  // Chỉ dùng FORCED_UPDATE cho trường hợp bắt buộc tương thích/bảo mật (cấu hình riêng).
  forced: false,
};

// Danh mục bệnh viện demo cho "tìm bệnh viện gần nhất" (DEMO/SIMULATED —
// khoảng cách/ETA minh họa, KHÔNG phải dữ liệu realtime xác thực).
const NEARBY_HOSPITALS = [
  { id: "H-DEMO1", name: "BVĐK TW DEMO1", address: "123 Đường Demo, Q.1", phone: "1900-DEMO",
    lat: 10.7769, lng: 106.7009, specialties: ["Cấp cứu", "Tim mạch", "Ngoại"], emergency: true, demoDistanceKm: 2.3, demoEtaMin: 8 },
  { id: "H-QX", name: "Bệnh viện Quận X (demo)", address: "45 Đường Demo, Q.X", phone: "028-0000",
    lat: 10.7869, lng: 106.7109, specialties: ["Đa khoa"], emergency: true, demoDistanceKm: 4.1, demoEtaMin: 12 },
];

module.exports = { stores, counters, RESOURCE_STATES, APPROVAL_STATES, DOC_STATES,
  CAPACITY_STATES, BHYT_STATES, resourceStatus, reset, snapshot, restore, seedOps,
  VERSION, NEARBY_HOSPITALS };

/**
 * lib/careStore — Kho dữ liệu nghiệp vụ chăm sóc (DEMO/MOCK/SEEDED):
 * PATIENT -> ENCOUNTER -> ORDER -> RESULT -> NOTE -> PRESCRIPTION ->
 * BILL/PAYMENT -> DISPENSE -> FOLLOW-UP -> PATIENT APP.
 * Mọi bản ghi truy ngược được về bệnh nhân/ca/BS/khoa/thời gian/người thao tác.
 */
"use strict";

const stores = {
  registry: [], // bệnh nhân统一 {patientId, fullName, cccd, dob, gender, phone, address, bloodType, ...}
  encounters: [], // {id ENC-..., patientId, department, building, doctor, status, ...}
  notes: [], // clinical notes {id, encounterId, by, text, kind, aiSuggested, confirmed, at}
  diagnoses: [], // {id, encounterId, code, text, by, at}
  careOrders: [], // {id ORD-..., encounterId, kind LAB|IMAGING|PROCEDURE|MEDICATION|OTHER, ...status}
  results: [], // {id RES-..., orderId, encounterId, ...status DRAFT|VERIFIED|RELEASED}
  prescriptions: [], // {id RX-..., encounterId, items[], status DRAFT|APPROVED|DISPENSED}
  bills: [], // {id BILL-..., encounterId, items[], total, status}
  payments: [], // {id PAY-..., billId, method QR|CASH|TRANSFER, status UNPAID|PENDING|PAID|FAILED|EXPIRED|REFUNDED, qr, ...}
  followups: [], // {id FU-..., encounterId, patientId, date, ...}
  sosCases: [], // {id SOS-..., patientId, status SOS_REQUESTED|ACKNOWLEDGED|DISPATCHING|EN_ROUTE|ARRIVED|CLOSED, gps, ...}
  medSchedules: [], // {id MS-..., prescriptionId, patientId, doses[{time, state SCHEDULED|REMINDER|PENDING|TAKEN|MISSED}]}
};

const counters = { enc: 142, ord: 1, res: 1, rx: 1, bill: 1, pay: 192, fu: 1, sos: 1, ms: 1, reg: 100, note: 1, dx: 1 };
const pad = (n, w = 5) => String(n).padStart(w, "0");
const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

function nextEncounterId() { return `ENC-${today()}-${pad(counters.enc++)}`; }
function nextOrderId() { return `ORD-${today()}-${pad(counters.ord++, 4)}`; }
function nextResultId() { return `RES-${today()}-${pad(counters.res++, 4)}`; }
function nextRxId() { return `RX-${today()}-${pad(counters.rx++, 4)}`; }
function nextBillId() { return `BILL-${today()}-${pad(counters.bill++, 4)}`; }
function nextPayId() { return `PAY-${new Date().getFullYear()}-${pad(counters.pay++, 5)}`; }
function nextFollowupId() { return `FU-${today()}-${pad(counters.fu++, 4)}`; }
function nextSosId() { return `SOS-${today()}-${pad(counters.sos++, 4)}`; }
function nextMsId() { return `MS-${today()}-${pad(counters.ms++, 4)}`; }
function nextPatientId() { return `P${pad(counters.reg++, 3)}`; }

// ENCOUNTER statuses (tiếp nhận): REGISTERED|WAITING|IN_EXAM|COMPLETED|REJECTED|REFERRED|EMERGENCY|ADMITTED|DISCHARGED
const ENCOUNTER_STATES = ["REGISTERED", "WAITING", "IN_EXAM", "COMPLETED", "REJECTED", "REFERRED", "EMERGENCY", "ADMITTED", "DISCHARGED"];
const SOS_STATES = ["SOS_REQUESTED", "ACKNOWLEDGED", "DISPATCHING", "EN_ROUTE", "ARRIVED", "CLOSED"];
const PAY_STATES = ["UNPAID", "PENDING", "PAID", "FAILED", "EXPIRED", "REFUNDED"];
const DOSE_STATES = ["SCHEDULED", "REMINDER", "PENDING", "TAKEN", "MISSED"];

function reset() {
  for (const k of Object.keys(stores)) stores[k].length = 0;
  counters.enc = 142; counters.ord = 1; counters.res = 1; counters.rx = 1;
  counters.bill = 1; counters.pay = 192; counters.fu = 1; counters.sos = 1;
  counters.ms = 1; counters.reg = 100; counters.note = 1; counters.dx = 1;
}
function snapshot() {
  return { registry: stores.registry, encounters: stores.encounters, notes: stores.notes, diagnoses: stores.diagnoses,
    careOrders: stores.careOrders, results: stores.results, prescriptions: stores.prescriptions,
    bills: stores.bills, payments: stores.payments, followups: stores.followups,
    sosCases: stores.sosCases, medSchedules: stores.medSchedules, careCounters: { ...counters } };
}
function restore(snap = {}) {
  reset();
  for (const k of Object.keys(stores)) if (Array.isArray(snap[k])) stores[k].push(...snap[k]);
  if (snap.careCounters) Object.assign(counters, snap.careCounters);
}

/** CARE JOURNEY của 1 encounter — mỗi chặng truy ngược đầy đủ. */
function journey(encounterId) {
  const enc = stores.encounters.find((e) => e.id === encounterId);
  if (!enc) return null;
  const byEnc = (arr) => arr.filter((x) => x.encounterId === encounterId);
  const steps = [
    { key: "intake", label: "Tiếp nhận", at: enc.createdAt, done: true },
    { key: "exam", label: "Khám", at: enc.examAt || null, done: !!enc.examAt },
    { key: "diagnosis", label: "Chẩn đoán", at: null, done: byEnc(stores.diagnoses).length > 0 },
    { key: "orders", label: "Chỉ định", at: null, done: byEnc(stores.careOrders).length > 0 },
    { key: "results", label: "Kết quả", at: null, done: byEnc(stores.results).some((r) => r.status === "RELEASED") },
    { key: "prescription", label: "Kê đơn", at: null, done: byEnc(stores.prescriptions).length > 0 },
    { key: "payment", label: "Thanh toán", at: null, done: byEnc(stores.payments).some((p) => p.status === "PAID") },
    { key: "dispense", label: "Nhận thuốc", at: null, done: byEnc(stores.prescriptions).some((p) => p.status === "DISPENSED") },
    { key: "followup", label: "Tái khám", at: null, done: byEnc(stores.followups).length > 0 },
  ];
  return { encounter: enc, steps,
    notes: byEnc(stores.notes), diagnoses: byEnc(stores.diagnoses),
    orders: byEnc(stores.careOrders), results: byEnc(stores.results),
    prescriptions: byEnc(stores.prescriptions), bills: byEnc(stores.bills),
    payments: byEnc(stores.payments), followups: byEnc(stores.followups) };
}

/** Seed demo tối thiểu cho dashboard/command (DEMO DATA). */
function seedCare() {
  reset();
  stores.registry.push(
    { patientId: "P001", fullName: "Nguyễn Văn A", cccd: "0790DEMO001", dob: "1980-05-12", gender: "Nam",
      phone: "0901000001", address: "Q.1 (demo)", bloodType: "O",
      bhyt: { code: "DN1234567890123", provider: "BVĐK TW DEMO1", expiresAt: "2026-12-31", status: "VERIFIED" },
      allergies: ["Penicillin"], conditions: ["Tăng huyết áp"], isDemo: true },
    { patientId: "P002", fullName: "Trần Thị B", cccd: "0790DEMO002", dob: "1992-08-20", gender: "Nữ",
      phone: "0901000002", address: "Q.5 (demo)", bloodType: "A",
      bhyt: { code: "", provider: "", expiresAt: "", status: "UNAVAILABLE" },
      allergies: [], conditions: [], isDemo: true },
  );
  const enc = { id: nextEncounterId(), patientId: "P001", department: "cardio", building: "C",
    doctor: "doctor.cardio@hospital.demo", status: "IN_EXAM", createdAt: new Date().toISOString(),
    examAt: new Date().toISOString(), isDemo: true };
  stores.encounters.push(enc);
  stores.diagnoses.push({ id: `DX-${pad(counters.dx++, 4)}`, encounterId: enc.id, code: "I21 (demo)",
    text: "Theo dõi hội chứng mạch vành cấp (demo)", by: enc.doctor, at: new Date().toISOString() });
  const ord = { id: nextOrderId(), encounterId: enc.id, patientId: "P001", kind: "LAB",
    test: "ECG + Troponin", status: "ORDERED", orderedBy: enc.doctor, createdAt: new Date().toISOString() };
  stores.careOrders.push(ord);
  stores.results.push({ id: nextResultId(), orderId: ord.id, encounterId: enc.id, patientId: "P001",
    summary: "ECG: ST chênh (demo)", status: "RELEASED", verifiedBy: enc.doctor, releasedAt: new Date().toISOString() });
}

module.exports = { stores, counters, nextEncounterId, nextOrderId, nextResultId, nextRxId,
  nextBillId, nextPayId, nextFollowupId, nextSosId, nextMsId, nextPatientId,
  ENCOUNTER_STATES, SOS_STATES, PAY_STATES, DOSE_STATES,
  reset, snapshot, restore, journey, seedCare };

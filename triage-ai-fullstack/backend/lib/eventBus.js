/**
 * lib/eventBus — Event thống nhất liên kết toàn hệ thống (§XXXVIII).
 * Hospital Event -> Backend Event -> Notification Service -> Patient App.
 * Các module KHÔNG gọi trực tiếp lẫn nhau; emit event qua bus này.
 */
"use strict";

const EVENT_TYPES = [
  "PATIENT_REGISTERED", "ENCOUNTER_CREATED", "ENCOUNTER_UPDATED", "TRIAGE_CREATED",
  "PATIENT_ADMITTED", "PATIENT_TRANSFERRED", "PATIENT_DISCHARGED",
  "LAB_ORDER_CREATED", "LAB_RESULT_VERIFIED", "LAB_RESULT_RELEASED",
  "IMAGING_ORDER_CREATED", "IMAGING_RESULT_RELEASED",
  "PRESCRIPTION_CREATED", "PRESCRIPTION_APPROVED", "MEDICATION_DISPENSED",
  "PAYMENT_CREATED", "PAYMENT_CONFIRMED",
  "FOLLOWUP_CREATED",
  "RESOURCE_LOW", "RESOURCE_CRITICAL", "RESOURCE_APPROVED",
  "SOS_CREATED", "SOS_ACKNOWLEDGED", "SOS_DISPATCHING", "SOS_ARRIVED", "SOS_CLOSED",
  "DOCUMENT_RECEIVED", "DOCUMENT_APPROVED",
  "ANOMALY_DETECTED",
];

// event -> socket room suffix cho Patient App realtime
const PATIENT_EVENTS = new Set([
  "FOLLOWUP_CREATED", "LAB_RESULT_RELEASED", "IMAGING_RESULT_RELEASED",
  "PRESCRIPTION_CREATED", "MEDICATION_DISPENSED", "PAYMENT_CREATED", "PAYMENT_CONFIRMED",
  "SOS_CREATED", "SOS_ACKNOWLEDGED", "SOS_DISPATCHING", "SOS_ARRIVED", "SOS_CLOSED",
]);

let deps = null;
function init({ getIo, auditRich, notify }) {
  deps = { getIo, auditRich, notify };
}

/**
 * emit(type, {actor, role, resource, resourceId, patientId, emergencyId, dept,
 *   before, after, why, where, title, body, toUserId, category})
 */
function emit(type, p = {}) {
  if (!EVENT_TYPES.includes(type)) throw new Error(`unknown event: ${type}`);
  const entry = {
    action: type,
    actor: p.actor || "system",
    role: p.role || "SYSTEM",
    resource: p.resource || "",
    resourceId: p.resourceId || "",
    result: p.result || "ok",
    where: p.where || "",
    before: p.before ?? null,
    after: p.after ?? null,
    why: p.why || "",
  };
  if (deps && deps.auditRich) deps.auditRich(entry);
  try {
    const io = deps && deps.getIo ? deps.getIo() : null;
    if (io) {
      io.emit(type, { type, ...p, at: new Date().toISOString() });
      // Patient App realtime: phòng riêng + kênh chung
      if (PATIENT_EVENTS.has(type) && (p.patientId || p.emergencyId)) {
        const id = p.patientId || p.emergencyId;
        io.to(`patient:${id}`).emit(type, { type, ...p });
        io.to(`emergency:${id}`).emit(type, { type, ...p });
      }
    }
  } catch {}
  try {
    if (deps && deps.notify && (p.title || p.body)) {
      deps.notify(p.toUserId || null, p.category || "System", p.title || type, p.body || "",
        { patientId: p.patientId || null, emergencyId: p.emergencyId || null, dept: p.dept || null });
    }
  } catch {}
  return entry;
}

module.exports = { EVENT_TYPES, PATIENT_EVENTS, init, emit };

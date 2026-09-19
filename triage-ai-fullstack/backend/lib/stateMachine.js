/**
 * lib/stateMachine — validate chuyển trạng thái SOS (frontend KHÔNG được nhảy cóc).
 * NORMAL-track:  CREATED -> SCREENING -> NORMAL -> ACTIVE -> DISPATCHED
 *   -> EN_ROUTE -> ARRIVED -> RESOLVED
 * FLAGGED-track: CREATED -> SCREENING -> FLAGGED -> ACTIVE (approve) | DISMISSED
 */
const TRANSITIONS = {
  CREATED: ["SCREENING"],
  SCREENING: ["NORMAL", "FLAGGED"],
  NORMAL: ["ACTIVE"],
  FLAGGED: ["ACTIVE", "DISMISSED"],
  ACTIVE: ["DISPATCHED", "DOCTOR_ACCEPTED", "REFERRAL_PENDING", "RESOLVED"],
  DISPATCHED: ["EN_ROUTE", "DOCTOR_ACCEPTED"],
  EN_ROUTE: ["ARRIVED"],
  ARRIVED: ["IN_TREATMENT", "RESOLVED"],
  DOCTOR_ACCEPTED: ["IN_TREATMENT", "REFERRAL_PENDING", "TRANSFERRED", "COMPLETED"],
  IN_TREATMENT: ["REFERRAL_PENDING", "TRANSFERRED", "COMPLETED", "RESOLVED"],
  REFERRAL_PENDING: ["TRANSFERRED", "RESOLVED"],
  TRANSFERRED: [],
  COMPLETED: [],
  RESOLVED: [],
  DISMISSED: [],
};

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const err = new Error(`invalid transition ${from} -> ${to}`);
    err.status = 400;
    throw err;
  }
}

// Timeline trạng thái bệnh nhân (doctor -> patient), thứ tự chuẩn
const PATIENT_TIMELINE = ["WAITING", "TRIAGED", "DOCTOR_ASSIGNED", "PREPARING_OR", "AMBULANCE_DISPATCHED", "IN_TREATMENT", "RECOVERING", "DISCHARGED"];
function validTimelineState(s) { return PATIENT_TIMELINE.includes(s); }

module.exports = { TRANSITIONS, canTransition, assertTransition, PATIENT_TIMELINE, validTimelineState };

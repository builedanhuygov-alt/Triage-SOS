/**
 * shared/api-contracts — DTO + enums dùng chung backend/web/mobile.
 * Đổi contract ở đây TRƯỚC, cả 3 phía cùng theo (tránh mỗi nơi 1 kiểu).
 */
module.exports = {
  ROLES: ["CEO", "ADMIN", "DOCTOR", "NURSE", "PATIENT", "CAREGIVER"],

  // Máy trạng thái screening SOS (mới) — chạy song song status chăm sóc cũ
  EM_STATES: ["CREATED", "SCREENING", "NORMAL", "FLAGGED", "ACTIVE", "DISPATCHED", "EN_ROUTE", "ARRIVED", "RESOLVED", "DISMISSED"],

  // Trạng thái chăm sóc (giữ nguyên để dashboard/app cũ chạy)
  CARE_STATUS: ["PENDING_TRIAGE", "DEPARTMENT_ROUTED", "DOCTOR_ACCEPTED", "IN_TREATMENT", "REFERRAL_PENDING", "TRANSFERRED", "COMPLETED"],

  // Timeline trạng thái bệnh nhân (doctor -> patient)
  PATIENT_TIMELINE: ["WAITING", "TRIAGED", "DOCTOR_ASSIGNED", "PREPARING_OR", "AMBULANCE_DISPATCHED", "IN_TREATMENT", "RECOVERING", "DISCHARGED"],

  SOCKET_EVENTS: {
    // server -> clients
    NEW_EMERGENCY: "NEW_EMERGENCY",           // legacy, giữ
    EMERGENCY_CREATED: "EMERGENCY_CREATED",
    EMERGENCY_FLAGGED: "EMERGENCY_FLAGGED",
    EMERGENCY_APPROVED: "EMERGENCY_APPROVED",
    EMERGENCY_UPDATED: "EMERGENCY_UPDATED",   // có sẵn
    EMERGENCY_STATUS_UPDATED: "EMERGENCY_STATUS_UPDATED",
    UPDATE_RESOURCES: "UPDATE_RESOURCES",     // legacy, giữ
    CEO_ALERT: "CEO_ALERT",                   // có sẵn
    ACTION_DENIED: "ACTION_DENIED",           // có sẵn
    CEO_OVERRIDE: "CEO_OVERRIDE",             // có sẵn
    PATIENT_STATUS_UPDATED: "PATIENT_STATUS_UPDATED",
    GPS_LOCATION_UPDATED: "GPS_LOCATION_UPDATED",
    APPT_CREATED: "APPT_CREATED",
    APPT_UPDATED: "APPT_UPDATED",
    APPT_CANCELLED: "APPT_CANCELLED",
    MEDICATION_UPDATED: "MEDICATION_UPDATED",
    BED_UPDATED: "BED_UPDATED",
    REFERRAL_UPDATED: "REFERRAL_UPDATED",
    NOTIFICATION_CREATED: "NOTIFICATION_CREATED",
    // clients -> server
    ACCEPT_PATIENT: "ACCEPT_PATIENT",
    REQUEST_UPWARD_REFERRAL: "REQUEST_UPWARD_REFERRAL",
    OVERRIDE_EMERGENCY: "OVERRIDE_EMERGENCY",
    JOIN: "JOIN",                             // join room patient:{id} / emergency:{id}
  },

  DEMO_USERS: [
    { email: "ceo@hospital.demo", role: "CEO" },
    { email: "admin@hospital.demo", role: "ADMIN" },
    { email: "doctor.er@hospital.demo", role: "DOCTOR", dept: "er" },
    { email: "doctor.cardio@hospital.demo", role: "DOCTOR", dept: "cardio" },
    { email: "patient@hospital.demo", role: "PATIENT" },
    { email: "caregiver@hospital.demo", role: "CAREGIVER" },
    { email: "nurse@hospital.demo", role: "NURSE" },
  ],
};

// Export dữ liệu DEMO1 ra JSON để pipeline Excel đọc (single source of truth).
const fs = require("fs");
const path = require("path");
const H = require("../lib/hospital.js");
const Auth = require("../lib/auth.js");
const Care = require("../lib/careStore.js");
const Ops = require("../lib/opsStore.js");
Care.seedCare(); Ops.seedOps();

const patientScenarios = {
  P001: { department: "Khoa Tim mạch", doctor: "BS. Tim mạch", building: "C", appointment: "2026-10-02 14:30", caregiver: "caregiver.demo.01", scenario: "Ngoại trú Tim mạch: appointment + lab + medication + notification" },
  P002: { department: "Khoa Cấp cứu", doctor: "BS. Cấp cứu", building: "B", appointment: "2026-10-05 08:30", caregiver: "caregiver.demo.02", scenario: "Hồ sơ cấp cứu: imaging + medication + follow-up" },
  P003: { department: "Khoa Tim mạch", doctor: "BS. Tim mạch", building: "C", appointment: "2026-10-07 10:00", caregiver: "caregiver.demo.03", scenario: "Patient có caregiver: grant access + appointment + medication" },
};

const out = {
  hospital: H.HOSPITAL_NAME,
  banner: H.DEMO_BANNER,
  demoPassword: H.DEMO_PASSWORD,
  buildings: H.BUILDINGS,
  departments: H.DEPARTMENTS,
  roles: H.ROLES,
  permissions: H.PERMISSIONS,
  rolePermissions: H.ROLE_PERMISSIONS,
  users: H.USERS,
  summary: H.summary(),
  doctors: H.doctors(),
  patientDemo: Auth.USERS.filter((u) => u.role === "PATIENT" && u.demo).map((u) => ({
    patientId: u.patientId, medicalId: u.medicalId, name: u.name, username: u.email,
    demoPassword: u.password, ...patientScenarios[u.patientId],
  })),
  caregiverDemo: Auth.USERS.filter((u) => u.role === "CAREGIVER" && u.demo).map((u) => ({
    caregiverId: u.id, name: u.name, username: u.email, demoPassword: u.password,
    linkedPatient: u.linkedPatientId,
  })),
  patients: Care.stores.registry,
  resources: Ops.stores.resources,
};
const dest = process.argv[2] || path.join(__dirname, "..", "..", "..", "check-hospital.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 1), "utf8");
console.log(`exported ${H.USERS.length} users -> ${dest}`);

/**
 * RBAC + department mapping cho Command Center (7 khoa).
 * Role: ceo (toàn viện) | er | cardio | trauma | respiratory | neuro | icu.
 * ICU: giám sát mọi ca critical (đúng nghiệp vụ hồi sức).
 */
export const ROLES = {
  ceo: { id: "ceo", label: "Ban Giám đốc", short: "CEO", icon: "crown", color: "text-amber-300" },
  admin: { id: "admin", label: "Điều phối Admin", short: "ADMIN", icon: "shield", color: "text-blue-300" },  er: { id: "er", label: "BS Khoa Cấp cứu", short: "ER", icon: "siren", color: "text-rose-400" },
  cardio: { id: "cardio", label: "BS Khoa Tim mạch", short: "Cardio", icon: "heart", color: "text-pink-400" },
  trauma: { id: "trauma", label: "BS Khoa Chấn thương", short: "Trauma", icon: "bone", color: "text-orange-400" },
  respiratory: { id: "respiratory", label: "BS Khoa Hô hấp", short: "Hô hấp", icon: "lungs", color: "text-cyan-300" },
  neuro: { id: "neuro", label: "BS Khoa Thần kinh", short: "Neuro", icon: "brain", color: "text-violet-300" },
  icu: { id: "icu", label: "BS Hồi sức tích cực", short: "ICU", icon: "activity", color: "text-emerald-300" },
  nurse: { id: "nurse", label: "Điều dưỡng trực", short: "NURSE", icon: "activity", color: "text-teal-300" },
};

export const DEPTS = {
  er: { id: "er", label: "Cấp cứu" },
  cardio: { id: "cardio", label: "Tim mạch" },
  trauma: { id: "trauma", label: "Chấn thương" },
  respiratory: { id: "respiratory", label: "Hô hấp" },
  neuro: { id: "neuro", label: "Thần kinh" },
  icu: { id: "icu", label: "Hồi sức tích cực" },
};

// Giường demo theo khoa (CEO xem tổng toàn viện từ backend)
export const DEPT_BEDS = {
  er: { free: 4, total: 12 },
  cardio: { free: 2, total: 8 },
  trauma: { free: 3, total: 10 },
  respiratory: { free: 5, total: 10 },
  neuro: { free: 3, total: 6 },
  icu: { free: 6, total: 10 },
};

const norm = (s = "") =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");

/** Map department (TV, từ mobile app) -> dept key. */
export function deptOf(patient = {}) {
  const d = norm(patient.department || "");
  if (d.includes("tim")) return "cardio";
  if (d.includes("chan thuong") || d.includes("xuong khop")) return "trauma";
  if (d.includes("ho hap") || d.includes("phoi")) return "respiratory";
  if (d.includes("than kinh") || d.includes("dot quy") || d.includes("nao")) return "neuro";
  if (d.includes("hoi suc")) return "icu";
  // Fallback theo triệu chứng
  const s = norm(patient.symptom || "");
  if (s.includes("nguc") || s.includes("nhoi mau")) return "cardio";
  if (s.includes("tngt") || s.includes("gay") || s.includes("chay mau")) return "trauma";
  if (s.includes("kho tho") || s.includes("spo2") || s.includes("sot cao") || s.includes("ho")) return "respiratory";
  if (s.includes("dot quy") || s.includes("liet") || s.includes("co giat")) return "neuro";
  return "er";
}

/** Role có được thấy ca này không? Nurse действовать trong phạm vi khoa Cấp cứu. */
export function canSee(roleId, patient) {
  if (roleId === "ceo" || roleId === "admin") return true;
  if (roleId === "icu") return patient.severity === "critical";
  if (roleId === "nurse") return deptOf(patient) === "er";
  return deptOf(patient) === roleId;
}
// Khoa phạm vi của role xem (nurse -> er)
export function scopeDept(roleId) {
  return roleId === "nurse" ? "er" : roleId;
}

export const STATUS_LABEL = {
  PENDING_TRIAGE: "Chờ phân loại",
  DEPARTMENT_ROUTED: "Chờ xử lý",
  DOCTOR_ACCEPTED: "BS đã nhận",
  IN_TREATMENT: "Đang điều trị",
  REFERRAL_PENDING: "Đang chuyển tuyến",
  DISPATCHED: "Đã điều xe",
  EN_ROUTE: "Xe đang tới",
  ARRIVED: "Xe đã đến",
  TRANSFERRED: "Đã chuyển",
  COMPLETED: "Hoàn tất",
  FLAGGED: "Chờ kiểm duyệt",
  DISMISSED: "Đã bỏ qua",
  // Legacy (backend cũ / seed cũ)
  waiting: "Chờ xử lý",
  treating: "Đang điều trị",
  referring: "Đang chuyển tuyến",
  discharged: "Đã xuất viện",
  transferred: "Đã chuyển khoa",
  icu: "Đã nhập ICU",
};

// Trạng thái còn nằm trong feed chờ / đang xử lý
export const OPEN_STATES = ["PENDING_TRIAGE", "DEPARTMENT_ROUTED", "DOCTOR_ACCEPTED", "IN_TREATMENT", "REFERRAL_PENDING", "DISPATCHED", "EN_ROUTE", "ARRIVED", "waiting", "treating", "referring"];
export const CLOSED_STATES = ["TRANSFERRED", "COMPLETED", "discharged", "transferred", "icu"];
export const ACTIVE_STATES = ["DOCTOR_ACCEPTED", "IN_TREATMENT", "treating"];

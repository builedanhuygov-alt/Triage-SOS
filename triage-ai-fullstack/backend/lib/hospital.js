/**
 * lib/hospital — Mô hình tổ chức + nhân sự + RBAC demo cho
 * BỆNH VIỆN ĐA KHOA TW DEMO1 (DEMO / MOCK / SEEDED — không phải dữ liệu thật).
 *
 * Cấu trúc: Tòa (Building) -> Tầng (Floor) -> Khoa (Department) ->
 *   Phòng/Đơn vị (Unit) -> Chức danh (Job Title) -> User -> Role ->
 *   Permission -> Scope (LEVEL 0..5).
 *
 * Nguyên tắc:
 * - reuse auth hiện tại (Auth.USERS được nối thêm, login cũ không đổi).
 * - password demo thống nhất DEMO_PASSWORD (seed bằng plaintext vì đây là
 *   mock in-memory cho demo; production phải hash — xem READMEelligible).
 * - mọi tên là giả lập, metadata isDemo=true, banner DEMO ENVIRONMENT.
 */
"use strict";

const HOSPITAL_NAME = "BỆNH VIỆN ĐA KHOA TW DEMO1";
const DEMO_PASSWORD = "Demo@2026!";
const DEMO_BANNER = "DEMO ENVIRONMENT — NOT FOR PRODUCTION";

/* ================= BUILDINGS / FLOORS ================= */
const BUILDINGS = [
  { id: "GATE", code: "GATE", name: "Cổng chính / Tiếp nhận / Ambulance Bay", floors: ["G"], note: "Khu vận hành chung" },
  { id: "A", code: "A", name: "Tòa A — Main Tower (Khám bệnh & Điều hành trung tâm)", floors: [1, 2, 3, 4, 5] },
  { id: "B", code: "B", name: "Tòa B — Emergency & ICU", floors: [1, 2, 3] },
  { id: "C", code: "C", name: "Tòa C — Specialized Clinical Building", floors: [1, 2, 3] },
  { id: "D", code: "D", name: "Tòa D — Cận lâm sàng & Hậu cần", floors: [1, 2] },
];

/* ================= DEPARTMENTS + UNITS =================
 * head = username trưởng khoa (được gán sau khi sinh user, điền sẵn ở đây
 * cho các khoa có tài khoản đặc biệt bắt buộc theo spec). */
const DEPARTMENTS = [
  // ---- Tòa A tầng 5: Ban Giám đốc & Hội đồng ----
  { id: "board", code: "BGD", name: "Ban Giám đốc", building: "A", floors: [5], head: "director.demo", units: [{ id: "board-office", name: "Văn phòng Ban Giám đốc" }] },
  { id: "medical-board", code: "HĐYK", name: "Hội đồng Y khoa", building: "A", floors: [5], head: "medical.board.demo", units: [{ id: "medical-board-office", name: "Thư ký Hội đồng" }] },
  { id: "command-center", code: "CMD", name: "Trung tâm điều hành (Command Center)", building: "A", floors: [5], head: "command.ops.demo", units: [{ id: "cmd-ops", name: "Vận hành" }, { id: "cmd-data", name: "Phân tích dữ liệu" }, { id: "cmd-ai", name: "Giám sát AI (cảnh báo/hỗ trợ, không thay quyết định BS)" }] },
  // ---- Tòa A tầng 4 ----
  { id: "hr", code: "TCCB", name: "Phòng Tổ chức — Cán bộ", building: "A", floors: [4], head: "hr.manager.demo", units: [{ id: "hr-records", name: "Hồ sơ" }, { id: "hr-policy", name: "Chính sách & Tuyển dụng" }] },
  { id: "planning", code: "KHTH", name: "Phòng Kế hoạch — Tổng hợp", building: "A", floors: [4], head: "planning.manager.demo", units: [{ id: "plan-coord", name: "Điều phối" }, { id: "plan-stats", name: "Thống kê" }] },
  { id: "finance", code: "TCKT", name: "Phòng Tài chính — Kế toán", building: "A", floors: [4], head: "finance.manager.demo", units: [{ id: "fin-accounting", name: "Kế toán" }, { id: "fin-cashier", name: "Viện phí" }, { id: "fin-insurance", name: "BHYT" }] },
  { id: "admin-office", code: "HCQT", name: "Phòng Hành chính — Quản trị", building: "A", floors: [4], head: "admin.manager.demo", units: [{ id: "adm-general", name: "Hành chính" }, { id: "adm-facility", name: "Cơ sở vật chất" }] },
  { id: "it", code: "CNTT", name: "Bộ phận CNTT", building: "A", floors: [4], head: "it.admin.demo", units: [{ id: "it-infra", name: "Hạ tầng & Mạng" }, { id: "it-app", name: "Ứng dụng & Helpdesk" }] },
  { id: "emr", code: "EMR", name: "Quản lý EMR / Dữ liệu y tế", building: "A", floors: [4], head: "emr.admin.demo", units: [{ id: "emr-admin", name: "Quản trị EMR" }, { id: "emr-quality", name: "Chất lượng dữ liệu" }] },
  { id: "clinical-review", code: "CRS", name: "Clinical Review & Safety Unit", building: "A", floors: [4], head: "review.lead.demo", units: [{ id: "crs-flag", name: "Rà soát flag & dữ liệu bất thường" }, { id: "crs-audit", name: "Audit & Escalation" }] },
  // ---- Tòa A tầng 3: Ngoại trú ----
  { id: "outpatient-internal", code: "NK-NT", name: "Phòng Nội tổng quát (Khoa Khám bệnh)", building: "A", floors: [3], head: "internal.head.demo", units: [{ id: "int-exam", name: "Khám nội" }] },
  { id: "outpatient-surgery", code: "NK-NG", name: "Phòng Ngoại tổng quát (Khoa Khám bệnh)", building: "A", floors: [3], head: "surgery.head.demo", units: [{ id: "surg-exam", name: "Khám ngoại" }] },
  { id: "outpatient-peds", code: "NK-NHI", name: "Phòng Nhi (Khoa Khám bệnh)", building: "A", floors: [3], head: "peds.head.demo", units: [{ id: "peds-exam", name: "Khám nhi" }] },
  { id: "vaccination", code: "TIEMCHUNG", name: "Đơn vị Tiêm chủng", building: "A", floors: [3], head: "vaccine.lead.demo", units: [{ id: "vac-room", name: "Phòng tiêm" }] },
  // ---- Tòa A tầng 1-2 ----
  { id: "reception", code: "TIEPNHAN", name: "Bộ phận Tiếp nhận", building: "A", floors: [1, 2], head: "reception.head.demo", units: [{ id: "recep-desk", name: "Quầy tiếp nhận" }, { id: "recep-guide", name: "Hướng dẫn" }] },
  { id: "insurance-desk", code: "BHYT", name: "BHYT / Medical ID", building: "A", floors: [1, 2], head: "insurance.head.demo", units: [{ id: "ins-verify", name: "Xác minh hồ sơ" }] },
  { id: "kiosk", code: "KIOSK", name: "Self-Service Kiosk", building: "A", floors: [1], head: "kiosk.lead.demo", units: [{ id: "kiosk-ops", name: "Vận hành kiosk" }] },
  { id: "sos-support", code: "SOS", name: "SOS / Patient App", building: "A", floors: [1], head: "sos.lead.demo", units: [{ id: "sos-intake", name: "Tiếp nhận SOS" }, { id: "sos-care", name: "Hỗ trợ bệnh nhân" }] },
  // ---- Cổng chính ----
  { id: "gate-security", code: "ANNINH", name: "An ninh cổng chính", building: "GATE", floors: ["G"], head: "security.manager.demo", units: [{ id: "gate-guard", name: "Bảo vệ cổng" }, { id: "gate-traffic", name: "Điều phối xe cấp cứu" }] },
  // ---- Tòa B ----
  { id: "emergency", code: "CC", name: "Khoa Cấp cứu", building: "B", floors: [1], head: "emergency.head.demo", units: [{ id: "triage", name: "Triage" }, { id: "resus", name: "Resuscitation Bay" }, { id: "amb-ref", name: "Ambulance / Referral" }] },
  { id: "icu", code: "ICU", name: "Khoa Hồi sức tích cực", building: "B", floors: [2, 3], head: "icu.head.demo", units: [{ id: "icu-general", name: "ICU tổng hợp" }, { id: "crrt", name: "CRRT" }, { id: "blood-bank", name: "Blood Bank" }] },
  // ---- Tòa C ----
  { id: "cardiology", code: "TM", name: "Khoa Tim mạch", building: "C", floors: [1], head: "cardiology.head.demo", units: [{ id: "cathlab", name: "Cath Lab" }, { id: "cardio-ward", name: "Nội trú Tim mạch" }] },
  { id: "orthopedic", code: "CTCH", name: "Khoa Chấn thương chỉnh hình", building: "C", floors: [1, 2], head: "orthopedic.head.demo", units: [{ id: "or", name: "Phòng mổ" }, { id: "rehab", name: "Phục hồi chức năng" }] },
  { id: "pulmonary", code: "HH", name: "Khoa Hô hấp", building: "C", floors: [2], head: "pulmonary.head.demo", units: [{ id: "pft", name: "Chức năng hô hấp" }, { id: "isolation", name: "Cách ly" }] },
  { id: "neurology", code: "TK", name: "Khoa Thần kinh & Đột quỵ", building: "C", floors: [3], head: "neurology.head.demo", units: [{ id: "stroke", name: "Stroke Unit" }] },
  // ---- Tòa D ----
  { id: "lab", code: "XN", name: "Khoa Xét nghiệm", building: "D", floors: [1], head: "lab.head.demo", units: [{ id: "lab-hema", name: "Huyết học" }, { id: "lab-biochem", name: "Sinh hóa" }, { id: "lab-micro", name: "Vi sinh" }, { id: "lab-immuno", name: "Miễn dịch" }, { id: "lab-reception", name: "Tiếp nhận mẫu" }, { id: "lab-result", name: "Trả kết quả" }] },
  { id: "radiology", code: "CDHA", name: "Khoa Chẩn đoán hình ảnh", building: "D", floors: [1], head: "radiology.head.demo", units: [{ id: "rad-xray", name: "X-Ray" }, { id: "rad-ct", name: "CT" }, { id: "rad-mri", name: "MRI" }, { id: "rad-us", name: "Ultrasound" }] },
  { id: "pharmacy", code: "DUOC", name: "Khoa Dược", building: "D", floors: [1], head: "pharmacy.head.demo", units: [{ id: "pharm-clinical", name: "Dược lâm sàng" }, { id: "pharm-warehouse", name: "Kho thuốc" }, { id: "pharm-dispense", name: "Cấp phát" }] },
  { id: "infection", code: "KSNK", name: "Kiểm soát nhiễm khuẩn", building: "D", floors: [2], head: "infection.head.demo", units: [{ id: "inf-ops", name: "Giám sát nhiễm khuẩn" }] },
  { id: "nutrition", code: "DINHDUONG", name: "Dinh dưỡng", building: "D", floors: [2], head: "nutrition.head.demo", units: [{ id: "nut-kitchen", name: "Bếp ăn bệnh viện" }] },
  { id: "social", code: "CTXH", name: "Công tác xã hội", building: "D", floors: [2], head: "social.head.demo", units: [{ id: "soc-support", name: "Hỗ trợ người bệnh" }] },
  { id: "biomedical", code: "VT-TBYT", name: "Vật tư — Thiết bị y tế", building: "D", floors: [2], head: "biomed.head.demo", units: [{ id: "biomed-eng", name: "Kỹ thuật y sinh" }, { id: "biomed-stock", name: "Kho vật tư" }] },
  { id: "quality", code: "QLCL", name: "Quản lý chất lượng", building: "D", floors: [2], head: "quality.manager.demo", units: [{ id: "q-ops", name: "Đánh giá chất lượng" }] },
  { id: "transport", code: "VANCHUYEN", name: "Vận chuyển bệnh nhân", building: "D", floors: [2], head: "transport.head.demo", units: [{ id: "trans-team", name: "Đội vận chuyển" }] },
  { id: "cleaning", code: "VESINH", name: "Vệ sinh", building: "D", floors: [2], head: "cleaning.head.demo", units: [{ id: "clean-team", name: "Đội vệ sinh" }] },
  { id: "engineering", code: "KYTHUAT", name: "Kỹ thuật bệnh viện", building: "D", floors: [2], head: "engineering.head.demo", units: [{ id: "eng-electrical", name: "Điện" }, { id: "eng-hvac", name: "HVAC" }, { id: "eng-gas", name: "Khí y tế" }] },
];

/* ================= ROLES (LEVEL 0..5) ================= */
const ROLES = [
  { id: "SUPER_ADMIN", name: "Super Admin (kỹ thuật hệ thống)", description: "Toàn quyền kỹ thuật. Không tự ý sửa hồ sơ y tế chuyên môn.", scope: "system", level: 0 },
  { id: "HOSPITAL_DIRECTOR", name: "Giám đốc bệnh viện", description: "Giám sát toàn viện: dashboard, nhân sự, báo cáo, phê duyệt theo quy trình.", scope: "hospital", level: 1 },
  { id: "DEPUTY_DIRECTOR", name: "Phó Giám đốc", description: "Quyền theo phạm vi phụ trách (chuyên môn / vận hành / CLCS).", scope: "hospital", level: 1 },
  { id: "MEDICAL_BOARD", name: "Hội đồng Y khoa", description: "Tư vấn chuyên môn, duyệt phác đồ, không can thiệp hành chính trực tiếp.", scope: "hospital", level: 1 },
  { id: "BUILDING_MANAGER", name: "Quản lý tòa nhà", description: "Dashboard + nhân sự + thiết bị trong phạm vi tòa.", scope: "building", level: 2 },
  { id: "DEPARTMENT_HEAD", name: "Trưởng khoa", description: "Quản lý khoa trong phạm vi được cấp: nhân sự, phân công, dashboard, workflow.", scope: "department", level: 3 },
  { id: "DEPUTY_HEAD", name: "Phó khoa / Phó phòng", description: "Hỗ trợ trưởng khoa trong phạm vi khoa.", scope: "department", level: 3 },
  { id: "FUNCTIONAL_MANAGER", name: "Trưởng phòng chức năng", description: "Quản lý phòng chức năng (KH-TH, HC-QT, điều hành...).", scope: "department", level: 3 },
  { id: "DOCTOR", name: "Bác sĩ", description: "Khám, chẩn đoán, kê đơn, chỉ định, y lệnh trong phạm vi khoa.", scope: "department", level: 4 },
  { id: "NURSE", name: "Điều dưỡng", description: "Chăm sóc, sinh hiệu, thực hiện y lệnh. Không tự đổi chẩn đoán.", scope: "unit", level: 4 },
  { id: "TECHNICIAN", name: "Kỹ thuật viên y tế", description: "Tiếp nhận chỉ định, thực hiện XN/CĐHA, nhập kết quả.", scope: "unit", level: 4 },
  { id: "PHARMACIST", name: "Dược sĩ", description: "Đơn thuốc, cấp phát, tồn kho, kiểm kê.", scope: "department", level: 4 },
  { id: "HR_MANAGER", name: "Trưởng phòng Tổ chức — Cán bộ", description: "Quản lý nhân sự toàn viện.", scope: "hospital", level: 2 },
  { id: "HR_STAFF", name: "Nhân viên nhân sự", description: "Hồ sơ, tuyển dụng trong phạm vi được cấp.", scope: "department", level: 4 },
  { id: "FINANCE_MANAGER", name: "Trưởng phòng Tài chính — Kế toán", description: "Quản lý viện phí, BHYT, tài chính.", scope: "hospital", level: 2 },
  { id: "FINANCE_STAFF", name: "Kế toán / Viện phí / BHYT", description: "Thanh toán, viện phí, BHYT. Không xem toàn bộ bệnh án.", scope: "department", level: 4 },
  { id: "IT_ADMIN", name: "Quản trị CNTT", description: "Account, RBAC, cấu hình hệ thống. Không sửa dữ liệu y tế.", scope: "system", level: 0 },
  { id: "IT_STAFF", name: "Nhân viên CNTT", description: "Hỗ trợ ứng dụng, helpdesk, hạ tầng.", scope: "system", level: 0 },
  { id: "EMR_ADMIN", name: "Quản trị EMR", description: "Cấu hình EMR, toàn vẹn dữ liệu, metadata, audit.", scope: "system", level: 0 },
  { id: "REVIEW_OFFICER", name: "Clinical Review & Safety", description: "Rà soát flag, sự cố dữ liệu, audit, escalation. Không trừng phạt.", scope: "hospital", level: 2 },
  { id: "QUALITY_MANAGER", name: "Quản lý chất lượng", description: "Đánh giá chất lượng, KSNK phối hợp.", scope: "hospital", level: 2 },
  { id: "COMMAND_OPERATOR", name: "Vận hành Command Center", description: "Giám sát vận hành, cảnh báo, điều phối.", scope: "hospital", level: 2 },
  { id: "DATA_ANALYST", name: "Phân tích dữ liệu bệnh viện", description: "Báo cáo, dự báo, phân tích. Chỉ đọc dữ liệu được cấp.", scope: "hospital", level: 2 },
  { id: "ADMIN_STAFF", name: "Nhân viên hành chính", description: "Tiếp nhận, hành chính, kiosk, SOS support.", scope: "unit", level: 5 },
  { id: "SUPPORT_STAFF", name: "Hỗ trợ / Hậu cần / Bảo vệ / Vận chuyển", description: "An ninh, vận chuyển, vệ sinh, kỹ thuật, dinh dưỡng.", scope: "unit", level: 5 },
];

/* ================= PERMISSIONS ================= */
const PERMISSIONS = [
  { id: "patient.view", description: "Xem hồ sơ bệnh nhân trong phạm vi" },
  { id: "patient.create", description: "Tạo hồ sơ bệnh nhân" },
  { id: "patient.update", description: "Cập nhật hồ sơ bệnh nhân" },
  { id: "emr.view", description: "Xem EMR" },
  { id: "emr.create", description: "Tạo ghi nhận EMR" },
  { id: "emr.update", description: "Cập nhật EMR chuyên môn" },
  { id: "emr.sign", description: "Ký xác nhận EMR / y lệnh" },
  { id: "order.create", description: "Tạo chỉ định / y lệnh" },
  { id: "order.view", description: "Xem chỉ định" },
  { id: "order.execute", description: "Thực hiện y lệnh" },
  { id: "lab.order", description: "Chỉ định xét nghiệm" },
  { id: "lab.result.view", description: "Xem kết quả xét nghiệm" },
  { id: "lab.result.enter", description: "Nhập kết quả xét nghiệm" },
  { id: "lab.result.verify", description: "Duyệt kết quả xét nghiệm" },
  { id: "radiology.order", description: "Chỉ định CĐHA" },
  { id: "radiology.result.view", description: "Xem kết quả CĐHA" },
  { id: "radiology.result.enter", description: "Nhập kết quả CĐHA" },
  { id: "radiology.report.verify", description: "Duyệt báo cáo CĐHA" },
  { id: "pharmacy.prescription.view", description: "Xem đơn thuốc" },
  { id: "pharmacy.dispense", description: "Cấp phát thuốc" },
  { id: "pharmacy.inventory.view", description: "Xem tồn kho thuốc" },
  { id: "pharmacy.inventory.manage", description: "Quản lý tồn kho / kiểm kê" },
  { id: "billing.view", description: "Xem viện phí / thanh toán" },
  { id: "billing.create", description: "Tạo phiếu thu / hóa đơn" },
  { id: "billing.approve", description: "Duyệt tài chính" },
  { id: "staff.view", description: "Xem nhân sự" },
  { id: "staff.create", description: "Tạo nhân sự" },
  { id: "staff.update", description: "Cập nhật nhân sự" },
  { id: "schedule.view", description: "Xem lịch trực / phân công" },
  { id: "schedule.manage", description: "Quản lý lịch trực / phân công" },
  { id: "building.view", description: "Xem dashboard tòa nhà" },
  { id: "building.manage", description: "Quản lý vận hành tòa nhà" },
  { id: "rbac.view", description: "Xem role / permission" },
  { id: "rbac.manage", description: "Quản lý role / permission" },
  { id: "audit.view", description: "Xem audit log" },
  { id: "audit.export", description: "Xuất audit log" },
  { id: "system.manage", description: "Quản trị cấu hình hệ thống" },
  { id: "appointment.manage", description: "Quản lý lịch hẹn" },
];

/* ============ ROLE -> PERMISSIONS (không gán quyền sai — §XL) ============ */
const CLIN_VIEW = ["patient.view", "emr.view", "order.view", "lab.result.view", "radiology.result.view", "schedule.view"];
const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ["staff.view", "staff.create", "staff.update", "rbac.view", "rbac.manage", "audit.view", "audit.export", "system.manage", "building.view", "schedule.view"],
  HOSPITAL_DIRECTOR: ["patient.view", "emr.view", "order.view", "lab.result.view", "radiology.result.view", "pharmacy.prescription.view", "pharmacy.inventory.view", "billing.view", "billing.approve", "staff.view", "staff.create", "staff.update", "schedule.view", "schedule.manage", "building.view", "building.manage", "rbac.view", "audit.view", "audit.export", "appointment.manage"],
  DEPUTY_DIRECTOR: ["patient.view", "emr.view", "order.view", "lab.result.view", "radiology.result.view", "billing.view", "staff.view", "staff.update", "schedule.view", "schedule.manage", "building.view", "audit.view", "appointment.manage"],
  MEDICAL_BOARD: ["patient.view", "emr.view", "order.view", "lab.result.view", "radiology.result.view", "audit.view", "staff.view", "schedule.view"],
  BUILDING_MANAGER: ["building.view", "building.manage", "staff.view", "schedule.view", "schedule.manage", "audit.view"],
  DEPARTMENT_HEAD: ["patient.view", "emr.view", "emr.sign", "order.view", "order.create", "lab.order", "lab.result.view", "lab.result.verify", "radiology.order", "radiology.result.view", "radiology.report.verify", "staff.view", "staff.update", "schedule.view", "schedule.manage", "audit.view", "appointment.manage"],
  DEPUTY_HEAD: ["patient.view", "emr.view", "order.view", "order.create", "lab.order", "lab.result.view", "radiology.order", "radiology.result.view", "staff.view", "schedule.view", "schedule.manage", "appointment.manage"],
  FUNCTIONAL_MANAGER: ["staff.view", "staff.update", "schedule.view", "schedule.manage", "audit.view", "billing.view", "building.view"],
  DOCTOR: ["patient.view", "patient.create", "patient.update", "emr.view", "emr.create", "emr.update", "emr.sign", "order.create", "order.view", "lab.order", "lab.result.view", "radiology.order", "radiology.result.view", "pharmacy.prescription.view", "schedule.view", "appointment.manage"],
  NURSE: ["patient.view", "emr.view", "emr.create", "order.view", "order.execute", "lab.result.view", "radiology.result.view", "pharmacy.prescription.view", "schedule.view"],
  TECHNICIAN: ["order.view", "order.execute", "lab.result.view", "lab.result.enter", "radiology.result.view", "radiology.result.enter", "schedule.view"],
  PHARMACIST: ["pharmacy.prescription.view", "pharmacy.dispense", "pharmacy.inventory.view", "pharmacy.inventory.manage", "order.view", "schedule.view"],
  HR_MANAGER: ["staff.view", "staff.create", "staff.update", "schedule.view", "schedule.manage", "audit.view"],
  HR_STAFF: ["staff.view", "schedule.view"],
  FINANCE_MANAGER: ["billing.view", "billing.create", "billing.approve", "audit.view", "staff.view"],
  FINANCE_STAFF: ["billing.view", "billing.create", "schedule.view"],
  IT_ADMIN: ["staff.view", "staff.create", "staff.update", "rbac.view", "rbac.manage", "audit.view", "audit.export", "system.manage"],
  IT_STAFF: ["staff.view", "system.manage", "schedule.view"],
  EMR_ADMIN: ["emr.view", "audit.view", "audit.export", "system.manage", "staff.view", "rbac.view"],
  REVIEW_OFFICER: ["patient.view", "emr.view", "order.view", "lab.result.view", "radiology.result.view", "audit.view", "audit.export", "staff.view"],
  QUALITY_MANAGER: ["patient.view", "emr.view", "audit.view", "audit.export", "staff.view", "schedule.view"],
  COMMAND_OPERATOR: ["patient.view", "order.view", "building.view", "schedule.view", "audit.view", "staff.view"],
  DATA_ANALYST: ["patient.view", "emr.view", "lab.result.view", "radiology.result.view", "billing.view", "staff.view", "audit.view"],
  ADMIN_STAFF: ["patient.view", "patient.create", "schedule.view", "appointment.manage"],
  SUPPORT_STAFF: ["schedule.view", "building.view"],
};

/* ================= NAME POOLS (giả lập, không phải người thật) ================= */
const FAMILY = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý"];
const MIDDLE = ["Minh", "Quốc", "Hoàng", "Gia", "Thanh", "Đức", "Văn", "Thị", "Ngọc", "Hồng", "Kim", "Anh", "Bảo", "Công", "Hữu", "Xuân"];
const GIVEN = ["An", "Bảo", "Nam", "Huy", "Khang", "Linh", "Châu", "Dũng", "Tuấn", "Hải", "Yến", "Phúc", "Thảo", "Sơn", "Bình", "Kiệt", "Long", "Mai", "Lan", "Phương", "Trang", "Vinh", "Đạt", "Khoa", "Nhân", "Quang", "Thanh", "Tâm", "Vy", "Duy", "Hà", "Hùng", "Tùng", "Quân", "Hiếu", "Ngân", "Trâm", "Hạnh", "Tiến", "Lộc"];
const SPECIALTIES = {
  emergency: "Cấp cứu", icu: "Hồi sức tích cực", cardiology: "Tim mạch", orthopedic: "Chấn thương chỉnh hình",
  pulmonary: "Hô hấp", neurology: "Thần kinh", "outpatient-internal": "Nội tổng quát", "outpatient-surgery": "Ngoại tổng quát",
  "outpatient-peds": "Nhi khoa", radiology: "Chẩn đoán hình ảnh", lab: "Xét nghiệm", pharmacy: "Dược",
};
// Map khoa DEMO1 -> dept key legacy để API/RBAC cũ (deptMatch/DEPT_VI) tiếp tục chạy đúng scope
const LEGACY_DEPT_MAP = {
  emergency: "er", icu: "icu", cardiology: "cardio", orthopedic: "trauma",
  pulmonary: "respiratory", neurology: "neuro",
};
function legacyDeptOf(deptId) { return LEGACY_DEPT_MAP[deptId] || deptId; }

const normAscii = (s = "") =>
  String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, ".");

/* ================= USER FACTORY ================= */
let seq = 0;
const usedNames = new Set();
const usedUsernames = new Set();
const USERS = [];

function pickName(i) {
  for (let k = 0; k < 500; k++) {
    const f = FAMILY[(i + k * 3) % FAMILY.length];
    const m = MIDDLE[(i * 2 + k * 5) % MIDDLE.length];
    const g = GIVEN[(i * 7 + k * 11) % GIVEN.length];
    const name = `${f} ${m} ${g}`;
    if (!usedNames.has(name)) { usedNames.add(name); return name; }
  }
  const name = `${FAMILY[i % FAMILY.length]} ${MIDDLE[i % MIDDLE.length]} ${GIVEN[i % GIVEN.length]} ${i}`;
  usedNames.add(name);
  return name;
}

function makeUsername(fullName, deptId) {
  const parts = normAscii(fullName).split(".").filter(Boolean);
  const last = parts[parts.length - 1] || "user";
  const initials = parts.slice(0, -1).map((p) => p[0]).join("");
  let base = `${last}.${initials}.${deptId}`.replace(/\.+/g, ".").replace(/[^a-z0-9.]/g, "");
  if (usedUsernames.has(base)) {
    let n = 2;
    while (usedUsernames.has(`${base}${n}`)) n++;
    base = `${base}${n}`;
  }
  usedUsernames.add(base);
  return base;
}

function deptOf(id) { return DEPARTMENTS.find((d) => d.id === id); }
function buildingOf(deptId) { const d = deptOf(deptId); return d ? d.building : null; }

function addUser(spec) {
  seq++;
  const dept = spec.department ? deptOf(spec.department) : null;
  const building = spec.building || (dept ? dept.building : "A");
  const floor = spec.floor !== undefined ? spec.floor : (dept ? dept.floors[0] : 1);
  const fullName = spec.fullName || pickName(seq * 13 + USERS.length * 29);
  let username = spec.username;
  if (!username) username = makeUsername(fullName, dept ? dept.id : "hq");
  else {
    if (usedUsernames.has(username)) throw new Error(`duplicate username seed: ${username}`);
    usedUsernames.add(username);
  }
  const role = ROLES.find((r) => r.id === spec.role);
  if (!role) throw new Error(`unknown role: ${spec.role}`);
  const u = {
    id: `u-demo-${String(seq).padStart(4, "0")}`,
    userId: `DEMO-U-${String(seq).padStart(4, "0")}`,
    employeeId: `NV-D1-${String(seq).padStart(4, "0")}`,
    fullName, username,
    email: `${username}@demo1.hospital.demo`,
    password: DEMO_PASSWORD,
    jobTitle: spec.jobTitle,
    role: spec.role,
    department: spec.department || null,
    departmentName: dept ? dept.name : (spec.departmentName || "Ban Giám đốc"),
    unit: spec.unit || (dept && dept.units[0] ? dept.units[0].id : null),
    building, floor,
    scope: spec.scope || { level: role.level, building, department: spec.department || null, unit: spec.unit || null },
    supervisor: spec.supervisor || (dept && dept.head && dept.head !== username ? dept.head : "director.demo"),
    status: spec.status || "ACTIVE",
    phone: `090${String(100000 + ((seq * 7919) % 899999))}`,
    isDemo: true,
    legacyRole: spec.legacyRole || null, // map sang role cũ cho API legacy (CEO/ADMIN/DOCTOR/NURSE)
    legacyDept: spec.legacyDept || null,
    specialty: spec.specialty || null,
    position: spec.position || spec.jobTitle,
    onDuty: spec.onDuty !== undefined ? spec.onDuty : true,
  };
  USERS.push(u);
  return u;
}

/* ================= SEED: LÃNH ĐẠO (10) ================= */
addUser({ username: "director.demo", fullName: "Nguyễn Minh Đức", role: "HOSPITAL_DIRECTOR", jobTitle: "Giám đốc bệnh viện", department: "board", unit: "board-office", building: "A", floor: 5, supervisor: null, legacyRole: "CEO" });
addUser({ username: "deputy.clinical.demo", fullName: "Trần Quốc Huy", role: "DEPUTY_DIRECTOR", jobTitle: "Phó Giám đốc phụ trách chuyên môn", department: "board", building: "A", floor: 5, legacyRole: "CEO" });
addUser({ username: "deputy.operations.demo", fullName: "Lê Hoàng Nam", role: "DEPUTY_DIRECTOR", jobTitle: "Phó Giám đốc phụ trách điều hành/hậu cần", department: "board", building: "A", floor: 5, legacyRole: "CEO" });
addUser({ username: "deputy.quality.demo", fullName: "Phạm Gia Hân", role: "DEPUTY_DIRECTOR", jobTitle: "Phó Giám đốc phụ trách cận lâm sàng/chất lượng", department: "board", building: "A", floor: 5, legacyRole: "CEO" });
addUser({ username: "board.chair.demo", fullName: "Võ Minh Khang", role: "MEDICAL_BOARD", jobTitle: "Chủ tịch Hội đồng Y khoa", department: "medical-board", building: "A", floor: 5, legacyRole: "CEO" });
addUser({ username: "medical.board.demo", fullName: "Hoàng Thị Lan", role: "MEDICAL_BOARD", jobTitle: "Phó Chủ tịch Hội đồng Y khoa", department: "medical-board", building: "A", floor: 5, legacyRole: "CEO" });
addUser({ username: "board.member.demo", fullName: "Đặng Văn Phúc", role: "MEDICAL_BOARD", jobTitle: "Thành viên Hội đồng Y khoa", department: "medical-board", building: "A", floor: 5 });
addUser({ username: "command.ops.demo", fullName: "Bùi Công Danh", role: "COMMAND_OPERATOR", jobTitle: "Clinical Operations Manager", department: "command-center", unit: "cmd-ops", building: "A", floor: 5 });
addUser({ username: "command.center.demo", fullName: "Hồ Ngọc Ánh", role: "COMMAND_OPERATOR", jobTitle: "Command Center Operator", department: "command-center", unit: "cmd-ops", building: "A", floor: 5 });
addUser({ username: "data.analyst.demo", fullName: "Ngô Xuân Trường", role: "DATA_ANALYST", jobTitle: "Hospital Data Analyst", department: "command-center", unit: "cmd-data", building: "A", floor: 5 });
addUser({ username: "ai.monitor.demo", fullName: "Dương Kim Ngân", role: "DATA_ANALYST", jobTitle: "AI Monitoring Operator (cảnh báo/hỗ trợ, không thay BS)", department: "command-center", unit: "cmd-ai", building: "A", floor: 5 });

/* ================= QUẢN LÝ PHÒNG CHỨC NĂNG ================= */
addUser({ username: "hr.manager.demo", fullName: "Lý Hồng Nhung", role: "HR_MANAGER", jobTitle: "Trưởng phòng Tổ chức — Cán bộ", department: "hr", building: "A", floor: 4, legacyRole: "ADMIN" });
addUser({ username: "hr.deputy.demo", fullName: "Trần Minh Quân", role: "HR_STAFF", jobTitle: "Phó phòng Tổ chức — Cán bộ", department: "hr", building: "A", floor: 4 });
addUser({ username: "planning.manager.demo", fullName: "Lê Đức Anh", role: "FUNCTIONAL_MANAGER", jobTitle: "Trưởng phòng Kế hoạch — Tổng hợp", department: "planning", building: "A", floor: 4, legacyRole: "ADMIN" });
addUser({ username: "planning.deputy.demo", fullName: "Phạm Thanh Tâm", role: "ADMIN_STAFF", jobTitle: "Phó phòng Kế hoạch — Tổng hợp", department: "planning", building: "A", floor: 4 });
addUser({ username: "finance.manager.demo", fullName: "Hoàng Văn Sơn", role: "FINANCE_MANAGER", jobTitle: "Trưởng phòng Tài chính — Kế toán", department: "finance", building: "A", floor: 4, legacyRole: "ADMIN" });
addUser({ username: "finance.deputy.demo", fullName: "Vũ Thị Hà", role: "FINANCE_STAFF", jobTitle: "Phó phòng Tài chính — Kế toán", department: "finance", building: "A", floor: 4 });
addUser({ username: "admin.manager.demo", fullName: "Đỗ Hữu Thắng", role: "FUNCTIONAL_MANAGER", jobTitle: "Trưởng phòng Hành chính — Quản trị", department: "admin-office", building: "A", floor: 4 });
addUser({ username: "admin.deputy.demo", fullName: "Nguyễn Thị Mai", role: "ADMIN_STAFF", jobTitle: "Phó phòng Hành chính — Quản trị", department: "admin-office", building: "A", floor: 4 });
addUser({ username: "it.admin.demo", fullName: "Trần Công Nghệ", role: "IT_ADMIN", jobTitle: "IT Manager", department: "it", building: "A", floor: 4, scope: { level: 0, building: null, department: null, unit: null, dataAccess: "technical only" }, legacyRole: "ADMIN" });
addUser({ username: "emr.admin.demo", fullName: "Lê Ngọc Bảo", role: "EMR_ADMIN", jobTitle: "EMR Administrator", department: "emr", building: "A", floor: 4, legacyRole: "ADMIN" });
addUser({ username: "review.lead.demo", fullName: "Phạm Quốc Dũng", role: "REVIEW_OFFICER", jobTitle: "Trưởng Clinical Review & Safety Unit", department: "clinical-review", building: "A", floor: 4, legacyRole: "ADMIN" });
addUser({ username: "quality.manager.demo", fullName: "Võ Thanh Huyền", role: "QUALITY_MANAGER", jobTitle: "Quality Manager", department: "quality", building: "D", floor: 2 });
addUser({ username: "nursing.manager.demo", fullName: "Trần Thị Yến", role: "DEPARTMENT_HEAD", jobTitle: "Trưởng phòng Điều dưỡng", department: "icu", building: "B", floor: 2, legacyRole: "ADMIN" });
addUser({ username: "reception.head.demo", fullName: "Nguyễn Hữu Lộc", role: "FUNCTIONAL_MANAGER", jobTitle: "Trưởng bộ phận Tiếp nhận", department: "reception", building: "A", floor: 1 });
addUser({ username: "insurance.head.demo", fullName: "Lê Thị Thu", role: "FINANCE_STAFF", jobTitle: "Trưởng quầy BHYT / Medical ID", department: "insurance-desk", building: "A", floor: 1 });
addUser({ username: "kiosk.lead.demo", fullName: "Đỗ Minh Hiếu", role: "ADMIN_STAFF", jobTitle: "Kiosk Operator Lead", department: "kiosk", building: "A", floor: 1 });
addUser({ username: "sos.lead.demo", fullName: "Hồ Văn Tiến", role: "ADMIN_STAFF", jobTitle: "Emergency Intake Operator Lead", department: "sos-support", building: "A", floor: 1 });
addUser({ username: "security.manager.demo", fullName: "Ngô Văn Hùng", role: "SUPPORT_STAFF", jobTitle: "Security Manager", department: "gate-security", building: "GATE", floor: "G", position: "Security Manager" });
addUser({ username: "transport.head.demo", fullName: "Dương Văn Tải", role: "SUPPORT_STAFF", jobTitle: "Transport Coordinator", department: "transport", building: "D", floor: 2 });
addUser({ username: "cleaning.head.demo", fullName: "Lý Thị Sạch", role: "SUPPORT_STAFF", jobTitle: "Facility Cleaning Supervisor", department: "cleaning", building: "D", floor: 2 });
addUser({ username: "engineering.head.demo", fullName: "Bùi Văn Máy", role: "SUPPORT_STAFF", jobTitle: "Engineering Manager", department: "engineering", building: "D", floor: 2 });
addUser({ username: "nutrition.head.demo", fullName: "Phan Thị Dinh", role: "SUPPORT_STAFF", jobTitle: "Trưởng đơn vị Dinh dưỡng", department: "nutrition", building: "D", floor: 2 });
addUser({ username: "infection.head.demo", fullName: "Vũ Thị Kháng", role: "QUALITY_MANAGER", jobTitle: "Trưởng đơn vị Kiểm soát nhiễm khuẩn", department: "infection", building: "D", floor: 2 });
addUser({ username: "social.head.demo", fullName: "Hoàng Văn Tâm", role: "SUPPORT_STAFF", jobTitle: "Trưởng bộ phận Công tác xã hội", department: "social", building: "D", floor: 2 });
addUser({ username: "biomed.head.demo", fullName: "Đặng Công Thiết", role: "TECHNICIAN", jobTitle: "Trưởng bộ phận Vật tư — Thiết bị y tế", department: "biomedical", building: "D", floor: 2 });

/* ================= TRƯỞNG/PHÓ KHOA LÂM SÀNG ================= */
const CLINICAL_HEADS = [
  ["emergency.head.demo", "Đinh Công Cấp", "Trưởng khoa Cấp cứu", "emergency", "DOCTOR"],
  ["emergency.deputy.demo", "Trương Thị Nhanh", "Phó khoa Cấp cứu", "emergency", "DOCTOR"],
  ["icu.head.demo", "Nguyễn Hồi Sức", "Trưởng khoa Hồi sức tích cực", "icu", "DOCTOR"],
  ["icu.deputy.demo", "Lê Thị Tỉnh", "Phó khoa Hồi sức tích cực", "icu", "DOCTOR"],
  ["cardiology.head.demo", "Trần Tâm Đức", "Trưởng khoa Tim mạch", "cardiology", "DOCTOR"],
  ["cardiology.deputy.demo", "Phạm Thị Mạch", "Phó khoa Tim mạch", "cardiology", "DOCTOR"],
  ["orthopedic.head.demo", "Hoàng Cốt Khang", "Trưởng khoa Chấn thương chỉnh hình", "orthopedic", "DOCTOR"],
  ["orthopedic.deputy.demo", "Võ Thị Khớp", "Phó khoa Chấn thương chỉnh hình", "orthopedic", "DOCTOR"],
  ["pulmonary.head.demo", "Đỗ Phế Dung", "Trưởng khoa Hô hấp", "pulmonary", "DOCTOR"],
  ["pulmonary.deputy.demo", "Nguyễn Văn Khí", "Phó khoa Hô hấp", "pulmonary", "DOCTOR"],
  ["neurology.head.demo", "Lê Não An", "Trưởng khoa Thần kinh & Đột quỵ", "neurology", "DOCTOR"],
  ["neurology.deputy.demo", "Trần Thị Tủy", "Phó khoa Thần kinh & Đột quỵ", "neurology", "DOCTOR"],
  ["lab.head.demo", "Phạm Huyết Thanh", "Trưởng khoa Xét nghiệm", "lab", "DOCTOR"],
  ["lab.deputy.demo", "Vũ Văn Sinh", "Phó khoa Xét nghiệm", "lab", "DOCTOR"],
  ["radiology.head.demo", "Huỳnh Quang Tuyến", "Trưởng khoa Chẩn đoán hình ảnh", "radiology", "DOCTOR"],
  ["radiology.deputy.demo", "Ngô Thị Siêu", "Phó khoa Chẩn đoán hình ảnh", "radiology", "DOCTOR"],
  ["pharmacy.head.demo", "Lý Dược Hương", "Trưởng khoa Dược", "pharmacy", "PHARMACIST"],
  ["pharmacy.deputy.demo", "Đỗ Văn Đơn", "Phó khoa Dược", "pharmacy", "PHARMACIST"],
  ["internal.head.demo", "Bùi Nội Khoa", "Trưởng đơn vị Nội tổng quát", "outpatient-internal", "DOCTOR"],
  ["surgery.head.demo", "Dương Ngoại Khoa", "Trưởng đơn vị Ngoại tổng quát", "outpatient-surgery", "DOCTOR"],
  ["peds.head.demo", "Hồ Nhi Đồng", "Trưởng đơn vị Nhi", "outpatient-peds", "DOCTOR"],
  ["vaccine.lead.demo", "Lý Chủng Ngừa", "Bác sĩ phụ trách Tiêm chủng", "vaccination", "DOCTOR"],
];
for (const [username, fullName, jobTitle, department, role] of CLINICAL_HEADS) {
  const d = deptOf(department);
  const isHead = jobTitle.startsWith("Trưởng");
  addUser({
    username, fullName, role: isHead ? "DEPARTMENT_HEAD" : "DEPUTY_HEAD",
    jobTitle, department, building: d.building, floor: d.floors[0],
    specialty: SPECIALTIES[department] || null,
    legacyRole: "DOCTOR", legacyDept: legacyDeptOf(department),
  });
}

/* ================= TÀI KHOẢN ĐẠI DIỆN TÒA ================= */
for (const b of ["A", "B", "C", "D"]) {
  addUser({
    username: `building.${b.toLowerCase()}.demo`, fullName: `Quản lý Tòa ${b} (Demo)`,
    role: "BUILDING_MANAGER", jobTitle: `Tài khoản đại diện Tòa ${b}`,
    department: null, departmentName: `Tòa ${b}`, building: b, floor: 1,
    scope: { level: 2, building: b, department: null, unit: null },
    supervisor: "director.demo",
  });
}
// Super admin kỹ thuật
addUser({ username: "sys.admin.demo", fullName: "Quản trị hệ thống (Demo)", role: "SUPER_ADMIN", jobTitle: "System Administrator", department: "it", unit: "it-infra", building: "A", floor: 4, scope: { level: 0, building: null, department: null, unit: null, dataAccess: "technical only" }, supervisor: "it.admin.demo", legacyRole: "ADMIN" });

/* ================= SINH HÀNG LOẠT THEO ĐỊNH MỨC =================
 * Mỗi dòng: [role, department, unit, jobTitle, count, legacyRole, legacyDept] */
const BULK = [
  // Bác sĩ cấp cứu 5 + chuyên khoa
  ["DOCTOR", "emergency", "triage", "Bác sĩ cấp cứu", 3, "DOCTOR", "er"],
  ["DOCTOR", "emergency", "resus", "Bác sĩ hồi sức cấp cứu", 2, "DOCTOR", "er"],
  ["DOCTOR", "emergency", "triage", "Triage Doctor", 1, "DOCTOR", "er"],
  ["DOCTOR", "emergency", "resus", "Resuscitation Team Leader", 1, "DOCTOR", "er"],
  ["DOCTOR", "icu", "icu-general", "Bác sĩ ICU", 4, "DOCTOR", "icu"],
  ["DOCTOR", "icu", "crrt", "Bác sĩ phụ trách CRRT", 1, "DOCTOR", "icu"],
  ["DOCTOR", "cardiology", "cardio-ward", "Bác sĩ tim mạch", 3, "DOCTOR", "cardio"],
  ["DOCTOR", "cardiology", "cathlab", "Bác sĩ can thiệp tim mạch", 2, "DOCTOR", "cardio"],
  ["DOCTOR", "cardiology", "cathlab", "Cath Lab Lead", 1, "DOCTOR", "cardio"],
  ["DOCTOR", "orthopedic", "or", "Bác sĩ chỉnh hình", 2, "DOCTOR", "trauma"],
  ["DOCTOR", "orthopedic", "or", "Bác sĩ chấn thương", 2, "DOCTOR", "trauma"],
  ["DOCTOR", "orthopedic", "or", "Surgeon", 1, "DOCTOR", "trauma"],
  ["DOCTOR", "orthopedic", "rehab", "Bác sĩ phục hồi chức năng", 1, "DOCTOR", "trauma"],
  ["DOCTOR", "pulmonary", "pft", "Bác sĩ hô hấp", 3, "DOCTOR", "respiratory"],
  ["DOCTOR", "neurology", "stroke", "Bác sĩ thần kinh", 2, "DOCTOR", "neuro"],
  ["DOCTOR", "neurology", "stroke", "Stroke Doctor", 1, "DOCTOR", "neuro"],
  ["DOCTOR", "outpatient-internal", "int-exam", "Bác sĩ nội tổng quát", 3, "DOCTOR", "er"],
  ["DOCTOR", "outpatient-surgery", "surg-exam", "Bác sĩ ngoại tổng quát", 2, "DOCTOR", "er"],
  ["DOCTOR", "outpatient-peds", "peds-exam", "Bác sĩ nhi", 2, "DOCTOR", "er"],
  ["DOCTOR", "radiology", "rad-ct", "Bác sĩ chẩn đoán hình ảnh", 3, "DOCTOR", "er"],
  ["DOCTOR", "lab", "lab-biochem", "Bác sĩ xét nghiệm", 1, "DOCTOR", "er"],
  // Điều dưỡng
  ["NURSE", "emergency", "triage", "Triage Nurse", 2, "NURSE", "er"],
  ["NURSE", "emergency", "resus", "Điều dưỡng hồi sức cấp cứu", 2, "NURSE", "er"],
  ["NURSE", "emergency", "amb-ref", "Điều dưỡng trực cấp cứu", 3, "NURSE", "er"],
  ["NURSE", "emergency", "triage", "Điều dưỡng trưởng khoa Cấp cứu", 1, "NURSE", "er"],
  ["NURSE", "icu", "icu-general", "Điều dưỡng ICU", 6, "NURSE", "er"],
  ["NURSE", "icu", "icu-general", "Điều dưỡng trưởng ICU", 1, "NURSE", "er"],
  ["NURSE", "icu", "crrt", "Điều dưỡng CRRT", 1, "NURSE", "er"],
  ["NURSE", "cardiology", "cardio-ward", "Điều dưỡng tim mạch", 4, "NURSE", "er"],
  ["NURSE", "cardiology", "cathlab", "Điều dưỡng Cath Lab", 2, "NURSE", "er"],
  ["NURSE", "orthopedic", "or", "OR Nurse", 3, "NURSE", "er"],
  ["NURSE", "orthopedic", "rehab", "Điều dưỡng PHCN", 2, "NURSE", "er"],
  ["NURSE", "pulmonary", "isolation", "Điều dưỡng hô hấp", 3, "NURSE", "er"],
  ["NURSE", "neurology", "stroke", "Stroke Nurse", 3, "NURSE", "er"],
  ["NURSE", "outpatient-internal", "int-exam", "Điều dưỡng khám bệnh", 2, "NURSE", "er"],
  ["NURSE", "outpatient-surgery", "surg-exam", "Điều dưỡng khám bệnh", 1, "NURSE", "er"],
  ["NURSE", "outpatient-peds", "peds-exam", "Điều dưỡng nhi", 1, "NURSE", "er"],
  ["NURSE", "vaccination", "vac-room", "Điều dưỡng tiêm chủng", 2, "NURSE", "er"],
  ["NURSE", "icu", "blood-bank", "Nhân viên kho máu", 1, "NURSE", "er"],
  ["NURSE", "neurology", "stroke", "Nhân viên PHCN đột quỵ", 2, "NURSE", "er"],
  ["NURSE", "emergency", "amb-ref", "Điều dưỡng trực cấp cứu", 2, "NURSE", "er"],
  ["NURSE", "icu", "icu-general", "Điều dưỡng ICU", 2, "NURSE", "er"],
  ["NURSE", "cardiology", "cardio-ward", "Điều dưỡng tim mạch", 2, "NURSE", "er"],
  ["NURSE", "neurology", "stroke", "Stroke Nurse", 1, "NURSE", "er"],
  // Kỹ thuật viên
  ["TECHNICIAN", "lab", "lab-hema", "Kỹ thuật viên huyết học", 2, null, null],
  ["TECHNICIAN", "lab", "lab-biochem", "Kỹ thuật viên sinh hóa", 2, null, null],
  ["TECHNICIAN", "lab", "lab-micro", "Kỹ thuật viên vi sinh", 1, null, null],
  ["TECHNICIAN", "lab", "lab-immuno", "Kỹ thuật viên miễn dịch", 1, null, null],
  ["TECHNICIAN", "lab", "lab-reception", "Nhân viên tiếp nhận mẫu", 1, null, null],
  ["TECHNICIAN", "lab", "lab-result", "Nhân viên kiểm soát chất lượng XN", 1, null, null],
  ["TECHNICIAN", "radiology", "rad-xray", "Kỹ thuật viên X-quang", 2, null, null],
  ["TECHNICIAN", "radiology", "rad-ct", "Kỹ thuật viên CT", 1, null, null],
  ["TECHNICIAN", "radiology", "rad-mri", "Kỹ thuật viên MRI", 1, null, null],
  ["TECHNICIAN", "radiology", "rad-us", "Kỹ thuật viên siêu âm", 1, null, null],
  ["TECHNICIAN", "radiology", "rad-ct", "Kỹ thuật viên Cath Lab", 1, null, null],
  ["TECHNICIAN", "pulmonary", "pft", "Pulmonary Function Technician", 1, null, null],
  ["TECHNICIAN", "icu", "crrt", "Kỹ thuật viên CRRT", 1, null, null],
  ["TECHNICIAN", "icu", "blood-bank", "Kỹ thuật viên kho máu", 1, null, null],
  ["TECHNICIAN", "orthopedic", "or", "Surgical Technician", 1, null, null],
  ["TECHNICIAN", "orthopedic", "rehab", "Physiotherapy Staff", 2, null, null],
  ["TECHNICIAN", "biomedical", "biomed-eng", "Biomedical Engineer", 1, null, null],
  ["TECHNICIAN", "orthopedic", "or", "Anesthesiology Staff", 1, null, null],
  // Dược sĩ
  ["PHARMACIST", "pharmacy", "pharm-clinical", "Dược sĩ lâm sàng", 2, null, null],
  ["PHARMACIST", "pharmacy", "pharm-dispense", "Dược sĩ cấp phát", 3, null, null],
  ["PHARMACIST", "pharmacy", "pharm-warehouse", "Nhân viên kho thuốc", 2, null, null],
  ["PHARMACIST", "pharmacy", "pharm-warehouse", "Nhân viên kiểm kê thuốc", 1, null, null],
  ["PHARMACIST", "pharmacy", "pharm-dispense", "Dược sĩ cấp phát", 1, null, null],
  ["PHARMACIST", "pharmacy", "pharm-clinical", "Dược sĩ lâm sàng", 1, null, null],
  // Kế toán / BHYT / viện phí
  ["FINANCE_STAFF", "finance", "fin-accounting", "Kế toán viên", 3, null, null],
  ["FINANCE_STAFF", "finance", "fin-cashier", "Nhân viên viện phí", 2, null, null],
  ["FINANCE_STAFF", "finance", "fin-insurance", "Nhân viên BHYT", 2, null, null],
  ["FINANCE_STAFF", "insurance-desk", "ins-verify", "Nhân viên xác minh hồ sơ BHYT", 2, null, null],
  // CNTT
  ["IT_STAFF", "it", "it-infra", "System Administrator", 1, null, null],
  ["IT_STAFF", "it", "it-infra", "Network Administrator", 1, null, null],
  ["IT_STAFF", "it", "it-infra", "Database Administrator", 1, null, null],
  ["IT_STAFF", "it", "it-app", "Application Support", 2, null, null],
  ["IT_STAFF", "it", "it-app", "Helpdesk", 3, null, null],
  ["EMR_ADMIN", "emr", "emr-admin", "Health Data Manager", 1, null, null],
  ["IT_STAFF", "emr", "emr-quality", "Data Quality Officer", 1, null, null],
  // Hành chính / nhân sự / kế hoạch
  ["HR_STAFF", "hr", "hr-records", "Chuyên viên nhân sự", 2, null, null],
  ["HR_STAFF", "hr", "hr-records", "Nhân viên hồ sơ", 1, null, null],
  ["ADMIN_STAFF", "planning", "plan-coord", "Điều phối viên kế hoạch", 1, null, null],
  ["ADMIN_STAFF", "planning", "plan-stats", "Nhân viên thống kê", 1, null, null],
  ["ADMIN_STAFF", "admin-office", "adm-general", "Nhân viên hành chính", 2, null, null],
  ["SUPPORT_STAFF", "admin-office", "adm-facility", "Nhân viên cơ sở vật chất", 1, null, null],
  // Tiếp nhận / kiosk / SOS
  ["ADMIN_STAFF", "reception", "recep-desk", "Nhân viên tiếp nhận", 3, null, null],
  ["SUPPORT_STAFF", "reception", "recep-guide", "Nhân viên hướng dẫn", 2, null, null],
  ["ADMIN_STAFF", "kiosk", "kiosk-ops", "Kiosk Operator", 1, null, null],
  ["SUPPORT_STAFF", "kiosk", "kiosk-ops", "Nhân viên hỗ trợ kiosk", 1, null, null],
  ["ADMIN_STAFF", "sos-support", "sos-intake", "Emergency Intake Operator", 1, null, null],
  ["ADMIN_STAFF", "sos-support", "sos-care", "Patient Support Operator", 1, null, null],
  ["ADMIN_STAFF", "vaccination", "vac-room", "Nhân viên tiêm chủng", 1, null, null],
  // Cấp cứu: điều phối xe / EMT
  ["ADMIN_STAFF", "emergency", "amb-ref", "Ambulance Coordinator", 1, null, null],
  ["ADMIN_STAFF", "emergency", "amb-ref", "Referral Coordinator", 1, null, null],
  ["SUPPORT_STAFF", "emergency", "amb-ref", "EMT/Paramedic", 2, null, null],
  ["SUPPORT_STAFF", "gate-security", "gate-guard", "Bảo vệ", 3, null, null],
  ["SUPPORT_STAFF", "gate-security", "gate-traffic", "Nhân viên điều phối xe cấp cứu", 1, null, null],
  // Hỗ trợ: KSNK, dinh dưỡng, CTXH, vật tư, CL, vận chuyển, vệ sinh, kỹ thuật
  ["SUPPORT_STAFF", "infection", "inf-ops", "Nhân viên kiểm soát nhiễm khuẩn", 1, null, null],
  ["SUPPORT_STAFF", "nutrition", "nut-kitchen", "Nhân viên dinh dưỡng", 1, null, null],
  ["SUPPORT_STAFF", "social", "soc-support", "Social Worker", 1, null, null],
  ["TECHNICIAN", "biomedical", "biomed-stock", "Inventory Officer (vật tư)", 1, null, null],
  ["ADMIN_STAFF", "quality", "q-ops", "Quality Officer", 1, null, null],
  ["SUPPORT_STAFF", "transport", "trans-team", "Nhân viên vận chuyển", 3, null, null],
  ["SUPPORT_STAFF", "cleaning", "clean-team", "Nhân viên vệ sinh", 3, null, null],
  ["SUPPORT_STAFF", "engineering", "eng-electrical", "Electrical Technician", 1, null, null],
  ["SUPPORT_STAFF", "engineering", "eng-hvac", "HVAC Technician", 1, null, null],
  ["SUPPORT_STAFF", "engineering", "eng-gas", "Medical Gas Technician", 1, null, null],
  ["REVIEW_OFFICER", "clinical-review", "crs-flag", "Clinical Review Officer", 1, "ADMIN", null],
  ["ADMIN_STAFF", "pulmonary", "isolation", "Isolation Unit Lead", 1, null, null],
  ["ADMIN_STAFF", "neurology", "stroke", "Stroke Team Lead", 1, null, null],
];

const SPECIALTY_BY_DEPT = {
  emergency: "Cấp cứu", icu: "Hồi sức tích cực", cardiology: "Tim mạch", orthopedic: "Chấn thương chỉnh hình",
  pulmonary: "Hô hấp", neurology: "Thần kinh", "outpatient-internal": "Nội tổng quát", "outpatient-surgery": "Ngoại tổng quát",
  "outpatient-peds": "Nhi khoa", vaccination: "Tiêm chủng", radiology: "Chẩn đoán hình ảnh", lab: "Xét nghiệm",
};

for (const [role, department, unit, jobTitle, count, legacyRole, legacyDept] of BULK) {
  const d = deptOf(department);
  for (let i = 0; i < count; i++) {
    addUser({
      role, department, unit, jobTitle,
      building: d.building, floor: d.floors[i % d.floors.length],
      specialty: role === "DOCTOR" ? (SPECIALTY_BY_DEPT[department] || null) : undefined,
      legacyRole, legacyDept,
      onDuty: (seq % 5 !== 0),
    });
  }
}

/* Bổ sung theo yêu cầu (DEMO): 3 tài khoản mới — BS Tim mạch (Tòa C),
 * Điều dưỡng Cấp cứu (Tòa B), Dược sĩ cấp phát (Tòa D). Cùng schema/cột Excel. */
addUser({ username: "bs.quanghuy.cardio", fullName: "Trần Quang Huy", role: "DOCTOR",
  jobTitle: "Bác sĩ tim mạch", department: "cardiology", unit: "cardio-ward",
  building: "C", floor: 1, specialty: "Tim mạch", legacyRole: "DOCTOR", legacyDept: "cardio" });
addUser({ username: "dd.thuylinh.er", fullName: "Nguyễn Thùy Linh", role: "NURSE",
  jobTitle: "Điều dưỡng cấp cứu", department: "emergency", unit: "triage",
  building: "B", floor: 1, legacyRole: "NURSE", legacyDept: "er" });
addUser({ username: "ds.minhchau.pharmacy", fullName: "Lê Minh Châu", role: "PHARMACIST",
  jobTitle: "Dược sĩ cấp phát", department: "pharmacy", unit: "pharm-dispense",
  building: "D", floor: 1 });

/* Một vài trạng thái khác nhau để test khóa/mở (mặc định ACTIVE) */
function setStatus(username, status) {
  const u = USERS.find((x) => x.username === username);
  if (u) u.status = status;
}
(function seedStatuses() {
  const locked = USERS.filter((u) => u.role === "SUPPORT_STAFF").slice(0, 1);
  const inactive = USERS.filter((u) => u.role === "ADMIN_STAFF").slice(0, 2);
  const pending = USERS.filter((u) => u.role === "TECHNICIAN").slice(0, 1);
  locked.forEach((u) => (u.status = "LOCKED"));
  inactive.forEach((u) => (u.status = "INACTIVE"));
  pending.forEach((u) => (u.status = "PENDING"));
})();

/* ================= HELPERS ================= */
function safeUser(u) {
  const { password: _pw, ...rest } = u;
  return rest;
}
function findByEmail(email) {
  return USERS.find((x) => x.email === String(email || "").toLowerCase().trim());
}
function findByUsername(username) {
  return USERS.find((x) => x.username === String(username || "").toLowerCase().trim());
}
function getPermissions(roleId) {
  return ROLE_PERMISSIONS[roleId] || [];
}
function userHasPermission(user, perm) {
  if (!user) return false;
  if (user.role === "SUPER_ADMIN") return true;
  return getPermissions(user.role).includes(perm);
}
/** Kiểm tra phạm vi tổ chức: user có được tác động scope target không */
function inScope(user, target = {}) {
  if (!user) return false;
  if (user.role === "SUPER_ADMIN" || user.role === "HOSPITAL_DIRECTOR") return true;
  if (["IT_ADMIN", "EMR_ADMIN"].includes(user.role)) return true; // kỹ thuật, nhưng dataAccess=technical only
  const s = user.scope || {};
  if (user.role === "DEPUTY_DIRECTOR" || user.role === "HR_MANAGER" || user.role === "FINANCE_MANAGER" ||
      user.role === "QUALITY_MANAGER" || user.role === "REVIEW_OFFICER" || user.role === "COMMAND_OPERATOR" ||
      user.role === "DATA_ANALYST" || user.role === "MEDICAL_BOARD") return true; // phạm vi toàn viện theo chức năng
  if (user.role === "BUILDING_MANAGER") {
    if (target.building && s.building) return target.building === s.building;
    return true;
  }
  if (["DEPARTMENT_HEAD", "DEPUTY_HEAD", "FUNCTIONAL_MANAGER"].includes(user.role)) {
    if (target.department) return target.department === s.department;
    if (target.building) return target.building === s.building;
    return true;
  }
  // Nhân viên: chỉ đúng khoa/phòng của mình
  if (target.department) return target.department === s.department;
  if (target.building) return target.building === s.building;
  return true;
}
function orgTree() {
  return BUILDINGS.map((b) => ({
    ...b,
    departments: DEPARTMENTS.filter((d) => d.building === b.id).map((d) => ({
      ...d,
      headUser: safeUser(USERS.find((u) => u.username === d.head) || {}),
      staffCount: USERS.filter((u) => u.department === d.id).length,
    })),
  }));
}
function summary() {
  const count = (fn) => USERS.filter(fn).length;
  return {
    hospital: HOSPITAL_NAME,
    totalAccounts: USERS.length,
    active: count((u) => u.status === "ACTIVE"),
    inactive: count((u) => u.status === "INACTIVE"),
    locked: count((u) => u.status === "LOCKED"),
    pending: count((u) => u.status === "PENDING"),
    doctors: count((u) => ["DOCTOR", "DEPARTMENT_HEAD", "DEPUTY_HEAD"].includes(u.role) && (u.specialty || u.department)),
    nurses: count((u) => u.role === "NURSE"),
    technicians: count((u) => u.role === "TECHNICIAN"),
    pharmacists: count((u) => u.role === "PHARMACIST"),
    it: count((u) => ["IT_ADMIN", "IT_STAFF", "EMR_ADMIN"].includes(u.role)),
    managers: count((u) => ["HOSPITAL_DIRECTOR", "DEPUTY_DIRECTOR", "MEDICAL_BOARD", "DEPARTMENT_HEAD", "DEPUTY_HEAD", "FUNCTIONAL_MANAGER", "HR_MANAGER", "FINANCE_MANAGER", "QUALITY_MANAGER", "BUILDING_MANAGER", "COMMAND_OPERATOR"].includes(u.role)),
    finance: count((u) => ["FINANCE_MANAGER", "FINANCE_STAFF"].includes(u.role)),
    hr: count((u) => ["HR_MANAGER", "HR_STAFF"].includes(u.role)),
    admin: count((u) => ["ADMIN_STAFF", "SUPPORT_STAFF", "HR_STAFF", "FINANCE_STAFF"].includes(u.role)),
    roles: ROLES.length,
    permissions: PERMISSIONS.length,
    departments: DEPARTMENTS.length,
    buildings: BUILDINGS.length,
  };
}
function doctors() {
  return USERS.filter((u) => u.role === "DOCTOR" || u.role === "DEPARTMENT_HEAD" || u.role === "DEPUTY_HEAD")
    .filter((u) => u.specialty || u.department);
}

module.exports = {
  HOSPITAL_NAME, DEMO_PASSWORD, DEMO_BANNER,
  BUILDINGS, DEPARTMENTS, ROLES, PERMISSIONS, ROLE_PERMISSIONS,
  USERS, BULK,
  safeUser, findByEmail, findByUsername, getPermissions, userHasPermission, inScope,
  orgTree, summary, doctors,
};

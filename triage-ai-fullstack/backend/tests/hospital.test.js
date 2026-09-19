/**
 * Hospital DEMO1 tests — BVĐK TW DEMO1 (DEMO/MOCK/SEEDED).
 * Auth + RBAC + Scope + Organization + Excel invariants + API mới.
 * Chạy: node --test tests/ (đã có trong npm test)
 */
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

process.env.DB_SNAPSHOT_FILE = path.join(__dirname, ".test.hospital.snapshot.json");
process.env.DATABASE_URL = path.join(__dirname, ".test.hospital.db");
for (const f of [".test.hospital.snapshot.json", ".test.hospital.db", ".test.hospital.db-wal", ".test.hospital.db-shm"]) { try { fs.unlinkSync(path.join(__dirname, f)); } catch {} }

const { app, server } = require("../server.js");
const H = require("../lib/hospital.js");

let base;
async function api(method, p, body, token) {
  const r = await fetch(`${base}${p}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}
const loginAs = (emailOrUser, pw = "Demo@2026!") =>
  api("POST", "/api/auth/login", emailOrUser.includes("@") ? { email: emailOrUser, password: pw } : { username: emailOrUser, password: pw });

const firstActive = (role) => H.USERS.find((u) => u.role === role && u.status === "ACTIVE");

describe("hospital DEMO1", () => {
  let DIRECTOR, EM_HEAD, NURSE, TECH, PHARM, FIN, HRM, ITB, BUILD_B, PAT;
  let lockedUser, inactiveUser, pendingUser;

  before(async () => {
    await new Promise((r) => server.listen(0, r));
    base = `http://127.0.0.1:${server.address().port}`;
    DIRECTOR = (await loginAs("director.demo")).data.data.token;
    EM_HEAD = (await loginAs("emergency.head.demo")).data.data.token;
    NURSE = (await loginAs(firstActive("NURSE").username)).data.data.token;
    TECH = (await loginAs(firstActive("TECHNICIAN").username)).data.data.token;
    PHARM = (await loginAs(firstActive("PHARMACIST").username)).data.data.token;
    FIN = (await loginAs(firstActive("FINANCE_STAFF").username)).data.data.token;
    HRM = (await loginAs("hr.manager.demo")).data.data.token;
    ITB = (await loginAs("building.b.demo")).data.data.token;
    PAT = (await api("POST", "/api/auth/login", { email: "patient@hospital.demo", password: "demo123" })).data.data.token;
    lockedUser = H.USERS.find((u) => u.status === "LOCKED");
    inactiveUser = H.USERS.find((u) => u.status === "INACTIVE");
    pendingUser = H.USERS.find((u) => u.status === "PENDING");
  });

  after(() => new Promise((r) => server.close(r)));

  test("seed >= 200 users, username/employeeId unique, đủ role + scope", async () => {
    assert.ok(H.USERS.length >= 200, `got ${H.USERS.length}`);
    assert.equal(new Set(H.USERS.map((u) => u.username)).size, H.USERS.length);
    assert.equal(new Set(H.USERS.map((u) => u.employeeId)).size, H.USERS.length);
    assert.ok(H.USERS.every((u) => u.role && u.username && u.employeeId && u.email));
    assert.ok(H.USERS.every((u) => u.scope && u.scope.level !== undefined));
    const s = H.summary();
    assert.ok(s.doctors >= 50 && s.doctors <= 70, `doctors=${s.doctors}`);
    assert.ok(s.nurses >= 45 && s.nurses <= 60, `nurses=${s.nurses}`);
    assert.ok(s.technicians >= 20 && s.technicians <= 25, `techs=${s.technicians}`);
    assert.ok(s.pharmacists >= 8 && s.pharmacists <= 12, `pharm=${s.pharmacists}`);
    assert.ok(s.finance >= 8 && s.finance <= 12, `fin=${s.finance}`);
    assert.ok(s.it >= 8 && s.it <= 12, `it=${s.it}`);
  });

  test("18 tài khoản đặc biệt + 4 tài khoản tòa tồn tại", async () => {
    const need = ["director.demo", "deputy.clinical.demo", "deputy.operations.demo", "medical.board.demo",
      "hr.manager.demo", "planning.manager.demo", "finance.manager.demo", "nursing.manager.demo", "it.admin.demo",
      "emergency.head.demo", "icu.head.demo", "cardiology.head.demo", "orthopedic.head.demo", "pulmonary.head.demo",
      "neurology.head.demo", "lab.head.demo", "radiology.head.demo", "pharmacy.head.demo",
      "building.a.demo", "building.b.demo", "building.c.demo", "building.d.demo"];
    const un = new Set(H.USERS.map((u) => u.username));
    assert.deepEqual(need.filter((n) => !un.has(n)), []);
  });

  test("login đúng (email + username) / sai pass 401 / locked-inactive-pending 403", async () => {
    const ok1 = await loginAs("director.demo");
    assert.equal(ok1.status, 200);
    assert.equal(ok1.data.data.user.hospitalRole, "HOSPITAL_DIRECTOR");
    const ok2 = await api("POST", "/api/auth/login", { username: "icu.head.demo", password: "Demo@2026!" });
    assert.equal(ok2.status, 200);
    assert.equal((await loginAs("director.demo", "sai-pass")).status, 401);
    assert.match((await loginAs(lockedUser.username)).data.error, /account_locked/);
    assert.equal((await loginAs(lockedUser.username)).status, 403);
    assert.equal((await loginAs(inactiveUser.username)).status, 403);
    assert.equal((await loginAs(pendingUser.username)).status, 403);
    const me = await api("GET", "/api/auth/me", null, DIRECTOR);
    assert.equal(me.status, 200);
    assert.equal(me.data.data.hospitalRole, "HOSPITAL_DIRECTOR");
  });

  test("RBAC đúng: mỗi role có quyền cần và KHÔNG có quyền cấm (§XL)", async () => {
    const has = (role, perm) => H.userHasPermission({ role }, perm);
    // Bác sĩ: chuyên môn có, tài chính/HR/RBAC không
    assert.ok(has("DOCTOR", "emr.update") && has("DOCTOR", "order.create"));
    assert.ok(!has("DOCTOR", "billing.approve") && !has("DOCTOR", "staff.create") && !has("DOCTOR", "rbac.manage"));
    // Điều dưỡng: thực hiện y lệnh có; chẩn đoán/user/finance không
    assert.ok(has("NURSE", "order.execute"));
    assert.ok(!has("NURSE", "emr.sign") && !has("NURSE", "staff.create") && !has("NURSE", "billing.approve"));
    // Dược: cấp phát có; EMR-admin/HR/RBAC không
    assert.ok(has("PHARMACIST", "pharmacy.dispense"));
    assert.ok(!has("PHARMACIST", "emr.update") && !has("PHARMACIST", "staff.create") && !has("PHARMACIST", "rbac.manage"));
    // Kế toán: billing có; order/prescription/diagnosis không
    assert.ok(has("FINANCE_STAFF", "billing.create"));
    assert.ok(!has("FINANCE_STAFF", "order.create") && !has("FINANCE_STAFF", "emr.update"));
    // IT: kỹ thuật có; sửa bệnh án không
    assert.ok(has("IT_ADMIN", "system.manage") && has("IT_ADMIN", "rbac.manage"));
    assert.ok(!has("IT_ADMIN", "emr.update") && !has("IT_ADMIN", "order.create"));
    // Trưởng khoa: quản lý khoa có; toàn hệ thống không
    assert.ok(has("DEPARTMENT_HEAD", "schedule.manage"));
    assert.ok(!has("DEPARTMENT_HEAD", "rbac.manage") && !has("DEPARTMENT_HEAD", "system.manage"));
  });

  test("permission inspector API phản ánh đúng allowed/denied", async () => {
    const a = await api("GET", "/api/rbac/check?username=director.demo&permission=billing.approve", null, DIRECTOR);
    assert.equal(a.data.data.allowed, true);
    const d = await api("GET", "/api/rbac/check?username=director.demo&permission=system.manage", null, DIRECTOR);
    assert.equal(d.data.data.allowed, false);
    assert.ok(d.data.data.deniedList.includes("system.manage"));
    const m = await api("GET", "/api/rbac/matrix", null, DIRECTOR);
    assert.equal(m.data.data.roleCount, H.ROLES.length);
    assert.equal(m.data.data.permissionCount, H.PERMISSIONS.length);
  });

  test("scope: BS Tòa B không thấy ca riêng Tòa C; trưởng khoa không quản lý ngoài khoa", async () => {
    // P001 thuộc Tim mạch (Tòa C) — BS cấp cứu (Tòa B) bị 403, BS tim mạch OK
    const emDoc = await loginAs(firstActive("DOCTOR").username);
    // tìm 1 BS cấp cứu có legacyDept er
    const erDoc = H.USERS.find((u) => u.role === "DOCTOR" && u.department === "emergency" && u.status === "ACTIVE");
    const erTok = (await loginAs(erDoc.username)).data.data.token;
    assert.equal((await api("GET", "/api/patients/P001/record", null, erTok)).status, 403);
    const cardioDoc = H.USERS.find((u) => u.role === "DOCTOR" && u.department === "cardiology" && u.status === "ACTIVE");
    const cardioTok = (await loginAs(cardioDoc.username)).data.data.token;
    assert.equal((await api("GET", "/api/patients/P001/record", null, cardioTok)).status, 200);
    assert.ok(emDoc.status === 200);
    // Trưởng khoa Cấp cứu xem chi tiết BS tim mạch -> 403 out-of-scope
    assert.equal((await api("GET", `/api/staff/${cardioDoc.username}`, null, EM_HEAD)).status, 403);
    // ...nhưng xem BS khoa mình OK
    assert.equal((await api("GET", `/api/staff/${erDoc.username}`, null, EM_HEAD)).status, 200);
    // Giám đốc xem toàn viện OK
    const all = await api("GET", "/api/staff?limit=5", null, DIRECTOR);
    assert.equal(all.status, 200);
    assert.ok(all.data.data.total >= 200);
  });

  test("tổ chức: 5 tòa, 36 khoa, head đầy đủ, quan hệ NV-khoa-tòa", async () => {
    const t = await api("GET", "/api/org/tree", null, DIRECTOR);
    assert.equal(t.data.data.tree.length, 5);
    const depts = await api("GET", "/api/org/departments", null, DIRECTOR);
    assert.equal(depts.data.data.departments.length, 36);
    assert.ok(depts.data.data.departments.every((d) => d.head && d.totalStaff > 0));
    const er = depts.data.data.departments.find((d) => d.id === "emergency");
    assert.equal(er.head.username, "emergency.head.demo");
    assert.ok(er.doctors >= 5 && er.nurses >= 5);
  });

  test("staff API: 401 thiếu token, 403 thiếu quyền, filter + lock/unlock + reset + audit", async () => {
    assert.equal((await api("GET", "/api/staff")).status, 401);
    assert.equal((await api("GET", "/api/staff", null, PAT)).status, 403);
    const f = await api("GET", "/api/staff?role=NURSE&building=B", null, DIRECTOR);
    assert.ok(f.data.data.items.every((u) => u.role === "NURSE" && u.building === "B"));
    const docs = await api("GET", "/api/staff/doctors?building=C", null, DIRECTOR);
    assert.ok(docs.data.data.items.length > 0 && docs.data.data.items.every((d) => d.building === "C"));
    // doctor không được lock user khác
    const victim = firstActive("SUPPORT_STAFF").username;
    assert.equal((await api("PATCH", `/api/staff/${victim}`, { status: "LOCKED" }, NURSE)).status, 403);
    // HR lock -> login 403 -> reset -> login lại OK
    assert.equal((await api("PATCH", `/api/staff/${victim}`, { status: "LOCKED" }, HRM)).status, 200);
    assert.equal((await loginAs(victim)).status, 403);
    const rs = await api("POST", `/api/staff/${victim}/reset-password`, {}, HRM);
    assert.equal(rs.data.data.demoPassword, "Demo@2026!");
    assert.equal((await loginAs(victim)).status, 200);
    const audit = await api("GET", "/api/audit?limit=50", null, DIRECTOR);
    assert.ok(audit.data.data.some((a) => a.action === "USER_UPDATE" && a.resourceId === victim));
  });

  test("demo portal public + building account scope tòa", async () => {
    const pub = await api("GET", "/api/demo/accounts");
    assert.equal(pub.status, 200);
    const ids = pub.data.data.groups.map((g) => g.id);
    for (const g of ["leadership", "managers", "doctors", "nurses", "technicians", "pharmacists", "finance", "it", "admin", "buildings"]) {
      assert.ok(ids.includes(g), `missing group ${g}`);
    }
    assert.ok(pub.data.data.groups.find((g) => g.id === "leadership").accounts.some((a) => a.username === "director.demo"));
    // building.b xem được org + staff (trong tòa), inspector xác nhận ngoài tòa bị chặn scope
    assert.equal((await api("GET", "/api/org/tree", null, ITB)).status, 200);
    const chk = await api("GET", "/api/rbac/check?username=building.b.demo&permission=building.view&building=C", null, DIRECTOR);
    assert.equal(chk.data.data.allowed, false);
    assert.match(chk.data.data.reason, /phạm vi/);
  });

  test("three primary patient demo accounts and portal groups", async () => {
    for (const username of ["patient.demo.01@hospital.demo", "patient.demo.02@hospital.demo", "patient.demo.03@hospital.demo"]) {
      const loggedIn = await loginAs(username);
      assert.equal(loggedIn.status, 200, username);
      assert.equal(loggedIn.data.data.user.role, "PATIENT");
    }
    const portal = await api("GET", "/api/demo/accounts");
    const patients = portal.data.data.groups.find((g) => g.id === "patients").accounts;
    assert.deepEqual(patients.map((p) => p.username).sort(), [
      "patient.demo.01@hospital.demo", "patient.demo.02@hospital.demo", "patient.demo.03@hospital.demo",
    ]);
    assert.ok(portal.data.data.groups.some((g) => g.id === "caregivers"));
  });

  test("patient/caregiver ACL: profile, results, billing and cross-patient denial", async () => {
    const p2 = await loginAs("patient.demo.02@hospital.demo");
    assert.equal(p2.status, 200);
    const p2Token = p2.data.data.token;
    const profile = await api("GET", "/api/me/profile", null, p2Token);
    assert.equal(profile.status, 200);
    assert.equal(profile.data.data.patientId, "P002");
    assert.equal((await api("GET", "/api/me/labs", null, p2Token)).data.data.length, 0);
    assert.equal((await api("GET", "/api/me/imaging", null, p2Token)).data.data.length, 1);
    assert.equal((await api("GET", "/api/me/billing", null, p2Token)).data.data[0].paymentMode, "DEMO PAYMENT");
    const p2Appointments = (await api("GET", "/api/me/appointments?patientId=P001", null, p2Token)).data.data;
    assert.ok(p2Appointments.every((a) => a.patientId === "P002"));
    const checkedIn = await api("POST", "/api/me/appointments/A003/check-in", {}, p2Token);
    assert.equal(checkedIn.status, 200);
    assert.equal(checkedIn.data.data.status, "ARRIVED");

    assert.ok((await api("GET", "/api/me/labs", null, PAT)).data.data.some((l) => l.status === "RELEASED"));

    const caregiver = await loginAs("caregiver.demo.01@hospital.demo");
    assert.equal(caregiver.status, 200);
    const caregiverToken = caregiver.data.data.token;
    assert.equal((await api("GET", "/api/me/linked-patients", null, caregiverToken)).data.data[0].patientId, "P001");
    assert.equal((await api("GET", "/api/me/labs", null, caregiverToken)).status, 200);
    assert.equal((await api("GET", "/api/me/billing", null, caregiverToken)).status, 403);
    assert.equal((await api("GET", "/api/me/appointments?patientId=P002", null, caregiverToken)).status, 403);
  });

  test("Excel artifact: tồn tại, >= 200 accounts (đối chiếu JSON single-source)", async () => {
    const xlsx = path.join(__dirname, "..", "..", "release", "demo-hospital-accounts.xlsx");
    assert.ok(fs.existsSync(xlsx), "release/demo-hospital-accounts.xlsx missing");
    assert.ok(fs.statSync(xlsx).size > 10000);
    // invariants nội dung (Excel sinh từ cùng JSON này — verify_excel.py kiểm tra sheets)
    assert.ok(H.USERS.length >= 200);
    assert.ok(H.doctors().length >= 50);
  });
});

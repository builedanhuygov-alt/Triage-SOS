/**
 * V2 tests — vòng đời PATIENT->ENCOUNTER->...->PATIENT APP + RBAC mới + security.
 * Chạy: node --test tests/v2.test.js (đã có trong npm test)
 */
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

process.env.DB_SNAPSHOT_FILE = path.join(__dirname, ".test.v2.snapshot.json");
process.env.DATABASE_URL = path.join(__dirname, ".test.v2.db");
for (const f of [".test.v2.snapshot.json", ".test.v2.db", ".test.v2.db-wal", ".test.v2.db-shm"]) { try { fs.unlinkSync(path.join(__dirname, f)); } catch {} }

const { server } = require("../server.js");
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
const firstActive = (role) => H.USERS.find((u) => u.role === role && u.status === "ACTIVE");
const loginDemo = (u, pw = "Demo@2026!") => api("POST", "/api/auth/login", { username: u, password: pw });

describe("v2 clinical + ops", () => {
  let CEO, DIRECTOR, DEPUTY, EMHEAD, CARDIO, CARDIOHEAD, NURSE, ACC, FINMGR, PHARM, CLERK, IT, PAT, CG;
  let encId, rxId, msId, payId;

  before(async () => {
    await new Promise((r) => server.listen(0, r));
    base = `http://127.0.0.1:${server.address().port}`;
    CEO = (await api("POST", "/api/auth/login", { email: "ceo@hospital.demo", password: "demo123" })).data.data.token;
    DIRECTOR = (await loginDemo("director.demo")).data.data.token;
    DEPUTY = (await loginDemo("deputy.clinical.demo")).data.data.token;
    EMHEAD = (await loginDemo("emergency.head.demo")).data.data.token;
    CARDIO = (await loginDemo(H.USERS.find((u) => u.role === "DOCTOR" && u.department === "cardiology" && u.status === "ACTIVE").username)).data.data.token;
    CARDIOHEAD = (await loginDemo("cardiology.head.demo")).data.data.token;
    NURSE = (await loginDemo(firstActive("NURSE").username)).data.data.token;
    ACC = (await loginDemo(firstActive("FINANCE_STAFF").username)).data.data.token;
    FINMGR = (await loginDemo("finance.manager.demo")).data.data.token;
    PHARM = (await loginDemo(firstActive("PHARMACIST").username)).data.data.token;
    CLERK = (await loginDemo(H.USERS.find((u) => u.role === "ADMIN_STAFF" && u.status === "ACTIVE").username)).data.data.token;
    IT = (await loginDemo(H.USERS.find((u) => u.role === "IT_STAFF" && u.status === "ACTIVE").username)).data.data.token;
    PAT = (await api("POST", "/api/auth/login", { email: "patient@hospital.demo", password: "demo123" })).data.data.token;
    CG = (await api("POST", "/api/auth/login", { email: "caregiver@hospital.demo", password: "demo123" })).data.data.token;
  });
  after(() => new Promise((r) => server.close(r)));

  test("RBAC mới: whoami + deputy/head/doctor/nurse/acc/pharm/clerk/it/patient/caregiver", async () => {
    const w = await api("GET", "/api/rbac/whoami", null, DIRECTOR);
    assert.ok(w.data.data.permissions.includes("RESOURCE_APPROVE"));
    // director mang legacy CEO nên rộng; deputy (DEPUTY_DIRECTOR thuần) không có DIAGNOSIS_UPDATE
    const wdep = await api("GET", "/api/rbac/whoami", null, DEPUTY);
    assert.ok(!wdep.data.data.permissions.includes("DIAGNOSIS_UPDATE"));
    const wn = await api("GET", "/api/rbac/whoami", null, NURSE);
    assert.ok(!wn.data.data.permissions.includes("DIAGNOSIS_UPDATE"));
    assert.ok(wn.data.data.permissions.includes("SOS_UPDATE"));
    // clerk (văn thư) có DOCUMENT_CREATE, không có DIAGNOSIS_UPDATE
    const wc = await api("GET", "/api/rbac/whoami", null, CLERK);
    assert.ok(wc.data.data.permissions.includes("DOCUMENT_CREATE"));
    assert.ok(!wc.data.data.permissions.includes("PAYMENT_VERIFY"));
    // deputy có DOCUMENT_APPROVE + RESOURCE_APPROVE
    const wd = await api("GET", "/api/rbac/whoami", null, DEPUTY);
    assert.ok(wd.data.data.permissions.includes("DOCUMENT_APPROVE"));
  });

  test("intake: thiếu tên 400; trùng BN 409 rồi confirmDuplicate; chart thống nhất", async () => {
    assert.equal((await api("POST", "/api/patients/intake", {}, EMHEAD)).status, 400);
    const body = { fullName: "Nguyễn Văn Test", cccd: "0799V2001", dob: "1990-01-01", gender: "Nam",
      phone: "0909000001", address: "Q.1", department: "cardio", building: "C", symptom: "Hồi hộp",
      bhytCode: "DN9999000001", emergencyContact: { name: "Vợ", phone: "0909000002", relation: "vợ" } };
    const r1 = await api("POST", "/api/patients/intake", body, EMHEAD);
    assert.equal(r1.status, 201);
    assert.match(r1.data.data.encounter.id, /^ENC-/);
    encId = r1.data.data.encounter.id;
    const dup = await api("POST", "/api/patients/intake", body, EMHEAD);
    assert.equal(dup.status, 409);
    assert.ok(dup.data.data.candidates.length > 0);
    const okDup = await api("POST", "/api/patients/intake", { ...body }, EMHEAD);
    assert.equal(okDup.status, 409); // vẫn chặn khi chưa confirm
    // chart: BS cardio (đúng khoa) OK
    const chart = await api("GET", `/api/patients/${r1.data.data.patient.patientId}/chart`, null, CARDIO);
    assert.equal(chart.status, 200);
    assert.ok(chart.data.data.profile && Array.isArray(chart.data.data.encounters));
  });

  test("clinical journey đầy đủ: note(AI draft)->confirm->diagnosis->order->result->release->rx->approve->dispense->bill->pay->followup", async () => {
    assert.equal((await api("PATCH", `/api/encounters/${encId}`, { status: "IN_EXAM" }, CARDIO)).status, 200);
    const note = await api("POST", `/api/encounters/${encId}/notes`, { text: "AI gợi ý: theo dõi men tim", kind: "NOTE", aiSuggested: true }, CARDIO);
    assert.equal(note.status, 201);
    assert.equal(note.data.data.confirmed, false);
    const conf = await api("POST", `/api/notes/${note.data.data.id}/confirm`, {}, CARDIO);
    assert.equal(conf.data.data.confirmed, true);
    const dx = await api("POST", `/api/encounters/${encId}/diagnosis`, { code: "I21", text: "NMCT cấp (demo)" }, CARDIO);
    assert.equal(dx.status, 201);
    const ord = await api("POST", `/api/encounters/${encId}/orders`, { kind: "LAB", test: "Troponin" }, CARDIO);
    assert.equal(ord.status, 201);
    const res = await api("POST", `/api/care-orders/${ord.data.data.id}/result`, { summary: "Troponin tăng (demo)" }, CARDIOHEAD);
    assert.equal(res.status, 201);
    // nurse không verify được
    assert.equal((await api("POST", `/api/care-orders/${ord.data.data.id}/result`, { summary: "x" }, NURSE)).status, 403);
    const rel = await api("POST", `/api/results/${res.data.data.id}/release`, {}, CARDIOHEAD);
    assert.equal(rel.data.data.status, "RELEASED");
    const rx = await api("POST", `/api/encounters/${encId}/prescriptions`,
      { items: [{ drug: "Aspirin", dosage: "100mg", times: ["08:00", "20:00"], qty: 14, instructions: "Sau ăn" }] }, CARDIO);
    assert.equal(rx.status, 201);
    rxId = rx.data.data.prescription.id; msId = rx.data.data.schedule.id;
    assert.equal((await api("POST", `/api/prescriptions/${rxId}/approve`, {}, CARDIO)).status, 403); // BS thường không duyệt
    assert.equal((await api("POST", `/api/prescriptions/${rxId}/approve`, {}, EMHEAD)).status, 403); // trưởng khoa khác khoa không duyệt
    assert.equal((await api("POST", `/api/prescriptions/${rxId}/approve`, {}, CARDIOHEAD)).status, 200); // trưởng khoa tim mạch duyệt
    assert.equal((await api("POST", `/api/prescriptions/${rxId}/dispense`, {}, PHARM)).status, 200);
    const bill = await api("POST", `/api/encounters/${encId}/bills`, { items: [{ label: "Khám", amount: 200000 }, { label: "Thuốc", amount: 150000 }] }, ACC);
    assert.equal(bill.status, 201);
    payId = bill.data.data.payment.id;
    assert.match(bill.data.data.payment.qr, new RegExp(payId));
    // BS không được confirm thanh toán thay kế toán (kế toán viên cũng không verify)
    assert.equal((await api("POST", `/api/payments/${payId}/confirm`, { method: "CASH" }, CARDIO)).status, 403);
    assert.equal((await api("POST", `/api/payments/${payId}/confirm`, { method: "CASH" }, ACC)).status, 403);
    const paid = await api("POST", `/api/payments/${payId}/confirm`, { method: "CASH", payer: "Nguyễn Văn Test" }, FINMGR);
    assert.equal(paid.data.data.payment.status, "PAID");
    assert.ok(paid.data.data.receipt.txn === payId);
    const fu = await api("POST", `/api/encounters/${encId}/followups`, { date: "2026-10-10", time: "09:00", note: "Tái khám" }, CARDIO);
    assert.equal(fu.status, 201);
    const j = await api("GET", `/api/encounters/${encId}/journey`, null, CARDIO);
    assert.ok(j.data.data.steps.every((s) => s.done));
  });

  test("security: A/B, sai khoa, KT/chẩn đoán, ĐD/chẩn đoán, IT/clinical, caregiver ngoài grant", async () => {
    // Patient A (P001) không xem chart P002
    assert.equal((await api("GET", "/api/patients/P002/chart", null, PAT)).status, 403);
    // BS cardio không sửa encounter khoa neuro (tạo bằng CEO)
    const ne = await api("POST", "/api/encounters", { patientId: "P002", department: "neuro", building: "C" }, CEO);
    assert.equal(ne.status, 201);
    assert.equal((await api("PATCH", `/api/encounters/${ne.data.data.id}`, { status: "IN_EXAM" }, CARDIO)).status, 403);
    const deniedAudit = await api("GET", "/api/audit?limit=100", null, CEO);
    assert.ok(deniedAudit.data.data.some((a) => a.action === "SCOPE_DENIED"));
    // Kế toán / Điều dưỡng không tạo chẩn đoán; IT không tạo order
    assert.equal((await api("POST", `/api/encounters/${encId}/diagnosis`, { text: "x" }, ACC)).status, 403);
    assert.equal((await api("POST", `/api/encounters/${encId}/diagnosis`, { text: "x" }, NURSE)).status, 403);
    assert.equal((await api("POST", `/api/encounters/${encId}/orders`, { kind: "LAB", test: "x" }, IT)).status, 403);
    // Caregiver xem P001 (có grant) OK, P002 (ngoài grant) 403
    assert.equal((await api("GET", "/api/patients/P001/chart", null, CG)).status, 200);
    assert.equal((await api("GET", "/api/patients/P002/chart", null, CG)).status, 403);
  });

  test("SOS lifecycle + không đi lùi; emergency desk thấy", async () => {
    const s = await api("POST", "/api/sos", { name: "Dân Demo", phone: "0911000000", lat: 10.77, lng: 106.70 });
    assert.equal(s.status, 201);
    assert.equal(s.data.data.status, "SOS_REQUESTED");
    const id = s.data.data.id;
    for (const st of ["ACKNOWLEDGED", "DISPATCHING", "EN_ROUTE", "ARRIVED", "CLOSED"]) {
      assert.equal((await api("PATCH", `/api/sos/${id}`, { status: st }, EMHEAD)).status, 200);
    }
    assert.equal((await api("PATCH", `/api/sos/${id}`, { status: "EN_ROUTE" }, EMHEAD)).status, 400);
    assert.ok((await api("GET", "/api/sos?status=CLOSED", null, EMHEAD)).data.data.items.some((x) => x.id === id));
  });

  test("resource: request->process->approve trừ kho, alert ngưỡng, không sửa trực tiếp", async () => {
    const list = await api("GET", "/api/resources", null, DIRECTOR);
    const indirak = list.data.data.items.find((r) => r.name.includes("INDIRAK"));
    assert.equal(indirak.qty, 20);
    const req1 = await api("POST", `/api/resources/${indirak.id}/request`, { qty: 1, reason: "Tiêm ngừa ca demo" }, EMHEAD);
    assert.equal(req1.data.data.state, "PENDING_APPROVAL");
    assert.equal(req1.data.data.qtyBefore, 20);
    await api("POST", `/api/approvals/${req1.data.data.id}/process`, {}, PHARM);
    const ap1 = await api("POST", `/api/approvals/${req1.data.data.id}/approve`, { decision: "APPROVE" }, DIRECTOR);
    assert.equal(ap1.data.data.state, "ACTIVE");
    const after = (await api("GET", "/api/resources", null, DIRECTOR)).data.data.items.find((r) => r.id === indirak.id);
    assert.equal(after.qty, 19);
    assert.equal(after.status, "NORMAL");
    // xin thêm 15 -> còn 4 -> CRITICAL/HIGH alert
    const req2 = await api("POST", `/api/resources/${indirak.id}/request`, { qty: 15, reason: "Chiến dịch demo" }, EMHEAD);
    await api("POST", `/api/approvals/${req2.data.data.id}/process`, {}, PHARM);
    await api("POST", `/api/approvals/${req2.data.data.id}/approve`, { decision: "APPROVE" }, DIRECTOR);
    const alerts = await api("GET", "/api/resource-alerts", null, DIRECTOR);
    const hit = alerts.data.data.items.find((a) => a.id === indirak.id);
    assert.ok(hit && hit.qty === 4 && ["HIGH", "CRITICAL"].includes(hit.priority));
    // không có endpoint sửa trực tiếp số lượng
    assert.equal((await api("PATCH", `/api/resources/${indirak.id}`, { qty: 99 }, DIRECTOR)).status, 404);
    // kho máu LOW đã seed -> alerts có mặt
    assert.ok(alerts.data.data.items.some((a) => a.name.includes("Máu O")));
  });

  test("medication schedule: remind->TAKEN, sweep->MISSED, không tự TAKEN", async () => {
    // BN chỉ thao tác schedule của chính mình (P001)
    const enc = await api("POST", "/api/encounters", { patientId: "P001", department: "cardio", building: "C" }, CEO);
    assert.equal(enc.status, 201);
    const rx = await api("POST", `/api/encounters/${enc.data.data.id}/prescriptions`,
      { items: [{ drug: "Aspirin P001", dosage: "100mg", times: ["08:00"], qty: 10 }] }, CARDIO);
    assert.equal(rx.status, 201);
    const myMs = rx.data.data.schedule.id;
    // BN khác bệnh nhân không chạm được schedule của ca journey
    assert.equal((await api("POST", `/api/meds/schedule/${msId}/confirm`, { doseIndex: 0 }, PAT)).status, 403);
    const r1 = await api("POST", `/api/meds/schedule/${myMs}/remind`, {}, PAT);
    assert.ok(r1.data.data.reminded >= 1);
    const c1 = await api("POST", `/api/meds/schedule/${myMs}/confirm`, { doseIndex: 0 }, PAT);
    assert.equal(c1.data.data.doses[0].state, "TAKEN");
    assert.equal((await api("POST", `/api/meds/schedule/${myMs}/confirm`, { doseIndex: 0 }, PAT)).status, 400);
    // schedule liều rỗng giờ -> sweep => MISSED (trên ca của chính P001)
    const rx2 = await api("POST", `/api/encounters/${enc.data.data.id}/prescriptions`, { items: [{ drug: "Vitamin C", times: [""], qty: 5 }] }, CARDIO);
    const sw = await api("POST", `/api/meds/schedule/${rx2.data.data.schedule.id}/sweep`, {}, PAT);
    assert.equal(sw.data.data.missed, 1);
    const tl = await api("GET", "/api/health-links/timeline?patientId=P001", null, PAT);
    assert.ok(tl.data.data.items.some((x) => x.source === "PATIENT" && String(x.value).includes("Aspirin")));
  });

  test("health data: connect->sync->timeline->disconnect (sync sau disconnect 400)", async () => {
    const c = await api("POST", "/api/health-links", { source: "WEARABLE", device: "DemoWatch", permission: { heart_rate: true } }, PAT);
    assert.equal(c.status, 201);
    const s = await api("POST", "/api/health-links/sync", { source: "WEARABLE", points: [{ kind: "HEART_RATE", value: 78, unit: "bpm" }] }, PAT);
    assert.equal(s.data.data.synced, 1);
    const st = await api("GET", "/api/health-links/status", null, PAT);
    assert.ok(st.data.data[0].lastSync);
    const d = await api("PATCH", "/api/health-links", { source: "WEARABLE", disconnect: true }, PAT);
    assert.equal(d.data.data.connected, false);
    assert.equal((await api("POST", "/api/health-links/sync", { source: "WEARABLE", points: [{ kind: "STEPS", value: 100 }] }, PAT)).status, 400);
  });

  test("BHYT: verify->MANUAL_REVIEW, manual VERIFIED, sai enum 400, BN xem của mình", async () => {
    const v = await api("POST", "/api/bhyt/verify", { patientId: "P002", code: "DN0000000002" }, ACC);
    assert.equal(v.data.data.status, "MANUAL_REVIEW");
    assert.equal(v.data.data.external, "DEMO / SIMULATED");
    assert.equal((await api("POST", "/api/bhyt/manual", { patientId: "P002", result: "OK" }, ACC)).status, 400);
    const m = await api("POST", "/api/bhyt/manual", { patientId: "P002", result: "VERIFIED", note: "Đối chiếu thẻ (demo)" }, ACC);
    assert.equal(m.data.data.verifiedBy, m.data.data.verifiedBy);
    assert.ok(m.data.data.verifiedBy.includes("@"));
  });

  test("documents văn thư + capacity FULL kèm hướng dẫn + version + nearby + overview live", async () => {
    const d = await api("POST", "/api/documents", { direction: "IN", title: "CV test", deadline: "2026-12-31", handler: "clerk" }, CLERK);
    assert.equal(d.status, 201);
    const id = d.data.data.id;
    assert.equal((await api("POST", `/api/documents/${id}/receive`, {}, CLERK)).data.data.status, "PROCESSING");
    assert.equal((await api("PATCH", `/api/documents/${id}/process`, { note: "trình" }, CLERK)).status, 403); // văn thư không có PROCESS
    const fm = await loginDemo("planning.manager.demo");
    assert.equal((await api("PATCH", `/api/documents/${id}/process`, { note: "trình ký" }, fm.data.data.token)).data.data.status, "PENDING_APPROVAL");
    assert.equal((await api("POST", `/api/documents/${id}/approve`, {}, DIRECTOR)).data.data.status, "DONE");
    const cap = await api("PATCH", "/api/capacity/emergency", { status: "FULL" }, EMHEAD);
    assert.ok(cap.data.data.guidance.includes("KHÔNG tự từ chối"));
    const ov = await api("GET", "/api/command/overview?range=30d", null, DIRECTOR);
    assert.equal(ov.data.data.source, "live-stores");
    assert.ok(ov.data.data.intake.received >= 1);
    assert.ok(typeof ov.data.data.finance.revenue === "number");
    const ver = await api("GET", "/api/app/version");
    assert.equal(ver.data.data.currentVersion, "1.4.0");
    assert.equal(ver.data.data.forced, false);
    const nb = await api("GET", "/api/hospitals/nearby?lat=10.7769&lng=106.7009&emergency=1");
    assert.ok(nb.data.data.items[0].distanceKm <= nb.data.data.items[1].distanceKm);
    assert.ok(nb.data.data.items[0].actions.includes("SOS"));
    assert.equal(nb.data.data.realtime, false);
    const qr = await api("GET", `/api/payments/${payId}/qr`, null, ACC);
    assert.ok(qr.data.data.qr.includes(payId));
    assert.ok(!qr.data.data.qr.includes("NMCT"));
  });

  test("anomaly: 3 login fail -> case OPEN; review RESOLVED; audit giàu có before/after", async () => {
    for (let i = 0; i < 3; i++) await api("POST", "/api/auth/login", { email: "ghost@hospital.demo", password: "x" });
    const cases = await api("GET", "/api/anomaly/cases?state=OPEN", null, DIRECTOR);
    assert.ok(cases.data.data.items.some((c) => c.subject === "ghost@hospital.demo"));
    const c = cases.data.data.items.find((x) => x.subject === "ghost@hospital.demo");
    const rv = await api("POST", `/api/anomaly/cases/${c.id}/review`, { decision: "RESOLVED", note: "xac minh demo" }, DIRECTOR);
    assert.equal(rv.data.data.state, "RESOLVED");
    const au = await api("GET", "/api/audit?limit=100", null, DIRECTOR);
    const dxAudit = au.data.data.find((a) => a.action === "DIAGNOSIS_UPDATE");
    assert.ok(dxAudit && "before" in dxAudit && "after" in dxAudit && "where" in dxAudit);
  });
});

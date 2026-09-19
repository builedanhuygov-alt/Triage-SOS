/**
 * API integration tests — chạy server thật trên port ngẫu nhiên.
 * Chạy: node --test tests/
 */
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
// Snapshot riêng cho test (không đụng db.snapshot.json production)
// PHẢI set trước require server vì persistence đọc env lúc load module.
process.env.DB_SNAPSHOT_FILE = require("path").join(__dirname, ".test.snapshot.json");
process.env.DATABASE_URL = path.join(__dirname, ".test.snapshot.db");
for (const f of [".test.snapshot.json", ".test.snapshot.db", ".test.snapshot.db-wal", ".test.snapshot.db-shm"]) { try { fs.unlinkSync(path.join(__dirname, f)); } catch {} }

const { app, server } = require("../server.js");

let base;
async function api(method, path, body, token) {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

describe("api", () => {
  let CEO, ADMIN, DOC, PAT;
  let emId;

  before(async () => {
    await new Promise((r) => server.listen(0, r));
    base = `http://127.0.0.1:${server.address().port}`;
    CEO = (await api("POST", "/api/auth/login", { email: "ceo@hospital.demo", password: "demo123" })).data.data.token;
    ADMIN = (await api("POST", "/api/auth/login", { email: "admin@hospital.demo", password: "demo123" })).data.data.token;
    DOC = (await api("POST", "/api/auth/login", { email: "doctor.er@hospital.demo", password: "demo123" })).data.data.token;
    PAT = (await api("POST", "/api/auth/login", { email: "patient@hospital.demo", password: "demo123" })).data.data.token;
  });

  after(() => new Promise((r) => server.close(r)));

  test("login/me/refresh + 401 khi không token", async () => {
    assert.equal((await api("GET", "/api/auth/me")).status, 401);
    const me = await api("GET", "/api/auth/me", null, CEO);
    assert.equal(me.status, 200);
    assert.equal(me.data.data.role, "CEO");
  });

  test("SOS sạch -> NORMAL + báo động", async () => {
    const r = await api("POST", "/api/emergency", { symptom: "Dau bung du doi", deviceId: "t-clean" });
    assert.equal(r.status, 201);
    assert.equal(r.data.emState, "NORMAL");
    emId = r.data.id;
  });

  test("SOS spam -> FLAGGED, không vào feed (moderation thấy)", async () => {
    let last;
    for (let i = 0; i < 4; i++)
      last = await api("POST", "/api/emergency", { symptom: "Cap cuu khan", deviceId: "t-spam" });
    assert.equal(last.data.emState, "FLAGGED");
    assert.equal(last.data.status, "FLAGGED");
    const mod = await api("GET", "/api/moderation/flagged", null, ADMIN);
    assert.ok(mod.data.data.some((p) => p.id === last.data.id));
  });

  test("RBAC moderation: patient/doctor bị 403", async () => {
    assert.equal((await api("GET", "/api/moderation/flagged", null, PAT)).status, 403);
    assert.equal((await api("GET", "/api/moderation/flagged", null, DOC)).status, 403);
  });

  test("ADMIN approve -> ACTIVE", async () => {
    const flagged = (await api("GET", "/api/moderation/flagged", null, ADMIN)).data.data[0];
    const r = await api("POST", `/api/moderation/${encodeURIComponent(flagged.id)}/review`, { decision: "APPROVE" }, ADMIN);
    assert.equal(r.status, 200);
    assert.equal(r.data.data.emState, "ACTIVE");
  });

  test("doctor cập nhật status đúng khoa -> timeline + broadcast", async () => {
    const r = await api("POST", `/api/patients/${encodeURIComponent(emId)}/status`,
      { status: "PREPARING_OR", message: "Đã chuẩn bị phòng mổ", severity: "HIGH" }, DOC);
    assert.equal(r.status, 200);
    const tl = await api("GET", `/api/patients/${encodeURIComponent(emId)}/timeline`, null, DOC);
    assert.ok(tl.data.data.some((e) => e.state === "PREPARING_OR"));
  });

  test("appointment validation 400 + tạo + sync", async () => {
    const bad = await api("POST", "/api/appointments", { patientId: emId }, DOC);
    assert.equal(bad.status, 400);
    const r = await api("POST", "/api/appointments",
      { patientId: emId, doctorId: "D001", departmentId: "er", type: "FOLLOW_UP", date: "2026-10-02", time: "14:30", location: "P.Khám 03" }, DOC);
    assert.equal(r.status, 201);
    const list = await api("GET", `/api/appointments?patientId=${encodeURIComponent(emId)}`, null, DOC);
    assert.equal(list.data.data.length, 1);
  });

  test("medication prescribe + audit log", async () => {
    const r = await api("POST", `/api/patients/${encodeURIComponent(emId)}/medications`,
      { name: "Paracetamol", dosage: "500mg", schedule: "2 lần/ngày" }, DOC);
    assert.equal(r.status, 201);
    const denied = await api("POST", `/api/patients/${encodeURIComponent(emId)}/medications`, { name: "X" }, PAT);
    assert.equal(denied.status, 403);
    const audit = await api("GET", "/api/audit?limit=5", null, CEO);
    assert.ok(audit.data.data.length > 0);
    assert.equal((await api("GET", "/api/audit", null, PAT)).status, 403);
  });

  test("nurse login + beds list/patch + invalid 400", async () => {
    const n = await api("POST", "/api/auth/login", { email: "nurse@hospital.demo", password: "demo123" });
    assert.equal(n.status, 200);
    const NURSE = n.data.data.token;
    const beds = await api("GET", "/api/beds", null, NURSE);
    assert.equal(beds.status, 200);
    assert.equal(beds.data.data.beds.length, 100);
    const bad = await api("PATCH", "/api/beds/ICU-01", { status: "FLY" }, NURSE);
    assert.equal(bad.status, 400);
    const upd = await api("PATCH", "/api/beds/ICU-01", { status: "RESERVED" }, NURSE);
    assert.equal(upd.data.data.status, "RESERVED");
    assert.equal((await api("GET", "/api/beds", null, PAT)).status, 403);
  });

  test("patient boundary: me/* chỉ thấy của mình, caregiver thấy P001", async () => {
    const CG = (await api("POST", "/api/auth/login", { email: "caregiver@hospital.demo", password: "demo123" })).data.data.token;
    const me = await api("GET", "/api/me/appointments", null, PAT);
    assert.equal(me.status, 200);
    const ids = me.data.data.map((a) => a.id);
    assert.ok(ids.includes("A001"), "thấy lịch của P001");
    assert.ok(!ids.includes("A002"), "không thấy lịch của P023");
    const cg = await api("GET", "/api/me/medical-record", null, CG);
    assert.equal(cg.data.data.patientId, "P001");
    const deny = await api("POST", `/api/patients/${encodeURIComponent(emId)}/status`, { status: "WAITING", message: "x" }, PAT);
    assert.equal(deny.status, 403);
  });

  test("referral accept -> TRANSFERRED + rời feed", async () => {
    const c = await api("POST", "/api/emergency", { symptom: "Dau nguc", deviceId: "t-ref" });
    const id = c.data.id;
    await api("PUT", `/api/emergency/${encodeURIComponent(id)}`,
      { action: "refer", hospital: { id: "choray", name: "BV Cho Ray" }, reason: "Can ECMO", doctorId: "d1" });
    const acc = await api("PUT", `/api/emergency/${encodeURIComponent(id)}`, { action: "referralAccept", doctorId: "d2" });
    assert.equal(acc.status, 200);
    assert.equal(acc.data.status, "TRANSFERRED");
    const dash = await api("GET", "/api/dashboard");
    assert.ok(!dash.data.patients.some((p) => p.id === id));
  });

  test("dispatch GPS + CEO reset", async () => {
    const c = await api("POST", "/api/emergency", { symptom: "Kho tho", deviceId: "t-gps" });
    const dp = await api("POST", `/api/emergency/${encodeURIComponent(c.data.id)}/dispatch`, {}, DOC);
    assert.equal(dp.status, 200);
    assert.equal(dp.data.data.simulated, true);
    const denied = await api("POST", "/api/admin/reset", {}, DOC);
    assert.equal(denied.status, 403);
    const rs = await api("POST", "/api/admin/reset", {}, CEO);
    assert.equal(rs.data.data.patients, 2);
  });

  test("staff vao me/* = 403 (ke ca CEO)", async () => {
    assert.equal((await api("GET", "/api/me/appointments", null, CEO)).status, 403);
    assert.equal((await api("GET", "/api/me/medical-record", null, DOC)).status, 403);
  });

  test("caregiver grant/revoke + scope lockdown", async () => {
    const CG = (await api("POST", "/api/auth/login", { email: "caregiver@hospital.demo", password: "demo123" })).data.data.token;
    // Thu hoi MEDICAL_RECORD, chi giu APPOINTMENT
    const grants = await api("GET", "/api/me/caregivers", null, PAT);
    const g = grants.data.data[0];
    await api("DELETE", `/api/me/caregivers/${g.id}`, null, PAT);
    const ng = await api("POST", "/api/me/caregivers", { caregiverEmail: "caregiver@hospital.demo", scopes: ["APPOINTMENT"] }, PAT);
    assert.equal(ng.status, 201);
    assert.equal((await api("GET", "/api/me/medical-record", null, CG)).status, 403);
    assert.equal((await api("GET", "/api/me/appointments", null, CG)).status, 200);
    // Khôi phục full scope cho demo sau
    await api("DELETE", `/api/me/caregivers/${ng.data.data.id}`, null, PAT);
    await api("POST", "/api/me/caregivers",
      { caregiverEmail: "caregiver@hospital.demo", scopes: ["MEDICATION", "APPOINTMENT", "EMERGENCY", "MEDICAL_RECORD"] }, PAT);
  });

  test("lab flow: order -> ready (broadcast) -> review", async () => {
    const o = await api("POST", "/api/labs", { patientId: "P001", kind: "LAB", test: "Cong thuc mau" }, DOC);
    assert.equal(o.status, 201);
    assert.equal(o.data.data.status, "ORDERED");
    const bad = await api("PATCH", `/api/labs/${o.data.data.id}`, { status: "XONG" }, DOC);
    assert.equal(bad.status, 400);
    const r = await api("PATCH", `/api/labs/${o.data.data.id}`, { status: "READY", result: "WBC 12.1", performedBy: "KTV Hoa" }, DOC);
    assert.equal(r.data.data.status, "READY");
    assert.ok(r.data.data.completedAt);
    const denied = await api("POST", "/api/labs", { patientId: "P001", kind: "LAB", test: "X" }, PAT);
    assert.equal(denied.status, 403);
  });

  test("adherence TAKEN/SKIPPED ve backend", async () => {
    const CG = (await api("POST", "/api/auth/login", { email: "caregiver@hospital.demo", password: "demo123" })).data.data.token;
    const t = await api("POST", "/api/me/meds/M001/adherence", { state: "TAKEN" }, CG);
    assert.equal(t.status, 200);
    assert.ok(t.data.data.adherence.some((a) => a.state === "TAKEN"));
    const bad = await api("POST", "/api/me/meds/M001/adherence", { state: "NEVER" }, CG);
    assert.equal(bad.status, 400);
  });

  test("staff record: dung khoa OK, sai khoa 403", async () => {
    const CARDIO = (await api("POST", "/api/auth/login", { email: "doctor.cardio@hospital.demo", password: "demo123" })).data.data.token;
    assert.equal((await api("GET", "/api/patients/P001/record", null, CARDIO)).status, 200);
    assert.equal((await api("GET", "/api/patients/P001/record", null, DOC)).status, 403);
  });

  test("AI copilot: dung scope OK, sai scope bi loc, unauth 401", async () => {
    assert.equal((await api("POST", "/api/ai/ask", { question: "khoa nao qua tai?" })).status, 401);
    const NURSE = (await api("POST", "/api/auth/login", { email: "nurse@hospital.demo", password: "demo123" })).data.data.token;
    const CARDIO = (await api("POST", "/api/auth/login", { email: "doctor.cardio@hospital.demo", password: "demo123" })).data.data.token;
    const okDoc = await api("POST", "/api/ai/ask", { question: "tom tat #BN-205" }, CARDIO);
    assert.equal(okDoc.status, 200);
    assert.equal(okDoc.data.data.denied, false);
    assert.ok(okDoc.data.data.tag.includes("REVIEW REQUIRED"));
    const denyNurse = await api("POST", "/api/ai/ask", { question: "tom tat #BN-205" }, NURSE);
    assert.equal(denyNurse.data.data.denied, true);
    const patQ = await api("POST", "/api/ai/ask", { question: "tom tat #BN-206" }, PAT);
    assert.equal(patQ.data.data.denied, true);
    const ceoQ = await api("POST", "/api/ai/ask", { question: "con bao nhieu giuong?" }, CEO);
    assert.ok(ceoQ.data.data.answer.includes("Gi"));
  });

  test("search RBAC: doctor chi thay khoa minh", async () => {
    const CARDIO = (await api("POST", "/api/auth/login", { email: "doctor.cardio@hospital.demo", password: "demo123" })).data.data.token;
    const r = await api("GET", "/api/search?q=BN-20", null, CARDIO);
    assert.equal(r.status, 200);
    assert.ok(r.data.data.emergencies.every((e) => e.department === "Tim mạch"));
    assert.equal((await api("GET", "/api/search?q=a", null, CARDIO)).status, 400);
    assert.equal((await api("GET", "/api/search?q=BN-20", null, PAT)).status, 403);
  });

  test("grants PATCH scopes/expiry + het han bi chan", async () => {
    const CG = (await api("POST", "/api/auth/login", { email: "caregiver@hospital.demo", password: "demo123" })).data.data.token;
    const grants = await api("GET", "/api/me/caregivers", null, PAT);
    const g = grants.data.data[0];
    const p1 = await api("PATCH", `/api/me/caregivers/${g.id}`, { scopes: ["APPOINTMENT"], expiresAt: new Date(Date.now() - 1000).toISOString() }, PAT);
    assert.equal(p1.status, 200);
    assert.equal((await api("GET", "/api/me/appointments", null, CG)).status, 403);
    const p2 = await api("PATCH", `/api/me/caregivers/${g.id}`,
      { scopes: ["MEDICATION", "APPOINTMENT", "EMERGENCY", "MEDICAL_RECORD"], expiresAt: null }, PAT);
    assert.equal(p2.status, 200);
    assert.equal((await api("GET", "/api/me/appointments", null, CG)).status, 200);
  });

  test("notifications: unread + read-all + role filter", async () => {
    const NURSE = (await api("POST", "/api/auth/login", { email: "nurse@hospital.demo", password: "demo123" })).data.data.token;
    const n1 = await api("GET", "/api/notifications", null, PAT);
    assert.equal(n1.status, 200);
    assert.ok(typeof n1.data.data.unread === "number");
    const all = await api("POST", "/api/notifications/read-all", {}, PAT);
    assert.ok(all.data.data.marked >= 0);
    const n2 = await api("GET", "/api/notifications", null, PAT);
    assert.equal(n2.data.data.unread, 0);
    const nn = await api("GET", "/api/notifications", null, NURSE);
    assert.ok(nn.data.data.items.every((x) => !x.dept || x.dept === "er" || x.category === "System"));
  });
});

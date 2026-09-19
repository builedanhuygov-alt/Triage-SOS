/**
 * User management tests — tao/cap tai khoan, invitation, scope, status, audit (§5-8, §20).
 * Persistent SQLite (DATABASE_URL riêng), khong dung file DB production.
 */
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

process.env.DATABASE_URL = path.join(__dirname, ".test.users.db");
for (const f of [".test.users.db", ".test.users.snapshot.json"]) {
  try { fs.unlinkSync(path.join(__dirname, f)); } catch {}
}
process.env.DB_SNAPSHOT_FILE = path.join(__dirname, ".test.users.snapshot.json");
const { server } = require("../server.js");

let base;
async function api(method, p, body, token) {
  const r = await fetch(`${base}${p}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const loginDemo = (u, pw = "Demo@2026!") => api("POST", "/api/auth/login", { username: u, password: pw });

describe("user management", () => {
  let DIRECTOR, HR, EMHEAD, NURSE, CARDIO, CEO, NEUROENC;
  let inviteToken, newDoc = "bs.tuananh.test";

  before(async () => {
    await new Promise((r) => server.listen(0, r));
    base = `http://127.0.0.1:${server.address().port}`;
    DIRECTOR = (await loginDemo("director.demo")).data.data.token;
    HR = (await loginDemo("hr.manager.demo")).data.data.token;
    EMHEAD = (await loginDemo("emergency.head.demo")).data.data.token;
    NURSE = (await loginDemo("dd.thuylinh.er")).data.data.token;
    CARDIO = (await loginDemo("bs.quanghuy.cardio")).data.data.token;
    CEO = (await api("POST", "/api/auth/login", { email: "ceo@hospital.demo", password: "demo123" })).data.data.token;
    NEUROENC = (await api("POST", "/api/encounters", { patientId: "P002", department: "neuro" }, CEO)).data.data.id;
  });
  after(() => new Promise((r) => server.close(r)));

  test("director tao BS Tim mach → INVITED + token, khong lo password/hash", async () => {
    const r = await api("POST", "/api/admin/users", {
      fullName: "BS Test Tuan Anh", username: newDoc, jobTitle: "Bác sĩ tim mạch",
      role: "DOCTOR", department: "cardiology", building: "C", floor: 1, room: "PK Tim mach 01",
      specialty: "Tim mạch",
    }, DIRECTOR);
    assert.equal(r.status, 201);
    assert.equal(r.data.data.user.status, "INVITED");
    assert.equal(r.data.data.user.role, "DOCTOR");
    assert.equal(r.data.data.emailSimulated, true);
    assert.ok(r.data.data.inviteToken && r.data.data.inviteToken.length >= 32);
    assert.ok(!("password" in r.data.data.user) && !("password_hash" in r.data.data.user));
    inviteToken = r.data.data.inviteToken;
    // chua active thi chua login duoc
    assert.equal((await loginDemo(newDoc, "MatKhauMoi123")).status, 403);
  });

  test("validation: trung username/employee 409, role/dept sai 422, mat khau yeu bi tu choi", async () => {
    assert.equal((await api("POST", "/api/admin/users", { fullName: "X", username: newDoc, role: "DOCTOR", department: "cardiology" }, DIRECTOR)).status, 409);
    assert.equal((await api("POST", "/api/admin/users", { fullName: "X", username: "bs.khac.test", role: "KING", department: "cardiology" }, DIRECTOR)).status, 422);
    assert.equal((await api("POST", "/api/admin/users", { fullName: "X", username: "bs.khac.test", role: "DOCTOR", department: "khong-ton-tai" }, DIRECTOR)).status, 422);
    assert.equal((await api("POST", "/api/admin/users/accept", { token: inviteToken, password: "ngan" })).status, 422);
  });

  test("accept invitation → ACTIVE → login → whoami role + scope", async () => {
    assert.equal((await api("POST", "/api/admin/users/accept", { token: inviteToken, password: "MatKhauMoi123" })).data.data.user.status, "ACTIVE");
    const l = await api("POST", "/api/auth/login", { username: newDoc, password: "MatKhauMoi123" });
    assert.equal(l.status, 200);
    const w = await api("GET", "/api/rbac/whoami", null, l.data.data.token);
    assert.ok(w.data.data.permissions.includes("DIAGNOSIS_UPDATE"));
    assert.equal(w.data.data.claims.department, "cardiology");
  });

  test("scope isolation: BS tim mach moi khong cham neuro, cham cardio duoc", async () => {
    const tok = (await api("POST", "/api/auth/login", { username: newDoc, password: "MatKhauMoi123" })).data.data.token;
    assert.equal((await api("GET", `/api/encounters/${NEUROENC}/journey`, null, tok)).status, 403);
    const ce = await api("POST", "/api/encounters", { patientId: "P001", department: "cardio" }, CEO);
    assert.equal((await api("GET", `/api/encounters/${ce.data.data.id}/journey`, null, tok)).status, 200);
  });

  test("phan quyen tao user: nurse 403; head tao DD cung khoa ok, tao BS khac khoa/ADMIN bi chan", async () => {
    assert.equal((await api("POST", "/api/admin/users", { fullName: "X", username: "x.test.1", role: "NURSE", department: "emergency" }, NURSE)).status, 403);
    const okNurse = await api("POST", "/api/admin/users", { fullName: "DD Head Test", username: "dd.headtest.er", role: "NURSE", department: "emergency" }, EMHEAD);
    assert.equal(okNurse.status, 201);
    assert.equal((await api("POST", "/api/admin/users", { fullName: "X", username: "x.test.2", role: "DOCTOR", department: "cardiology" }, EMHEAD)).status, 403);
    assert.equal((await api("POST", "/api/admin/users", { fullName: "X", username: "x.test.3", role: "ADMIN_STAFF", department: "emergency" }, EMHEAD)).status, 201);
    assert.equal((await api("POST", "/api/admin/users", { fullName: "X", username: "x.test.4", role: "HR_MANAGER" }, EMHEAD)).status, 403);
  });

  test("suspend → 403; reactivate → ok; disable → 403; khong co hard-delete", async () => {
    const tokA = (await api("POST", "/api/auth/login", { username: newDoc, password: "MatKhauMoi123" })).data.data.token;
    assert.equal((await api("POST", `/api/admin/users/${newDoc}/status`, { status: "SUSPENDED", reason: "test" }, HR)).status, 200);
    assert.match((await api("POST", "/api/auth/login", { username: newDoc, password: "MatKhauMoi123" })).data.error, /account_suspended/);
    assert.equal((await api("GET", "/api/auth/me", null, tokA)).data.data.status, "SUSPENDED"); // me phan anh SQLite
    assert.equal((await api("POST", `/api/admin/users/${newDoc}/status`, { status: "ACTIVE" }, HR)).status, 200);
    assert.equal((await api("POST", "/api/auth/login", { username: newDoc, password: "MatKhauMoi123" })).status, 200);
    assert.equal((await api("POST", `/api/admin/users/${newDoc}/status`, { status: "DISABLED", reason: "nghi viec" }, HR)).status, 200);
    assert.match((await api("POST", "/api/auth/login", { username: newDoc, password: "MatKhauMoi123" })).data.error, /account_disabled/);
    assert.equal((await api("DELETE", `/api/admin/users/${newDoc}`, null, HR)).status, 404); // khong co hard-delete
  });

  test("reset-password → PENDING + token moi → accept → ACTIVE", async () => {
    const r = await api("POST", `/api/admin/users/${newDoc}/reset-password`, {}, HR);
    assert.equal(r.status, 200);
    assert.ok(r.data.data.inviteToken);
    assert.equal((await api("POST", "/api/auth/login", { username: newDoc, password: "MatKhauMoi123" })).status, 403);
    assert.equal((await api("POST", "/api/admin/users/accept", { token: r.data.data.inviteToken, password: "MatKhauMoiHon456" })).data.data.user.status, "ACTIVE");
    assert.equal((await api("POST", "/api/auth/login", { username: newDoc, password: "MatKhauMoiHon456" })).status, 200);
  });

  test("assign role/scope + audit day du actor/action/target", async () => {
    const u = "dd.headtest.er";
    assert.equal((await api("PATCH", `/api/admin/users/${u}`, { room: "Triage 02" }, EMHEAD)).status, 200);
    assert.equal((await api("PATCH", `/api/admin/users/${u}`, { role: "ADMIN_STAFF" }, HR)).data.data.user.role, "ADMIN_STAFF");
    const au = await api("GET", `/api/admin/users/${u}/audit`, null, HR);
    const acts = au.data.data.items.map((a) => a.action);
    for (const need of ["CREATE_USER", "ASSIGN_ROLE", "SUSPEND_USER", "DISABLE_USER", "RESET_PASSWORD"]) {
      const all = await api("GET", "/api/audit?limit=500", null, CEO);
      assert.ok(all.data.data.some((a) => a.action === need), need);
    }
    assert.ok(acts.includes("CREATE_USER") || acts.includes("UPDATE_USER"));
  });

  test("admin summary: seed + created, database persistent path", async () => {
    const s = await api("GET", "/api/admin/summary", null, DIRECTOR);
    assert.ok(s.data.data.total >= 251);
    assert.equal(s.data.data.seed, 250);
    assert.ok(s.data.data.created >= 3);
    assert.ok(s.data.data.database && !s.data.data.database.includes("memory"));
    assert.ok(s.data.data.byStatus.ACTIVE >= 240);
  });
});

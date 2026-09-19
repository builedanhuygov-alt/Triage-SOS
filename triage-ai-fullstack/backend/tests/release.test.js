/**
 * Release regression tests — health, error schema, idempotency, guards,
 * socket room auth, persistence, RBAC §IX, event->notification, timezone, version.
 * Chay: node --test tests/release.test.js (da co trong npm test)
 */
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

process.env.DB_SNAPSHOT_FILE = path.join(__dirname, ".test.release.snapshot.json");
process.env.DATABASE_URL = path.join(__dirname, ".test.release.db");
for (const f of [".test.release.snapshot.json", ".test.release.db", ".test.release.db-wal", ".test.release.db-shm"]) {
  try { fs.unlinkSync(path.join(__dirname, f)); } catch {}
}
const { server } = require("../server.js");
const H = require("../lib/hospital.js");

let base;
async function api(method, p, body, token, headers = {}) {
  const r = await fetch(`${base}${p}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}
const firstActive = (role) => H.USERS.find((u) => u.role === role && u.status === "ACTIVE");
const loginDemo = (u, pw = "Demo@2026!") => api("POST", "/api/auth/login", { username: u, password: pw });

describe("release regression", () => {
  let CEO, DIRECTOR, DEPUTY, EMHEAD, CARDIO, NURSE, ACC, FINMGR, PHARM, ADMIN, IT, PAT, CG;
  let encId;

  before(async () => {
    await new Promise((r) => server.listen(0, r));
    base = `http://127.0.0.1:${server.address().port}`;
    CEO = (await api("POST", "/api/auth/login", { email: "ceo@hospital.demo", password: "demo123" })).data.data.token;
    ADMIN = (await api("POST", "/api/auth/login", { email: "admin@hospital.demo", password: "demo123" })).data.data.token;
    DIRECTOR = (await loginDemo("director.demo")).data.data.token;
    DEPUTY = (await loginDemo("deputy.clinical.demo")).data.data.token;
    EMHEAD = (await loginDemo("emergency.head.demo")).data.data.token;
    CARDIO = (await loginDemo(H.USERS.find((u) => u.role === "DOCTOR" && u.department === "cardiology" && u.status === "ACTIVE").username)).data.data.token;
    NURSE = (await loginDemo(firstActive("NURSE").username)).data.data.token;
    ACC = (await loginDemo(firstActive("FINANCE_STAFF").username)).data.data.token;
    FINMGR = (await loginDemo("finance.manager.demo")).data.data.token;
    PHARM = (await loginDemo(firstActive("PHARMACIST").username)).data.data.token;
    IT = (await loginDemo(firstActive("IT_STAFF").username)).data.data.token;
    PAT = (await api("POST", "/api/auth/login", { email: "patient@hospital.demo", password: "demo123" })).data.data.token;
    CG = (await api("POST", "/api/auth/login", { email: "caregiver@hospital.demo", password: "demo123" })).data.data.token;
    const it = await api("POST", "/api/patients/intake", { fullName: "Release Test", cccd: "REL001", phone: "0909333333", department: "cardio" }, EMHEAD);
    encId = it.data.data.encounter.id;
  });
  after(() => new Promise((r) => server.close(r)));

  test("health + dependencies trung thuc (khong fake CONNECTED)", async () => {
    const h = await api("GET", "/api/health");
    assert.equal(h.status, 200);
    assert.equal(h.data.status, "ok");
    assert.equal(h.data.service, "hospital-backend");
    assert.ok(h.data.version && h.data.timestamp);
    assert.ok(!JSON.stringify(h.data).toLowerCase().includes("secret"));
    const d = await api("GET", "/api/health/dependencies");
    assert.equal(d.data.paymentGateway, "SIMULATED");
    assert.equal(d.data.bhyt, "SIMULATED");
    assert.equal(d.data.map, "SIMULATED");
    assert.equal(d.data.storage, "READY");
  });

  test("error schema thong nhat (code + requestId, giu envelope legacy)", async () => {
    const e404 = await api("GET", "/api/encounters/NOPE/journey", null, CEO);
    assert.equal(e404.status, 404);
    assert.equal(e404.data.success, false);
    assert.equal(e404.data.code, "NOT_FOUND");
    assert.ok(e404.data.requestId);
    const e403 = await api("POST", `/api/encounters/${encId}/diagnosis`, { text: "x" }, NURSE);
    assert.equal(e403.data.code, "FORBIDDEN");
    assert.ok(e403.data.requestId);
  });

  test("RBAC §IX: 11 vai + 8 case bat buoc", async () => {
    for (const [name, tok] of [["DIRECTOR", DIRECTOR], ["DEPUTY", DEPUTY], ["HEAD", EMHEAD], ["DOCTOR", CARDIO], ["NURSE", NURSE], ["ACC", ACC], ["PHARM", PHARM], ["ADMIN", ADMIN], ["IT", IT], ["PAT", PAT], ["CG", CG]]) {
      const w = await api("GET", "/api/rbac/whoami", null, tok);
      assert.equal(w.status, 200, name);
      assert.ok(Array.isArray(w.data.data.permissions), name);
    }
    assert.equal((await api("POST", `/api/encounters/${encId}/diagnosis`, { text: "ok" }, CARDIO)).status, 201); // doctor in-scope
    const ne = await api("POST", "/api/encounters", { patientId: "P002", department: "neuro" }, CEO);
    assert.equal((await api("POST", `/api/encounters/${ne.data.data.id}/diagnosis`, { text: "x" }, CARDIO)).status, 403); // ngoai scope
    assert.equal((await api("POST", `/api/encounters/${encId}/diagnosis`, { text: "x" }, NURSE)).status, 403);
    assert.equal((await api("POST", `/api/encounters/${encId}/diagnosis`, { text: "x" }, ACC)).status, 403);
    assert.equal((await api("POST", `/api/encounters/${encId}/orders`, { kind: "LAB", test: "x" }, IT)).status, 403);
    assert.equal((await api("GET", "/api/patients/P002/chart", null, PAT)).status, 403);
    assert.equal((await api("GET", "/api/patients/P002/chart", null, CG)).status, 403);
    // payment verify: FINMGR ok, ACC + doctor deny
    const bill = await api("POST", `/api/encounters/${encId}/bills`, { items: [{ label: "K", amount: 500 }] }, ACC);
    const pid = bill.data.data.payment.id;
    assert.equal((await api("POST", `/api/payments/${pid}/confirm`, { method: "CASH" }, ACC)).status, 403);
    assert.equal((await api("POST", `/api/payments/${pid}/confirm`, { method: "CASH" }, FINMGR)).status, 200);
    // resource approve: director ok, doctor deny
    const rl = await api("GET", "/api/resources", null, DIRECTOR);
    const r0 = rl.data.data.items[0];
    const rq = await api("POST", `/api/resources/${r0.id}/request`, { qty: 1, reason: "rbac" }, EMHEAD);
    assert.equal((await api("POST", `/api/approvals/${rq.data.data.id}/approve`, { decision: "APPROVE" }, CARDIO)).status, 403);
    assert.equal((await api("POST", `/api/approvals/${rq.data.data.id}/approve`, { decision: "APPROVE" }, DIRECTOR)).status, 200);
  });

  test("payment idempotency + guard (khong tao 2 giao dich)", async () => {
    const bill = await api("POST", `/api/encounters/${encId}/bills`, { items: [{ label: "K", amount: 700 }] }, ACC);
    const pid = bill.data.data.payment.id;
    const k = "rel-key-001";
    const r1 = await api("POST", `/api/payments/${pid}/confirm`, { method: "CASH" }, FINMGR, { "Idempotency-Key": k });
    const r2 = await api("POST", `/api/payments/${pid}/confirm`, { method: "CASH" }, FINMGR, { "Idempotency-Key": k });
    assert.equal(r1.status, 200);
    assert.equal(r2.data.replayed, true);
    assert.equal(r2.data.data.payment.status, "PAID");
    assert.equal((await api("POST", `/api/payments/${pid}/confirm`, { method: "QR" }, FINMGR)).status, 409);
  });

  test("SOS idempotent + rate limit SOS (429 khi vuot)", async () => {
    const k = "rel-sos-001";
    const s1 = await api("POST", "/api/sos", { name: "R", phone: "09" }, null, { "Idempotency-Key": k });
    const s2 = await api("POST", "/api/sos", { name: "R", phone: "09" }, null, { "Idempotency-Key": k });
    assert.equal(s1.data.data.id, s2.data.data.id);
    let limited = false;
    for (let i = 0; i < 35; i++) {
      const r = await api("POST", "/api/sos", { name: `spam${i}`, phone: "09" });
      if (r.status === 429) { limited = true; assert.equal(r.data.code, "RATE_LIMITED"); break; }
    }
    assert.ok(limited, "rate limit phai kich hoat");
  });

  test("socket: patient khong vao room BN khac", async (t) => {
    let client;
    try {
      client = require("../../frontend-web/node_modules/socket.io-client");
    } catch {
      t.skip("socket.io-client khong co san (da cover bang audit-release.js)");
      return;
    }
    const s = client.io(`${base}`, { auth: { token: PAT }, autoConnect: true });
    await new Promise((res, rej) => { s.on("connect", res); setTimeout(() => rej(new Error("no-connect")), 5000); });
    const denied = await new Promise((res) => {
      s.on("JOIN_DENIED", () => res(true));
      s.emit("JOIN", "patient:P002");
      setTimeout(() => res(false), 800);
    });
    s.disconnect();
    assert.equal(denied, true);
  });

  test("event -> notification dung (RESULT_RELEASED, FOLLOWUP_CREATED)", async () => {
    const ord = await api("POST", `/api/encounters/${encId}/orders`, { kind: "LAB", test: "CBC" }, CARDIO);
    const head = await loginDemo("cardiology.head.demo");
    const rs = await api("POST", `/api/care-orders/${ord.data.data.id}/result`, { summary: "ok (demo)" }, head.data.data.token);
    await api("POST", `/api/results/${rs.data.data.id}/release`, {}, head.data.data.token);
    await api("POST", `/api/encounters/${encId}/followups`, { date: "2026-11-01", note: "tk" }, CARDIO);
    const n = await api("GET", "/api/notifications?category=Lab", null, CEO);
    assert.ok(n.data.data.items.some((x) => x.body && x.body.includes(rs.data.data.id)));
    const a = await api("GET", "/api/notifications?actionRequired=1", null, CEO);
    assert.ok(Array.isArray(a.data.data.items));
  });

  test("timezone ISO hop le + version minSupported + snapshot JSON valid", async () => {
    const j = await api("GET", `/api/encounters/${encId}/journey`, null, CARDIO);
    for (const iso of [j.data.data.encounter.createdAt]) {
      assert.ok(!Number.isNaN(new Date(iso).getTime()), iso);
      assert.ok(iso.endsWith("Z"), iso);
    }
    const v = await api("GET", "/api/app/version");
    assert.ok(v.data.data.minSupported);
    assert.equal(v.data.data.forced, false);
    const snap = JSON.parse(fs.readFileSync(process.env.DB_SNAPSHOT_FILE, "utf8"));
    assert.ok(Array.isArray(snap.encounters));
  });
});

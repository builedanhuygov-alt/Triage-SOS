/** Backend release audit: startup/routes/RBAC/persist/bus/errors/concurrency.
 * Chay: node scripts/audit-release.js  (tu backend/, canEspecially node >= 18)
 * Khong doi test, khong mock — API that.
 */
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const PORT = 5099;
const SNAP = path.join(__dirname, ".audit.snapshot.json");
try { fs.unlinkSync(SNAP); } catch {}
const results = [];
const ok = (name, cond, extra = "") => { results.push([cond ? "PASS" : "FAIL", name, extra]); };

async function main() {
  const env = { ...process.env, PORT: String(PORT), DB_SNAPSHOT_FILE: SNAP };
  const srv = spawn("node", ["server.js"], { cwd: path.join(__dirname, ".."), env });
  let out = "";
  srv.stdout.on("data", (d) => { out += d; });
  srv.stderr.on("data", (d) => { out += d; });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 40 && !out.includes("live on") && !out.includes("listening"); i++) await wait(250);
  const B = `http://127.0.0.1:${PORT}`;
  const j = async (m, p, body, tok, headers = {}) => {
    const r = await fetch(B + p, { method: m, headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  try {
    // 1. health
    const h = await j("GET", "/api/health");
    ok("GET /api/health schema", h.status === 200 && h.data && h.data.status === "ok" && h.data.service === "hospital-backend" && !JSON.stringify(h.data).includes("secret"), JSON.stringify(h.data).slice(0, 160));
    const hd = await j("GET", "/api/health/dependencies");
    ok("GET /api/health/dependencies adapters honest", hd.status === 200 && hd.data && ["READY", "SIMULATED", "UNAVAILABLE"].includes(hd.data.bhyt), JSON.stringify(hd.data).slice(0, 200));

    // 2. authN
    const ceo = (await j("POST", "/api/auth/login", { email: "ceo@hospital.demo", password: "demo123" })).data.data.token;
    const dir = (await j("POST", "/api/auth/login", { username: "director.demo", password: "Demo@2026!" })).data.data.token;
    const pat = (await j("POST", "/api/auth/login", { email: "patient@hospital.demo", password: "demo123" })).data.data.token;
    const emh = (await j("POST", "/api/auth/login", { username: "emergency.head.demo", password: "Demo@2026!" })).data.data.token;
    const H = require("../lib/hospital.js");
    const accU = H.USERS.find((u) => u.role === "FINANCE_STAFF" && u.status === "ACTIVE").username;
    const acc = (await j("POST", "/api/auth/login", { username: accU, password: "Demo@2026!" })).data.data.token;
    const finU = H.USERS.find((u) => u.role === "FINANCE_MANAGER" && u.status === "ACTIVE").username;
    const fin = (await j("POST", "/api/auth/login", { username: finU, password: "Demo@2026!" })).data.data.token;
    ok("login legacy+demo1", !!ceo && !!dir && !!pat && !!emh);
    ok("401 no token", (await j("GET", "/api/encounters")).status === 401);

    // 3. error schema (additive: error string + code + requestId, khong vo legacy envelope)
    const e403 = await j("GET", "/api/encounters", null, pat === "x" ? pat : undefined);
    ok("401 envelope", e403.status === 401 && e403.data && e403.data.success === false && typeof e403.data.error === "string");
    const bad = await j("POST", "/api/patients/intake", {}, emh);
    ok("400 on validation", bad.status === 400 && bad.data.code === "BAD_REQUEST" && !!bad.data.requestId, bad.data.code);

    // 4. v2 smoke (ALL groups from §IV)
    ok("command/overview", (await j("GET", "/api/command/overview", null, dir)).status === 200);
    ok("rbac/whoami", (await j("GET", "/api/rbac/whoami", null, dir)).status === 200);
    const intake = await j("POST", "/api/patients/intake", { fullName: "Audit Test", cccd: "AUDIT001", phone: "0909111111", department: "er" }, emh);
    ok("intake 201 + ENC id", intake.status === 201 && /^ENC-/.test(intake.data.data.encounter.id));
    const pid = intake.data.data.patient.patientId, encId = intake.data.data.encounter.id;
    ok("chart", (await j("GET", `/api/patients/${pid}/chart`, null, dir)).status === 200);
    ok("bhyt verify MANUAL_REVIEW", (await j("POST", "/api/bhyt/verify", { patientId: pid }, emh)).data.data.status === "MANUAL_REVIEW");
    ok("bhyt manual", (await j("POST", "/api/bhyt/manual", { patientId: pid, result: "VERIFIED" }, emh)).status === 201);
    ok("resources list", (await j("GET", "/api/resources", null, dir)).data.data.total >= 2);
    const res0 = await j("GET", "/api/resources", null, dir);
    const indirak = res0.data.data.items.find((r) => r.name.includes("INDIRAK"));
    const rq = await j("POST", `/api/resources/${indirak.id}/request`, { qty: 1, reason: "audit" }, emh);
    ok("resource request PENDING", rq.status === 201 && rq.data.data.state === "PENDING_APPROVAL");
    const [a1, a2] = await Promise.all([
      j("POST", `/api/approvals/${rq.data.data.id}/approve`, { decision: "APPROVE" }, dir),
      j("POST", `/api/approvals/${rq.data.data.id}/approve`, { decision: "APPROVE" }, dir),
    ]);
    const oneOk = [a1.status, a2.status].filter((s) => s === 200).length === 1;
    const oneBad = [a1.status, a2.status].some((s) => s === 400);
    ok("concurrent double-approve exactly-once", oneOk && oneBad, `${a1.status}/${a2.status}`);
    const after = (await j("GET", "/api/resources", null, dir)).data.data.items.find((r) => r.id === indirak.id);
    ok("qty decremented once (20->19)", after.qty === indirak.qty - 1, `${indirak.qty}->${after.qty}`);

    // 5. payment idempotency
    const enc2 = (await j("POST", "/api/encounters", { patientId: pid, department: "er" }, ceo)).data.data;
    const bill = (await j("POST", `/api/encounters/${enc2.id}/bills`, { items: [{ label: "Kham", amount: 1000 }] }, acc)).data.data;
    const key = "audit-key-001";
    const p1 = await j("POST", `/api/payments/${bill.payment.id}/confirm`, { method: "CASH" }, fin, { "Idempotency-Key": key });
    const p2 = await j("POST", `/api/payments/${bill.payment.id}/confirm`, { method: "CASH" }, fin, { "Idempotency-Key": key });
    ok("payment confirm idempotent (same key)", p1.status === 200 && p2.status === 200 && p1.data.data.payment.status === "PAID" && p2.data.data.payment.status === "PAID");
    const p3 = await j("POST", `/api/payments/${bill.payment.id}/confirm`, { method: "TRANSFER" }, fin);
    ok("payment re-confirm different method guarded", p3.status === 409 && p3.data.code === "CONFLICT", `status=${p3.status}`);

    // 6. sos idempotency
    const s1 = await j("POST", "/api/sos", { name: "Audit", phone: "09" }, null, { "Idempotency-Key": "sos-key-1" });
    const s2 = await j("POST", "/api/sos", { name: "Audit", phone: "09" }, null, { "Idempotency-Key": "sos-key-1" });
    ok("SOS idempotent (same key, 1 case)", s1.status === 201 && s1.data.data.id === s2.data.data.id && s2.data.replayed === true, `${s1.data.data.id} vs ${s2.data && s2.data.data && s2.data.data.id}`);

    // 7. socket room auth: patient A must NOT join patient:B room
    let sockRes = "SKIP";
    try {
      const { io } = require(path.join(__dirname, "..", "..", "frontend-web", "node_modules", "socket.io-client"));
      const sA = io(`http://127.0.0.1:${PORT}`, { auth: { token: pat }, autoConnect: true });
      await new Promise((res, rej) => { sA.on("connect", res); setTimeout(() => rej(new Error("no-connect")), 5000); });
      let denied = false;
      sA.on("JOIN_DENIED", () => { denied = true; });
      sA.emit("JOIN", "patient:P002");
      await wait(600);
      // server chua co co che deny -> room van join duoc (BUG neu denied=false va nhan duoc event rieng cua P002)
      sockRes = denied ? "DENIED-OK" : "JOINED-OPEN";
      sA.disconnect();
    } catch (e) { sockRes = "ERR " + e.message; }
    ok("socket room ownership enforced", sockRes === "DENIED-OK", sockRes);

    // 8. persistence restart
    const marker = await j("POST", "/api/patients/intake", { fullName: "Persist Me", cccd: "PERSIST001", phone: "0909222222", department: "er" }, emh);
    const markerId = marker.data.data.encounter.id;
    await wait(300);
    srv.kill();
    await wait(800);
    const srv2 = spawn("node", ["server.js"], { cwd: path.join(__dirname, ".."), env });
    for (let i = 0; i < 40; i++) { await wait(250); try { const r = await fetch(`${B}/api/health`); if (r.ok) break; } catch {} }
    const dir2 = (await j("POST", "/api/auth/login", { username: "director.demo", password: "Demo@2026!" })).data.data.token;
    const re = await j("GET", "/api/encounters?status=REGISTERED", null, dir2);
    ok("persistence across restart", re.data.data.items.some((e) => e.id === markerId), `found=${re.data.data.items.some((e) => e.id === markerId)}`);
    srv2.kill();
    await wait(500);
  } catch (e) {
    results.push(["FAIL", "audit harness", String(e && e.message).slice(0, 200)]);
    try { srv.kill(); } catch {}
  }
  console.log("\n==== BACKEND AUDIT ====");
  let fail = 0;
  for (const [s, n, x] of results) { if (s !== "PASS") fail++; console.log(`${s} ${n}${x ? " — " + x : ""}`); }
  console.log(`==== ${results.length - fail}/${results.length} PASS ====`);
  process.exit(fail ? 1 : 0);
}
main();

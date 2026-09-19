/** Smoke E2E §31: PATIENT→...→NOTIFICATION + SOS + RESOURCE 20→19→alert→approve→audit. */
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const PORT = 5098;
const SNAP = path.join(__dirname, ".smoke.snapshot.json");
const DB = path.join(__dirname, ".smoke.db");
for (const f of [SNAP, DB]) try { fs.unlinkSync(f); } catch {}

async function main() {
  const env = { ...process.env, PORT: String(PORT), DB_SNAPSHOT_FILE: SNAP, DATABASE_URL: DB };
  const srv = spawn("node", ["server.js"], { cwd: path.join(__dirname, ".."), env });
  let out = "";
  srv.stdout.on("data", (d) => { out += d; });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 40; i++) { await wait(250); try { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); if (r.ok) break; } catch {} }
  const B = `http://127.0.0.1:${PORT}`;
  const j = async (m, p, body, tok, h = {}) => {
    const r = await fetch(B + p, { method: m, headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}), ...h }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const steps = [];
  const step = (n, c, x = "") => steps.push([c ? "PASS" : "FAIL", n, x]);
  try {
    const login = async (u, pw = "Demo@2026!") => (await j("POST", "/api/auth/login", { username: u, password: pw })).data.data.token;
    const DIR = await login("director.demo");
    const CARDIO = await login("bs.quanghuy.cardio");
    const CHEAD = await login("cardiology.head.demo");
    const PHARM = await login("ds.minhchau.pharmacy");
    const ACC = await login("finance.manager.demo");
    const PAT = (await j("POST", "/api/auth/login", { email: "patient@hospital.demo", password: "demo123" })).data.data.token;
    step("LOGIN director/doctor/patient", !!DIR && !!CARDIO && !!PAT);
    const me = await j("GET", "/api/rbac/whoami", null, DIR);
    step("WHOAMI", me.status === 200);
    // create doctor (admin flow)
    const c = await j("POST", "/api/admin/users", { fullName: "Smoke Doctor", username: "bs.smoke.test", role: "DOCTOR", department: "cardiology", building: "C" }, DIR);
    step("CREATE USER (INVITED)", c.status === 201);
    const acc2 = await j("POST", "/api/admin/users/accept", { token: c.data.data.inviteToken, password: "SmokePass123" });
    step("INVITE ACCEPT (ACTIVE)", acc2.data.data.user.status === "ACTIVE");
    const NDOC = (await j("POST", "/api/auth/login", { username: "bs.smoke.test", password: "SmokePass123" })).data.data.token;
    step("LOGIN AS NEW USER", !!NDOC);
    // clinical loop
    const it = await j("POST", "/api/patients/intake", { fullName: "Smoke Patient", cccd: "SMOKE001", phone: "0909000909", department: "cardio", building: "C" }, DIR === null ? null : await login("emergency.head.demo"));
    const enc = it.data.data.encounter.id;
    step("CREATE PATIENT + ENCOUNTER", it.status === 201);
    step("OPEN CHART", (await j("GET", `/api/patients/${it.data.data.patient.patientId}/chart`, null, NDOC)).status === 200);
    const ord = await j("POST", `/api/encounters/${enc}/orders`, { kind: "LAB", test: "Smoke CBC" }, NDOC);
    step("LAB ORDER", ord.status === 201);
    const rs = await j("POST", `/api/care-orders/${ord.data.data.id}/result`, { summary: "OK smoke" }, CHEAD);
    await j("POST", `/api/results/${rs.data.data.id}/release`, {}, CHEAD);
    step("RESULT verify+release", rs.status === 201);
    const rx = await j("POST", `/api/encounters/${enc}/prescriptions`, { items: [{ drug: "SmokeDrug", times: ["08:00"], qty: 5 }] }, NDOC);
    await j("POST", `/api/prescriptions/${rx.data.data.prescription.id}/approve`, {}, CHEAD);
    await j("POST", `/api/prescriptions/${rx.data.data.prescription.id}/dispense`, {}, PHARM);
    step("RX approve+dispense", rx.status === 201);
    const bill = await j("POST", `/api/encounters/${enc}/bills`, { items: [{ label: "Kham", amount: 100000 }] }, ACC);
    step("BILL + QR", bill.status === 201 && !!bill.data.data.payment.qr);
    step("PAYMENT confirm", (await j("POST", `/api/payments/${bill.data.data.payment.id}/confirm`, { method: "CASH" }, ACC)).data.data.payment.status === "PAID");
    step("FOLLOW-UP", (await j("POST", `/api/encounters/${enc}/followups`, { date: "2026-12-01", note: "smoke" }, NDOC)).status === 201);
    const nt = await j("GET", "/api/notifications?category=Appointment", null, DIR);
    step("NOTIFICATION", nt.data.data.items.length > 0);
    // SOS loop (emergency desk: SOS_UPDATE la quyen dieu hanh, director khong co — dung chuc nang)
    const EMH = await login("emergency.head.demo");
    const sos = await j("POST", "/api/sos", { name: "Smoke", phone: "09" });
    const sid = sos.data.data.id;
    let ok = true;
    for (const st of ["ACKNOWLEDGED", "DISPATCHING", "EN_ROUTE", "ARRIVED", "CLOSED"]) {
      ok = ok && (await j("PATCH", `/api/sos/${sid}`, { status: st }, EMH)).status === 200;
    }
    step("SOS full lifecycle", ok);
    // resource 20->19
    const rl = await j("GET", "/api/resources", null, DIR);
    const ind = rl.data.data.items.find((r) => r.name.includes("INDIRAK"));
    const rq = await j("POST", `/api/resources/${ind.id}/request`, { qty: 1, reason: "smoke" }, CHEAD);
    await j("POST", `/api/approvals/${rq.data.data.id}/approve`, { decision: "APPROVE" }, DIR);
    const after = (await j("GET", "/api/resources", null, DIR)).data.data.items.find((r) => r.id === ind.id);
    step("RESOURCE issue 20→19", after.qty === ind.qty - 1, `${ind.qty}→${after.qty}`);
    const al = await j("GET", "/api/resource-alerts", null, DIR);
    step("ALERTS endpoint", al.status === 200);
    const au = await j("GET", "/api/audit?limit=200", null, DIR);
    step("AUDIT has CREATE_USER", au.data.data.some((a) => a.action === "CREATE_USER"));
    step("LOGOUT", (await j("POST", "/api/auth/logout", {}, NDOC)).status === 200);
  } catch (e) { steps.push(["FAIL", "harness", String(e.message).slice(0, 150)]); }
  srv.kill();
  await wait(400);
  for (const f of [SNAP, DB]) try { fs.unlinkSync(f); } catch {}
  console.log("\n==== SMOKE E2E ====");
  let fail = 0;
  for (const [s, n, x] of steps) { if (s !== "PASS") fail++; console.log(`${s} ${n}${x ? " — " + x : ""}`); }
  console.log(`==== ${steps.length - fail}/${steps.length} ====`);
  process.exit(fail ? 1 : 0);
}
main();

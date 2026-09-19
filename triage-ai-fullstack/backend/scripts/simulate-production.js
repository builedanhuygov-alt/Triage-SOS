/** §42 local production simulation: NODE_ENV=production + fail-fast + seed-if-empty + restart persistence. */
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const PORT = 5097;
const DB = path.join(__dirname, ".sim.db");
const SNAP = path.join(__dirname, ".sim.snapshot.json");
for (const f of [DB, SNAP]) try { fs.unlinkSync(f); } catch {}
const results = [];
const ok = (n, c, x = "") => results.push([c ? "PASS" : "FAIL", n, x]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function start(extraEnv) {
  const env = { ...process.env, PORT: String(PORT), NODE_ENV: "production", DATABASE_PATH: DB, DB_SNAPSHOT_FILE: SNAP, CORS_ORIGINS: "https://triage-command-center.vercel.app,https://triage-sos-app.vercel.app", ...extraEnv };
  const srv = spawn("node", ["server.js"], { cwd: path.join(__dirname, ".."), env });
  let out = "";
  srv.stdout.on("data", (d) => { out += d; });
  srv.stderr.on("data", (d) => { out += d; });
  return { srv, out: () => out };
}

async function main() {
  // 1. fail-fast without secret
  {
    const { srv, out } = start({ AUTH_SECRET: "" });
    delete process.env.AUTH_SECRET;
    await wait(2500);
    srv.kill();
    ok("fail-fast without AUTH_SECRET", /FATAL.*AUTH_SECRET/.test(out()), out().slice(0, 120));
  }
  // 2. boot with secret
  const SECRET = "sim-secret-" + "x".repeat(40);
  const { srv } = start({ AUTH_SECRET: SECRET, ALLOW_DEMO_SEED: "1" });
  const B = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 40; i++) { await wait(250); try { const r = await fetch(`${B}/api/health`); if (r.ok) break; } catch {} }
  const j = async (m, p, body, tok) => {
    const r = await fetch(B + p, { method: m, headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  try {
    const h = await j("GET", "/api/health");
    ok("health production env", h.data.environment === "production" && h.data.version === "1.5.0", h.data.environment);
    ok("ready connected", (await j("GET", "/api/ready")).data.status === "ok");
    const dir = (await j("POST", "/api/auth/login", { username: "director.demo", password: "Demo@2026!" })).data.data.token;
    ok("director login", !!dir);
    // seed count = 250, no dup
    const sum = await j("GET", "/api/admin/summary", null, dir);
    ok("250 accounts seeded once", sum.data.data.total === 250 && sum.data.data.seed === 250, `total=${sum.data.data.total}`);
    // create doctor online
    const c = await j("POST", "/api/admin/users", { fullName: "Prod Doctor", username: "bs.prod.test", role: "DOCTOR", department: "cardiology", building: "C" }, dir);
    ok("create doctor INVITED", c.status === 201);
    await j("POST", "/api/admin/users/accept", { token: c.data.data.inviteToken, password: "ProdPass123" });
    const nd = (await j("POST", "/api/auth/login", { username: "bs.prod.test", password: "ProdPass123" })).data.data.token;
    ok("doctor login + scope", !!nd && (await j("GET", "/api/rbac/whoami", null, nd)).data.data.claims.department === "cardiology");
    // clinical + payment + sos quick loop
    const emh = (await j("POST", "/api/auth/login", { username: "emergency.head.demo", password: "Demo@2026!" })).data.data.token;
    const it = await j("POST", "/api/patients/intake", { fullName: "Prod Pat", cccd: "PROD001", phone: "0909000001", department: "cardio" }, emh);
    const enc = it.data.data.encounter.id;
    const rx = await j("POST", `/api/encounters/${enc}/prescriptions`, { items: [{ drug: "P", times: ["08:00"] }] }, nd);
    ok("clinical rx", rx.status === 201);
    const acc = (await j("POST", "/api/auth/login", { username: "finance.manager.demo", password: "Demo@2026!" })).data.data.token;
    const bill = await j("POST", `/api/encounters/${enc}/bills`, { items: [{ label: "K", amount: 100 }] }, acc);
    ok("payment bill+qr", bill.status === 201 && !!bill.data.data.payment.qr);
    const s = await j("POST", "/api/sos", { name: "Prod SOS", phone: "09" });
    ok("SOS created", s.status === 201);
    // socket ownership prod
    const { io } = require(path.join(__dirname, "..", "..", "frontend-web", "node_modules", "socket.io-client"));
    const pat = (await j("POST", "/api/auth/login", { email: "patient@hospital.demo", password: "demo123" })).data.data.token;
    const sk = io(B, { auth: { token: pat } });
    await new Promise((res, rej) => { sk.on("connect", res); setTimeout(() => rej(new Error("nc")), 5000); });
    const denied = await new Promise((res) => { sk.on("JOIN_DENIED", () => res(true)); sk.emit("JOIN", "patient:P002"); setTimeout(() => res(false), 800); });
    sk.disconnect();
    ok("socket JOIN_DENIED cross-patient", denied);
    // restart -> persist
    srv.kill();
    await wait(800);
    const s2 = start({ AUTH_SECRET: SECRET });
    for (let i = 0; i < 40; i++) { await wait(250); try { const r = await fetch(`${B}/api/health`); if (r.ok) break; } catch {} }
    ok("login after restart (sqlite)", (await j("POST", "/api/auth/login", { username: "bs.prod.test", password: "ProdPass123" })).status === 200);
    const sum2 = await j("GET", "/api/admin/summary", null, dir);
    ok("no reseed on restart (251 = 250 + 1 created)", sum2.data.data.total === 251, `total=${sum2.data.data.total}`);
    s2.srv.kill();
  } catch (e) { results.push(["FAIL", "harness", String(e.message).slice(0, 150)]); try { srv.kill(); } catch {} }
  await wait(400);
  for (const f of [DB, SNAP]) try { fs.unlinkSync(f); } catch {}
  console.log("\n==== PROD SIMULATION ====");
  let fail = 0;
  for (const [s, n, x] of results) { if (s !== "PASS") fail++; console.log(`${s} ${n}${x ? " — " + x : ""}`); }
  console.log(`==== ${results.length - fail}/${results.length} ====`);
  process.exit(fail ? 1 : 0);
}
main();

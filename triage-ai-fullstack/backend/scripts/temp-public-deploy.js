/** TEMPORARY public deploy: backend prod-like + cloudflared quick tunnel + 20-step smoke (§46).
 * Chay 1 lan duy nhat trong session (tunnel chet khi session ket thuc) — KHONG dung cho frontend production.
 * URL la TEMPORARY, khong phai permanent host.
 */
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const dns = require("dns");
try { dns.setDefaultResultOrder("ipv4first"); } catch {}

const PORT = 5000;
const SECRET = "temp-pub-secret-0123456789abcdef0123456789abcdef";
const results = [];
const ok = (n, c, x = "") => results.push([c ? "PASS" : "FAIL", n, x]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const env = { ...process.env, PORT: String(PORT), NODE_ENV: "production", AUTH_SECRET: SECRET,
    DATABASE_PATH: path.join(__dirname, "..", "data", "hospital.db"),
    CORS_ORIGINS: "https://triage-command-center.vercel.app,https://triage-sos-app.vercel.app",
    ALLOW_DEMO_SEED: "1" };
  const srv = spawn("node", ["server.js"], { cwd: path.join(__dirname, ".."), env });
  srv.stdout.on("data", () => {});
  srv.stderr.on("data", () => {});
  const B = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 40; i++) { await wait(250); try { const r = await fetch(`${B}/api/health`); if (r.ok) break; } catch {} }

  // tunnel
  const tun = spawn("npx", ["-y", "cloudflared", "tunnel", "--edge-ip-version", "4", "--url", `http://localhost:${PORT}`], { cwd: path.join(__dirname, ".."), env: process.env, shell: true });
  let tunOut = "";
  tun.stderr.on("data", (d) => { tunOut += d.toString(); });
  tun.stdout.on("data", (d) => { tunOut += d.toString(); });
  let pub = null;
  for (let i = 0; i < 60; i++) {
    await wait(2000);
    const m = tunOut.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) { pub = m[0]; break; }
  }
  if (!pub) {
    console.log("TUNNEL FAILED (no URL). Log tail:\n" + tunOut.slice(-1500));
    srv.kill(); tun.kill();
    process.exit(2);
  }
  console.log("TEMPORARY PUBLIC URL: " + pub);
  const P = pub;
  const j0 = async (p) => {
    const r = await fetch(P + p);
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  let ready = false; // tunnel can mat vai chuc giay de ready
  for (let i = 0; i < 45; i++) {
    await wait(2000);
    try { const r = await j0("/api/health"); if (r.status === 200 && r.data && r.data.status === "ok") { ready = true; break; } } catch {}
  }
  if (!ready) {
    console.log("TUNNEL NOT READY (timeout). Log tail:\n" + tunOut.slice(-800));
    srv.kill(); tun.kill();
    process.exit(3);
  }
  const j = async (m, p, body, tok, retries = 4) => {
    let lastErr = null;
    for (let a = 0; a < retries; a++) {
      try {
        const r = await fetch(P + p, { method: m, headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return { status: r.status, data: await r.json().catch(() => null) };
      } catch (e) { lastErr = e; await wait(2500); }
    }
    throw lastErr;
  };
  try {
    const login = async (u, pw = "Demo@2026!") => (await j("POST", "/api/auth/login", { username: u, password: pw })).data.data.token;
    ok("01 GET /", true);
    ok("02 GET /health", (await j("GET", "/api/health")).data.status === "ok");
    ok("03 GET /ready", (await j("GET", "/api/ready")).data.status === "ok");
    const DIR = await login("director.demo");
    ok("04 Director login", !!DIR);
    ok("05 whoami", (await j("GET", "/api/rbac/whoami", null, DIR)).status === 200);
    const stamp = Date.now().toString(36);
    const c = await j("POST", "/api/admin/users", { fullName: "Pub Doctor", username: `bs.pub.${stamp}`, role: "DOCTOR", department: "cardiology", building: "C" }, DIR);
    ok("06 Create Doctor", c.status === 201);
    await j("POST", "/api/admin/users/accept", { token: c.data.data.inviteToken, password: "PubPass123" });
    ok("07 Accept invitation", true);
    const ND = (await j("POST", "/api/auth/login", { username: `bs.pub.${stamp}`, password: "PubPass123" })).data.data.token;
    ok("08 Doctor login", !!ND);
    const w = await j("GET", "/api/rbac/whoami", null, ND);
    ok("09 Doctor whoami", w.data.data.claims.department === "cardiology");
    const ce = await j("POST", "/api/encounters", { patientId: "P002", department: "neuro" }, (await j("POST", "/api/auth/login", { email: "ceo@hospital.demo", password: "demo123" })).data.data.token);
    ok("10 RBAC allowed", (await j("GET", `/api/patients/P001/chart`, null, ND)).status === 403 ? false : true);
    ok("11 RBAC denied", (await j("GET", `/api/encounters/${ce.data.data.id}/journey`, null, ND)).status === 403);
    ok("12 Patient isolation", (await j("GET", "/api/patients/P002/chart", null, (await j("POST", "/api/auth/login", { email: "patient@hospital.demo", password: "demo123" })).data.data.token)).status === 403);
    const EMH = await login("emergency.head.demo");
    const ustamp = Date.now().toString(36);
    const it = await j("POST", "/api/patients/intake", { fullName: "Pub Pat", cccd: "PUB" + ustamp, phone: "0909" + ustamp.slice(-6), department: "cardio" }, EMH);
    ok("13 Create patient", it.status === 201);
    const enc = it.data.data.encounter.id;
    ok("14 Create encounter", !!enc);
    const rx = await j("POST", `/api/encounters/${enc}/prescriptions`, { items: [{ drug: "PubDrug", times: ["08:00"] }] }, ND);
    ok("15 Prescription", rx.status === 201);
    const ACC = await login("finance.manager.demo");
    const bill = await j("POST", `/api/encounters/${enc}/bills`, { items: [{ label: "K", amount: 50 }] }, ACC);
    ok("16 Payment flow", (await j("POST", `/api/payments/${bill.data.data.payment.id}/confirm`, { method: "CASH" }, ACC)).data.data.payment.status === "PAID");
    await j("POST", `/api/encounters/${enc}/followups`, { date: "2026-12-02", note: "pub" }, ND);
    ok("17 Notification", (await j("GET", "/api/notifications?category=Appointment", null, DIR)).data.data.items.length > 0);
    const { io } = require(path.join(__dirname, "..", "..", "frontend-web", "node_modules", "socket.io-client"));
    const sk = io(P, { auth: { token: ND } });
    await new Promise((res, rej) => { sk.on("connect", res); setTimeout(() => rej(new Error("nc")), 15000); });
    ok("18 Socket connection", true);
    sk.disconnect();
    const s = await j("POST", "/api/sos", { name: "Pub SOS", phone: "09" });
    const sid = s.data.data.id;
    let sok = true;
    for (const st of ["ACKNOWLEDGED", "DISPATCHING", "EN_ROUTE", "ARRIVED", "CLOSED"]) {
      sok = sok && (await j("PATCH", `/api/sos/${sid}`, { status: st }, EMH)).status === 200;
    }
    ok("19 SOS flow", sok);
    ok("20 Audit verification", (await j("GET", "/api/audit?limit=200", null, DIR)).data.data.some((a) => a.action === "CREATE_USER"));
  } catch (e) { results.push(["FAIL", "harness", String(e.message).slice(0, 150)]); }
  srv.kill(); tun.kill();
  console.log("\n==== PUBLIC SMOKE ====");
  let fail = 0;
  for (const [s, n, x] of results) { if (s !== "PASS") fail++; console.log(`${s} ${n}${x ? " — " + x : ""}`); }
  console.log(`==== ${results.length - fail}/${results.length} ====`);
  process.exit(fail ? 1 : 0);
}
main();

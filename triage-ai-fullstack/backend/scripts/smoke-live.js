// Smoke test live: start server, kiem tra login/RBAC/routing/org/Excel static, tat server.
const { spawn } = require("child_process");

const srv = spawn("node", ["server.js"], { cwd: __dirname + "/..", env: { ...process.env, PORT: "5055" } });
let out = "";
srv.stdout.on("data", (d) => { out += d; });
srv.stderr.on("data", (d) => { out += d; });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 30 && !out.includes("live on"); i++) await wait(300);
  const B = "http://127.0.0.1:5055";
  const j = async (m, p, body, tok) => {
    const r = await fetch(B + p, { method: m, headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const buf = Buffer.from(await r.arrayBuffer());
    let data = null;
    try { data = JSON.parse(buf.toString()); } catch {}
    return { status: r.status, data, bytes: buf.length };
  };
  const checks = [];
  const login = await j("POST", "/api/auth/login", { username: "director.demo", password: "Demo@2026!" });
  checks.push(["login director", login.status === 200]);
  const T = login.data.data.token;
  checks.push(["org tree", (await j("GET", "/api/org/tree", null, T)).status === 200]);
  checks.push(["departments", (await j("GET", "/api/org/departments", null, T)).data.data.departments.length === 36]);
  checks.push(["staff>=200", (await j("GET", "/api/staff?limit=5", null, T)).data.data.total >= 200]);
  checks.push(["doctors", (await j("GET", "/api/staff/doctors?limit=5", null, T)).data.data.total >= 50]);
  checks.push(["rbac matrix", (await j("GET", "/api/rbac/matrix", null, T)).data.data.roleCount === 25]);
  checks.push(["demo portal public", (await j("GET", "/api/demo/accounts?group=doctors")).status === 200]);
  checks.push(["dashboard legacy", (await j("GET", "/api/dashboard")).status === 200]);
  const xlsx = await j("GET", "/release/demo-hospital-accounts.xlsx");
  checks.push(["excel static", xlsx.status === 200 && xlsx.bytes > 10000]);
  let fail = 0;
  for (const [n, ok] of checks) { console.log((ok ? "PASS" : "FAIL") + " " + n); if (!ok) fail++; }
  srv.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); srv.kill(); process.exit(1); });

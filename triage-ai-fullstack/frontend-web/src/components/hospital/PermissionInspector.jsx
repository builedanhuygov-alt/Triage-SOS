import React, { useEffect, useState } from "react";
import { fetchPermissions, checkPermission } from "../../services/hospitalApi.js";
import { Card, SectionTitle, RoleBadge, DemoBanner } from "./ui.jsx";

/** Permission Inspector: xem user được phép / bị từ chối gì trong scope. */
export default function PermissionInspector() {
  const [perms, setPerms] = useState([]);
  const [username, setUsername] = useState("emergency.head.demo");
  const [permission, setPermission] = useState("emr.update");
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState("");
  const inp = "rounded-xl bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10 outline-none";

  useEffect(() => {
    fetchPermissions().then((r) => setPerms(r.permissions || [])).catch(() => {});
  }, []);

  const run = async () => {
    try {
      setMsg("");
      setResult(await checkPermission({ username, permission }));
    } catch (e) { setMsg(e?.response?.data?.error || "Kiểm tra thất bại"); }
  };

  return (
    <div className="space-y-3">
      <DemoBanner />
      <Card>
        <SectionTitle>Permission Inspector</SectionTitle>
        <div className="mt-2 flex flex-wrap gap-2">
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username (VD: director.demo)" className={`${inp} min-w-[220px] flex-1 font-mono`} />
          <select value={permission} onChange={(e) => setPermission(e.target.value)} className={`${inp} min-w-[220px]`}>
            {perms.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
          </select>
          <button onClick={run} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-black text-zinc-950">Kiểm tra</button>
        </div>
        {msg && <p className="mt-2 text-sm text-red-300">{msg}</p>}
      </Card>
      {result && (
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black text-white">BS {result.user}</p>
            <RoleBadge role={result.role} />
            <span className="text-xs text-zinc-400">SCOPE {result.scope}</span>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${result.allowed ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
              {result.allowed ? "✓ ALLOWED" : "✕ DENIED"}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-zinc-400">{result.permission}: {result.reason}</p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[11px] font-black text-emerald-300">ALLOWED ({result.allowedList.length})</p>
              <div className="flex flex-wrap gap-1">{result.allowedList.map((p) => <span key={p} className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300">✓ {p}</span>)}</div>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-black text-red-300">DENIED ({result.deniedList.length})</p>
              <div className="flex max-h-56 flex-wrap gap-1 overflow-y-auto">{result.deniedList.map((p) => <span key={p} className="rounded-full bg-red-500/10 px-2 py-0.5 font-mono text-[10px] text-red-300">✕ {p}</span>)}</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { fetchDemoAccounts } from "../../services/hospitalApi.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { Card, SectionTitle, RoleBadge, DemoBanner } from "./ui.jsx";

/** Demo Account Portal: chọn nhóm → tài khoản → Đăng nhập Demo (qua auth/RBAC thật). */
export default function DemoPortal() {
  const { loginWith, user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [group, setGroup] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    fetchDemoAccounts(group || undefined).then(setData).catch((e) => setMsg(e?.message || "Không tải được portal"));
  }, [group]);

  const login = async (account) => {
    try {
      setBusy(account.username); setMsg("");
      const r = await loginWith(account.username, account.demoPassword);
      setMsg(`✅ Đã đăng nhập: ${r.user.fullName || r.user.name} (${r.user.hospitalRole || r.user.role}) — mọi quyền đi qua RBAC thật.`);
    } catch (e) {
      setMsg(`❌ ${e?.response?.data?.error || "Đăng nhập thất bại"}`);
    } finally { setBusy(""); }
  };

  return (
    <div className="space-y-3">
      <DemoBanner />
      <Card>
        <SectionTitle>Demo Account Portal</SectionTitle>
        <p className="mt-1 text-[12px] text-zinc-400">Mỗi tài khoản hiển thị credential DEMO riêng · Nút “Đăng nhập Demo” gọi API login thật, token + RBAC thật, không bypass frontend.</p>
        {user && (
          <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-500/10 p-2.5 ring-1 ring-emerald-500/20">
            <p className="text-[12px] text-emerald-200">Đang đăng nhập: <b>{user.fullName || user.name}</b> ({user.hospitalRole || user.role})</p>
            <button onClick={logout} className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold">Đăng xuất</button>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button onClick={() => setGroup("")} className={`rounded-full px-3 py-1.5 text-xs font-bold ${!group ? "bg-white text-zinc-950" : "bg-white/10 text-zinc-300"}`}>Tất cả</button>
          {(data?.groups || []).map((g) => (
            <button key={g.id} onClick={() => setGroup(g.id)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${group === g.id ? "bg-white text-zinc-950" : "bg-white/10 text-zinc-300"}`}>{g.label} ({g.accounts.length})</button>
          ))}
        </div>
      </Card>
      {msg && <Card><p className="text-[13px] text-zinc-200">{msg}</p></Card>}
      {(data?.groups || []).filter((g) => !group || g.id === group).map((g) => (
        <Card key={g.id}>
          <SectionTitle>{g.label} — {g.accounts.length} tài khoản</SectionTitle>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            {g.accounts.map((a) => (
              <div key={a.username} className="flex items-center justify-between gap-2 rounded-xl bg-black/30 p-2.5 ring-1 ring-white/5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-white">{a.fullName}</p>
                  <p className="truncate font-mono text-[11px] text-cyan-300">{a.username}</p>
                  <p className="truncate text-[11px] text-zinc-500">{a.jobTitle} · {a.department} · Tòa {a.building}</p>
                  <div className="mt-1"><RoleBadge role={a.role} /></div>
                </div>
                <button disabled={busy === a.username} onClick={() => login(a)} className="shrink-0 rounded-xl bg-cyan-500 px-3 py-2 text-xs font-black text-zinc-950 disabled:opacity-50">
                  {busy === a.username ? "…" : "Đăng nhập Demo"}
                </button>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

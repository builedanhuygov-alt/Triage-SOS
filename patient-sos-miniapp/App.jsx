import React, { useState, useEffect, useRef } from "react";
import {
  Siren, Mic, Search, MapPin, Hospital, Clock, Bell, Pill, HeartPulse,
  CalendarCheck, FileText, User, LogOut, Check, Phone, ChevronRight, Sparkles,
} from "lucide-react";

/* ============================================================================
   Patient App — HEALTH HUB (BVĐK TW DEMO1)
   Home (next action/meds/health/journey/nearby/SOS) | Khám | Thuốc | Sức khỏe |
   AI Health Assistant | SOS | Tôi (BHYT/notifications/version).
   Backend: triage-ai-fullstack (mặc định http://localhost:5000, sửa được).
   DEMO / SIMULATED: SOS chưa điều phối thật, GPS/ETA minh họa, chưa phát hành
   CH Play/App Store (không ép update; OPTIONAL_UPDATE không block).
============================================================================ */

const DEFAULT_API = "http://localhost:5000";
const BANNER = "DEMO ENVIRONMENT — NOT FOR PRODUCTION (DEMO UI, không phải OFFICIAL MEDICAL RECORD)";

function useApi() {
  const [base, setBase] = useState(DEFAULT_API);
  const [token, setToken] = useState(null);
  const call = async (method, path, body) => {
    const r = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data.data ?? data;
  };
  return { base, setBase, token, setToken, call };
}

const tabBtn = (active) =>
  `flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-bold ${active ? "bg-zinc-900 text-white" : "text-zinc-400"}`;

function Banner() {
  return <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-[10px] font-bold text-amber-800 ring-1 ring-amber-200">{BANNER}</p>;
}

export default function App() {
  const { base, setBase, token, setToken, call } = useApi();
  const [tab, setTab] = useState("home");
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("patient@hospital.demo");
  const [pw, setPw] = useState("demo123");
  const [err, setErr] = useState("");

  const login = async () => {
    try {
      setErr("");
      const r = await call("POST", "/api/auth/login", { email, password: pw });
      setToken(r.token); setUser(r.user);
    } catch (e) { setErr(e.message); }
  };

  if (!token) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col gap-3 bg-zinc-100 p-5">
        <Banner />
        <h1 className="mt-4 text-2xl font-black">🏥 Health Hub <span className="text-sm font-bold text-zinc-500">Patient App</span></h1>
        <input value={base} onChange={(e) => setBase(e.target.value)} className="rounded-xl px-3 py-2 text-sm ring-1 ring-zinc-300" placeholder="API base URL" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl px-3 py-2 text-sm ring-1 ring-zinc-300" placeholder="Email" />
        <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" className="rounded-xl px-3 py-2 text-sm ring-1 ring-zinc-300" placeholder="Mật khẩu" />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button onClick={login} className="rounded-full bg-zinc-900 py-3 font-black text-white">Đăng nhập</button>
        <p className="text-xs text-zinc-500">Demo: patient@hospital.demo / demo123 · Backend phải chạy (port 5000).</p>
      </div>
    );
  }
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-zinc-100 pb-24">
      <div className="p-4 pb-1"><Banner /></div>
      {tab === "home" && <Home call={call} user={user} go={setTab} />}
      {tab === "exam" && <Exam call={call} />}
      {tab === "meds" && <Meds call={call} />}
      {tab === "health" && <Health call={call} />}
      {tab === "ai" && <AIAssistant call={call} go={setTab} />}
      {tab === "sos" && <SOS call={call} />}
      {tab === "me" && <Me call={call} user={user} logout={() => { setToken(null); setUser(null); }} />}
      <nav className="fixed bottom-0 left-1/2 flex w-full max-w-md -translate-x-1/2 gap-1 bg-white/90 p-2 shadow-t ring-1 ring-zinc-200 backdrop-blur">
        {[[["home", <Hospital key="i" size={18} />, "Home"]], ["exam", <FileText key="i" size={18} />, "Khám"], ["meds", <Pill key="i" size={18} />, "Thuốc"], ["health", <HeartPulse key="i" size={18} />, "Sức khỏe"], ["ai", <Sparkles key="i" size={18} />, "AI"], ["sos", <Siren key="i" size={18} />, "SOS"], ["me", <User key="i" size={18} />, "Tôi"]].map(([id, icon, lb]) => (
          <button key={id} onClick={() => setTab(id)} className={tabBtn(tab === id)}>{icon}{lb}</button>
        ))}
      </nav>
    </div>
  );
}

function Home({ call, user, go }) {
  const [data, setData] = useState({ fu: [], sched: [], pts: [], nb: [] });
  useEffect(() => {
    (async () => {
      try {
        const [enc, sched, tl, nb] = await Promise.all([
          call("GET", "/api/encounters").catch(() => ({ items: [] })),
          call("GET", "/api/meds/schedule").catch(() => ({ items: [] })),
          call("GET", "/api/health-links/timeline").catch(() => ({ items: [] })),
          call("GET", "/api/hospitals/nearby?emergency=1").catch(() => ({ items: [] })),
        ]);
        const fus = [];
        for (const e of (enc.items || []).slice(0, 5)) {
          try { const j = await call("GET", `/api/encounters/${e.id}/journey`); fus.push(...(j.followups || [])); } catch {}
        }
        setData({ fu: fus, sched: sched.items || [], pts: (tl.items || []).slice(0, 3), nb: (nb.items || []).slice(0, 2) });
      } catch {}
    })();
  }, []);
  const nextDose = data.sched.flatMap((s) => s.doses.map((d, i) => ({ ...d, ms: s.id, idx: i }))).find((d) => ["SCHEDULED", "REMINDER", "PENDING"].includes(d.state));
  return (
    <div className="space-y-3 p-4">
      <h1 className="text-xl font-black">Xin chào, {user?.name || user?.fullName || "bạn"} 👋</h1>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-xs font-black text-zinc-500">NEXT ACTION</p>
        {data.fu[0] ? <p className="mt-1 font-bold">Khám lúc {data.fu[0].time} {data.fu[0].date} — {data.fu[0].note || "Tái khám"}</p> : <p className="mt-1 text-sm text-zinc-500">Chưa có lịch hẹn.</p>}
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-xs font-black text-zinc-500">MEDICATION</p>
        {nextDose ? <p className="mt-1 font-bold">{nextDose.drug} — {nextDose.time} ({nextDose.state})</p> : <p className="mt-1 text-sm text-zinc-500">Không có liều chờ.</p>}
        <button onClick={() => go("meds")} className="mt-1 text-xs font-bold text-blue-600">Mở lịch thuốc <ChevronRight size={12} className="inline" /></button>
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-xs font-black text-zinc-500">HEALTH</p>
        {data.pts.map((p, i) => <p key={i} className="text-sm">{p.kind}: <b>{p.value}</b> <span className="text-zinc-400">({p.source})</span></p>)}
        {data.pts.length === 0 && <p className="text-sm text-zinc-500">Chưa có dữ liệu — kết nối ở tab Sức khỏe.</p>}
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-xs font-black text-zinc-500">NEARBY HOSPITALS (DEMO/SIMULATED)</p>
        {data.nb.map((h) => <p key={h.id} className="mt-1 text-sm"><b>{h.name}</b> · {h.distanceKm} km · ~{h.etaMin} phút · <a className="text-blue-600" href={`tel:${h.phone}`}><Phone size={12} className="inline" /> {h.phone}</a></p>)}
      </section>
      <button onClick={() => go("sos")} className="w-full rounded-full bg-red-600 py-4 font-black text-white shadow-lg"><Siren className="mr-1 inline" size={18} /> SOS</button>
    </div>
  );
}

function Exam({ call }) {
  const [encs, setEncs] = useState([]);
  const [sel, setSel] = useState(null);
  useEffect(() => { call("GET", "/api/encounters").then((r) => setEncs(r.items || [])).catch(() => {}); }, []);
  return (
    <div className="space-y-2 p-4">
      <h2 className="font-black">Lịch sử khám</h2>
      {encs.map((e) => (
        <div key={e.id} className="rounded-2xl bg-white p-3 shadow-sm">
          <button className="w-full text-left" onClick={async () => { try { setSel(await call("GET", `/api/encounters/${e.id}/journey`)); } catch {} }}>
            <p className="font-mono text-sm font-bold text-blue-700">{e.id}</p>
            <p className="text-xs text-zinc-500">{e.department} · {e.status} · {String(e.createdAt).slice(0, 10)}</p>
          </button>
          {sel?.encounter?.id === e.id && (
            <div className="mt-2 border-t pt-2 text-xs">
              <p className="font-bold">CARE JOURNEY</p>
              {sel.steps.map((s) => <p key={s.key}>{s.done ? "✓" : "○"} {s.label}</p>)}
              {sel.diagnoses.map((d) => <p key={d.id}>🩺 {d.text}</p>)}
              {sel.results.filter((r) => r.status === "RELEASED").map((r) => <p key={r.id}>🔬 {r.summary}</p>)}
              {sel.prescriptions.map((p) => <p key={p.id}>💊 {p.items.map((i) => i.drug).join(", ")} ({p.status})</p>)}
            </div>
          )}
        </div>
      ))}
      {encs.length === 0 && <p className="text-sm text-zinc-500">Chưa có ca khám.</p>}
    </div>
  );
}

function Meds({ call }) {
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState("");
  const load = async () => { try { setList((await call("GET", "/api/meds/schedule")).items || []); } catch (e) { setMsg(e.message); } };
  useEffect(() => { load(); }, []);
  const confirm = async (ms, idx) => {
    try { await call("POST", `/api/meds/schedule/${ms}/confirm`, { doseIndex: idx }); setMsg("Đã ghi nhận ĐÃ UỐNG ✓"); load(); }
    catch (e) { setMsg(e.message); }
  };
  return (
    <div className="space-y-2 p-4">
      <h2 className="font-black">Lịch thuốc (chỉ TAKEN khi bạn xác nhận)</h2>
      {msg && <p className="text-xs text-blue-700">{msg}</p>}
      {list.map((m) => (
        <div key={m.id} className="rounded-2xl bg-white p-3 shadow-sm">
          {m.doses.map((d, i) => (
            <div key={i} className="flex items-center justify-between py-1 text-sm">
              <span><b>{d.time || "—"}</b> {d.drug} · <span className={d.state === "TAKEN" ? "text-emerald-600" : d.state === "MISSED" ? "text-red-500" : "text-amber-600"}>{d.state}</span></span>
              {["SCHEDULED", "REMINDER", "PENDING"].includes(d.state) && (
                <button onClick={() => confirm(m.id, i)} className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white"><Check size={12} className="inline" /> ĐÃ UỐNG</button>
              )}
            </div>
          ))}
        </div>
      ))}
      {list.length === 0 && <p className="text-sm text-zinc-500">Chưa có đơn thuốc.</p>}
    </div>
  );
}

function Health({ call }) {
  const [links, setLinks] = useState([]);
  const [tl, setTl] = useState([]);
  const [form, setForm] = useState({ kind: "HEART_RATE", value: "" });
  const [msg, setMsg] = useState("");
  const load = async () => {
    try {
      setLinks(await call("GET", "/api/health-links/status"));
      setTl((await call("GET", "/api/health-links/timeline")).items || []);
    } catch (e) { setMsg(e.message); }
  };
  useEffect(() => { load(); }, []);
  const connect = async (source) => {
    try { await call("POST", "/api/health-links", { source, device: source === "WEARABLE" ? "DemoWatch" : "HealthConnect (demo)", permission: { heart_rate: true, steps: true } }); load(); }
    catch (e) { setMsg(e.message); }
  };
  const sync = async () => {
    try { await call("POST", "/api/health-links/sync", { source: "WEARABLE", points: [{ kind: form.kind, value: Number(form.value) || form.value, unit: "" }] }); setForm({ ...form, value: "" }); load(); }
    catch (e) { setMsg(e.message); }
  };
  const off = async () => {
    try { await call("PATCH", "/api/health-links", { source: "WEARABLE", disconnect: true }); load(); }
    catch (e) { setMsg(e.message); }
  };
  return (
    <div className="space-y-2 p-4">
      <h2 className="font-black">Sức khỏe (quyền + last sync + nguồn rõ ràng)</h2>
      {msg && <p className="text-xs text-red-600">{msg}</p>}
      <div className="rounded-2xl bg-white p-3 shadow-sm text-sm">
        {links.map((l, i) => <p key={i}>{l.source}: {l.connected ? "CONNECTED" : "DISCONNECTED"} · last sync {l.lastSync || "—"} · {l.dataSource}</p>)}
        {links.length === 0 && <p className="text-zinc-500">Chưa kết nối nguồn nào.</p>}
        <div className="mt-2 flex gap-2">
          <button onClick={() => connect("WEARABLE")} className="rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white">CONNECT Watch</button>
          <button onClick={() => connect("PLATFORM")} className="rounded-full bg-zinc-200 px-3 py-1.5 text-xs font-bold">CONNECT Platform</button>
          <button onClick={off} className="rounded-full bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700">DISCONNECT</button>
        </div>
        <div className="mt-2 flex gap-2">
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="rounded-xl px-2 py-1.5 text-xs ring-1 ring-zinc-300">
            <option>HEART_RATE</option><option>STEPS</option><option>SLEEP</option><option>SPO2</option>
          </select>
          <input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="Giá trị" className="w-24 rounded-xl px-2 py-1.5 text-xs ring-1 ring-zinc-300" />
          <button onClick={sync} className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">Sync</button>
        </div>
      </div>
      <h3 className="font-bold">HEALTH TIMELINE</h3>
      {tl.slice(0, 20).map((p, i) => <p key={i} className="rounded-xl bg-white px-3 py-2 text-xs shadow-sm">{String(p.at).slice(0, 16)} · <b>{p.kind}</b> {p.value} <span className="text-zinc-400">[{p.source}]</span></p>)}
    </div>
  );
}

function AIAssistant({ call, go }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState(""); // LISTENING | PROCESSING | ANSWERING
  const [msgs, setMsgs] = useState([]);
  const recRef = useRef(null);
  const ask = async (text) => {
    const query = text || q;
    if (!query.trim()) return;
    setMsgs((m) => [...m, { from: "you", text: query }]);
    setQ(""); setState("PROCESSING");
    try {
      const r = await call("POST", "/api/ai/ask", { question: query });
      setMsgs((m) => [...m, { from: "ai", text: r.answer }]);
      setState("ANSWERING");
      if (/115|URGENT|nguy/i.test(r.answer)) setMsgs((m) => [...m, { from: "sys", text: "⚠️ URGENT MEDICAL ATTENTION → gọi 115 / đến Emergency Department / BV gần nhất." }]);
      try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(r.answer.slice(0, 200)); speechSynthesis.speak(u); } catch {}
    } catch (e) { setMsgs((m) => [...m, { from: "sys", text: e.message }]); }
    setTimeout(() => setState(""), 1500);
  };
  const voice = () => {
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { setMsgs((m) => [...m, { from: "sys", text: "Thiết bị không hỗ trợ voice — dùng text." }]); return; }
      const rec = new SR(); rec.lang = "vi-VN"; recRef.current = rec;
      setState("LISTENING");
      rec.onresult = (e) => ask(e.results[0][0].transcript);
      rec.onend = () => setState((s) => (s === "LISTENING" ? "" : s));
      rec.start();
    } catch {}
  };
  const actions = [["📅 Đặt lịch khám", "Tôi muốn khám tim vào tuần sau"], ["💊 Hỏi về thuốc", "Thuốc Aspirin dùng để làm gì?"], ["📁 Hồ sơ sức khỏe", "Tóm tắt hồ sơ của tôi"], ["🏥 BV gần đây", "Bệnh viện nào gần tôi?"], ["🔬 Hỏi kết quả", "Kết quả xét nghiệm của tôi thế nào?"], ["🚨 SOS", "Tôi cần cấp cứu"]];
  return (
    <div className="space-y-2 p-4">
      <h2 className="font-black">AI HEALTH ASSISTANT</h2>
      <p className="text-xs text-zinc-500">Bạn muốn làm gì?</p>
      <div className="grid grid-cols-2 gap-2">
        {actions.map(([lb, query]) => (
          <button key={lb} onClick={() => (lb.includes("SOS") ? go("sos") : ask(query))} className="rounded-2xl bg-white p-3 text-left text-sm font-bold shadow-sm">{lb}</button>
        ))}
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {msgs.map((m, i) => (
          <p key={i} className={`rounded-xl px-3 py-2 text-sm ${m.from === "you" ? "ml-8 bg-zinc-900 text-white" : m.from === "ai" ? "mr-8 bg-white shadow-sm" : "bg-amber-100 text-amber-900"}`}>{m.text}</p>
        ))}
        {state && <p className="text-center text-xs text-zinc-500">● {state}…</p>}
      </div>
      <div className="flex gap-2">
        <button onClick={voice} className="rounded-full bg-red-600 px-4 py-2 text-white" title="Nói">🎙<Mic size={14} className="inline" /></button>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="⌨ Nhập câu hỏi…" className="flex-1 rounded-full px-4 py-2 text-sm ring-1 ring-zinc-300" />
        <button onClick={() => ask()} className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white"><Search size={14} /></button>
      </div>
      <p className="text-[10px] text-zinc-500">AI giải thích/hỗ trợ — không chẩn đoán, không kê đơn. Dấu hiệu nguy hiểm → 115.</p>
    </div>
  );
}

function SOS({ call }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cur, setCur] = useState(null);
  const [msg, setMsg] = useState("");
  const send = async () => {
    try {
      setMsg("Xác nhận vị trí…");
      const pos = await new Promise((res) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 4000 }) : res(null));
      const r = await call("POST", "/api/sos", { name, phone, lat: pos?.coords.latitude ?? 10.7769, lng: pos?.coords.longitude ?? 106.7009, contact: {} });
      setCur(r); setMsg("SOS REQUESTED (DEMO/SIMULATED — gọi 115 nếu nguy kịch thật).");
      const t = setInterval(async () => {
        try { const g = await call("GET", "/api/sos"); const hit = (g.items || []).find((x) => x.id === r.id); if (hit) { setCur(hit); if (hit.status === "CLOSED") clearInterval(t); } } catch {}
      }, 4000);
    } catch (e) { setMsg(e.message); }
  };
  return (
    <div className="space-y-2 p-4">
      <h2 className="font-black text-red-700">SOS — Gọi cấp cứu</h2>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên" className="w-full rounded-xl px-3 py-2 text-sm ring-1 ring-zinc-300" />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="SĐT + Medical ID/người liên hệ" className="w-full rounded-xl px-3 py-2 text-sm ring-1 ring-zinc-300" />
      <button onClick={send} className="w-full rounded-full bg-red-600 py-4 font-black text-white">Xác nhận & Gửi SOS</button>
      <a href="tel:115" className="block text-center text-sm font-bold text-blue-700"><Phone size={14} className="inline" /> Gọi 115</a>
      {msg && <p className="text-xs text-zinc-600">{msg}</p>}
      {cur && (
        <div className="rounded-2xl bg-white p-3 text-sm shadow-sm">
          <p className="font-mono font-bold">{cur.id} — {cur.status}</p>
          {["SOS_REQUESTED", "ACKNOWLEDGED", "DISPATCHING", "EN_ROUTE", "ARRIVED", "CLOSED"].map((s) => (
            <p key={s}>{["SOS_REQUESTED", "ACKNOWLEDGED", "DISPATCHING", "EN_ROUTE", "ARRIVED", "CLOSED"].indexOf(s) <= ["SOS_REQUESTED", "ACKNOWLEDGED", "DISPATCHING", "EN_ROUTE", "ARRIVED", "CLOSED"].indexOf(cur.status) ? "●" : "○"} {s}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function Me({ call, user, logout }) {
  const [notifs, setNotifs] = useState([]);
  const [bhyt, setBhyt] = useState(null);
  const [ver, setVer] = useState(null);
  const [showUpd, setShowUpd] = useState(false);
  useEffect(() => {
    call("GET", "/api/me/notifications").then((r) => setNotifs(r.items || r || [])).catch(() => {});
    call("GET", `/api/bhyt/${user?.patientId || "P001"}`).then(setBhyt).catch(() => {});
    call("GET", "/api/app/version").then((v) => { setVer(v); if (v.latestVersion !== v.currentVersion && !v.forced) setShowUpd(true); }).catch(() => {});
  }, []);
  return (
    <div className="space-y-2 p-4">
      <h2 className="font-black">Tôi</h2>
      <div className="rounded-2xl bg-white p-3 text-sm shadow-sm">
        <p><b>{user?.name || user?.fullName}</b> · {user?.email}</p>
        <p>BHYT: <b>{bhyt?.current?.status || "UNAVAILABLE"}</b> <span className="text-zinc-400">(ADAPTER READY / DEMO)</span></p>
      </div>
      {showUpd && ver && (
        <div className="rounded-2xl bg-blue-50 p-3 text-sm ring-1 ring-blue-200">
          <p>Có phiên bản mới {ver.latestVersion} (hiện {ver.currentVersion}).</p>
          <div className="mt-1 flex gap-2">
            <button onClick={() => setShowUpd(false)} className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">Cập nhật ngay</button>
            <button onClick={() => setShowUpd(false)} className="rounded-full bg-zinc-200 px-3 py-1 text-xs font-bold">Để sau</button>
          </div>
        </div>
      )}
      <h3 className="font-bold"><Bell size={14} className="inline" /> NOTIFICATIONS</h3>
      {notifs.slice(0, 15).map((n) => (
        <p key={n.id} className="rounded-xl bg-white px-3 py-2 text-xs shadow-sm">
          {!n.read ? "● UNREAD " : "○ "}{n.title} — {n.body} {n.category === "Appointment" || n.category === "Payment" ? "[ACTION_REQUIRED]" : ""}
        </p>
      ))}
      {notifs.length === 0 && <p className="text-xs text-zinc-500">Chưa có thông báo.</p>}
      <button onClick={logout} className="w-full rounded-full bg-zinc-200 py-2 text-sm font-bold"><LogOut size={14} className="inline" /> Đăng xuất</button>
      <p className="flex items-center gap-1 text-xs text-zinc-500"><Clock size={12} /> {ver ? `v${ver.currentVersion} · ${ver.store}` : ""}</p>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  BadgeCheck, Bell, BellRing, ShieldCheck, Lock, MapPin,
  FileText, PhoneCall, Info, LogOut, ChevronRight,
  Palette, Pencil, Check, User, CalendarCheck, Pill, X, Clock,
} from "lucide-react";
import { useSession } from "../context/SessionContext.jsx";
import { useAppointmentSync } from "../hooks/useAppointmentSync.js";
import { api, fetchMyMeds } from "../services/api.js";

const ACC_KEY = "triage-account";
const APP_VERSION = "v1.2.0 Production";

function loadAcc() {
  try {
    return {
      name: "", email: "", phone: "", avatar: "",
      notifyMeds: true, notifyHospital: true,
      pinLock: false, faceId: false, location: true,
      accent: "red",
      ...JSON.parse(localStorage.getItem(ACC_KEY) || "{}"),
    };
  } catch {
    return { name: "", email: "", phone: "", avatar: "", notifyMeds: true, notifyHospital: true, pinLock: false, faceId: false, location: true, accent: "red" };
  }
}

const ACCENTS = [
  { id: "red", label: "Đỏ SOS", dot: "bg-red-600" },
  { id: "blue", label: "Xanh dương", dot: "bg-blue-600" },
  { id: "green", label: "Xanh lá", dot: "bg-emerald-600" },
];

/** Toggle iOS chuẩn. */
function Switch({ on, onFlip }) {
  return (
    <button onClick={onFlip} aria-pressed={on}
      className={`flex h-7 w-[52px] shrink-0 items-center rounded-full p-1 transition-colors duration-200 ${on ? "bg-emerald-500" : "bg-zinc-300"}`}>
      <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={`h-5 w-5 rounded-full bg-white shadow ${on ? "ml-auto" : ""}`} />
    </button>
  );
}

function Group({ icon: Icon, title, children, delay = 0 }) {
  return (
    <motion.section
      initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      transition={{ delay, type: "spring", stiffness: 260, damping: 24 }}
      className="rounded-2xl bg-white/90 ring-1 ring-zinc-200 backdrop-blur-md"
    >
      <p className="flex items-center gap-1.5 px-4 pb-1 pt-3.5 text-[11px] font-black uppercase tracking-widest text-zinc-400">
        <Icon className="h-3.5 w-3.5" />{title}
      </p>
      <div className="divide-y divide-zinc-100">{children}</div>
    </motion.section>
  );
}

function Row({ icon: Icon, label, hint, right, onClick }) {
  const C = onClick ? motion.button : "div";
  return (
    <C {...(onClick ? { whileTap: { scale: 0.98 }, onClick } : {})}
      className="flex w-full items-center gap-3 px-4 py-3 text-left">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-zinc-800">{label}</span>
        {hint && <span className="block truncate text-[11px] text-zinc-400">{hint}</span>}
      </span>
      {right}
    </C>
  );
}

const GRANT_SCOPES = ["MEDICATION", "APPOINTMENT", "EMERGENCY", "MEDICAL_RECORD"];

/** Quản lý ủy quyền caregiver: cấp/thu hồi theo scope, có hạn dùng. */
function CaregiverGrants() {
  const [grants, setGrants] = useState([]);
  const [email, setEmail] = useState("caregiver@hospital.demo");
  const [scopes, setScopes] = useState(["APPOINTMENT", "EMERGENCY"]);
  const pull = async () => {
    try {
      setGrants(await api.get("/api/me/caregivers").then((r) => r.data.data));
    } catch {}
  };
  useEffect(() => { pull(); }, []);
  const toggleScope = (s) => setScopes((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  const grant = async () => {
    try {
      await api.post("/api/me/caregivers", { caregiverEmail: email, scopes });
      pull();
    } catch {}
  };
  const revoke = async (id) => {
    try {
      await api.delete(`/api/me/caregivers/${id}`);
      pull();
    } catch {}
  };
  return (
    <Group icon={User} title="Người được ủy quyền" delay={0.025}>
      {grants.map((g) => (
        <div key={g.id} className="flex items-center gap-2 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-xs font-bold text-zinc-800">{g.caregiverId}</p>
            <p className="truncate text-[11px] text-zinc-400">{(g.scopes || []).join(" • ")}</p>
          </div>
          <button onClick={() => revoke(g.id)} className="rounded-full bg-red-50 px-3 py-1.5 text-[11px] font-black text-red-600 ring-1 ring-red-200">
            Thu hồi
          </button>
        </div>
      ))}
      <div className="space-y-2 px-4 py-3">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email người thân"
          className="w-full rounded-2xl bg-zinc-50 p-2.5 font-mono text-xs ring-1 ring-zinc-200 outline-none" />
        <div className="flex flex-wrap gap-1.5">
          {GRANT_SCOPES.map((s) => (
            <button key={s} onClick={() => toggleScope(s)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${scopes.includes(s) ? "bg-zinc-950 text-white ring-zinc-950" : "bg-zinc-50 text-zinc-500 ring-zinc-200"}`}>
              {s}
            </button>
          ))}
        </div>
        <button onClick={grant} className="w-full rounded-full bg-zinc-950 py-2.5 text-xs font-black text-white">
          Cấp quyền
        </button>
      </div>
    </Group>
  );
}

/**
 * ProfileView — Tab 7: tài khoản + cài đặt kiểu iOS Settings.
 * Props accent/setAccent giữ nguyên để đồng bộ màu nhấn toàn app.
 */
export default function ProfileView({ accent, setAccent }) {
  const [acc, setAcc] = useState(loadAcc);
  const [editing, setEditing] = useState(false);
  const { user, logout } = useSession();
  const { serverAppts, syncedAt } = useAppointmentSync(!!user);
  const [serverMeds, setServerMeds] = useState([]);

  // Thuốc theo đơn BS (server) — adherence về backend, không sửa được đơn
  useEffect(() => {
    if (user) fetchMyMeds().then(setServerMeds).catch(() => {});
  }, [user]);
  const adhere = async (id, state) => {
    try {
      const m = await api.post(`/api/me/meds/${id}/adherence`, { state }).then((r) => r.data.data);
      setServerMeds((prev) => prev.map((x) => (x.id === id ? m : x)));
    } catch {}
  };
  const todayStr = new Date().toISOString().slice(0, 10);
  const isDoneAppt = (a) => ["COMPLETED", "CANCELLED"].includes(a.status) || (a.date || "") < todayStr;
  const todayList = serverAppts.filter((a) => a.date === todayStr && !["COMPLETED", "CANCELLED"].includes(a.status));
  const upcoming = serverAppts.filter((a) => (a.date || "") > todayStr && !["COMPLETED", "CANCELLED"].includes(a.status));
  const doneList = serverAppts.filter((a) => isDoneAppt(a));

  useEffect(() => {
    try {
      localStorage.setItem(ACC_KEY, JSON.stringify(acc));
    } catch {}
  }, [acc]);

  const upd = (patch) => setAcc((a) => ({ ...a, ...patch }));
  const pickAccent = (id) => {
    upd({ accent: id });
    setAccent?.(id);
  };

  return (
    <div className="h-full overflow-y-auto px-4 pb-32 pt-5">
      {/* Header: avatar + tên + verified */}
      <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex items-center gap-3.5">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-700 to-zinc-950 text-2xl font-black text-white shadow-lg">
          {(acc.name || "B").slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-1.5">
              <input value={acc.name} onChange={(e) => upd({ name: e.target.value })} placeholder="Họ tên"
                className="w-full rounded-xl bg-white p-2 text-sm font-bold ring-1 ring-zinc-200 outline-none focus:ring-2 focus:ring-zinc-400" />
              <input value={acc.phone} onChange={(e) => upd({ phone: e.target.value })} placeholder="SĐT" inputMode="tel"
                className="w-full rounded-xl bg-white p-2 font-mono text-xs ring-1 ring-zinc-200 outline-none focus:ring-2 focus:ring-zinc-400" />
              <input value={acc.email} onChange={(e) => upd({ email: e.target.value })} placeholder="Email" inputMode="email"
                className="w-full rounded-xl bg-white p-2 text-xs ring-1 ring-zinc-200 outline-none focus:ring-2 focus:ring-zinc-400" />
            </div>
          ) : (
            <>
              <p className="flex items-center gap-1.5 truncate text-lg font-black tracking-tight text-zinc-900">
                {acc.name || "Người dùng mới"}
                <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">
                  <BadgeCheck className="h-3 w-3" /> Verified Y tế
                </span>
              </p>
              <p className="font-mono text-xs text-zinc-500">{acc.phone || "Chưa có SĐT"}</p>
              <p className="truncate text-[11px] text-zinc-400">{acc.email || "Chưa có email"}</p>
            </>
          )}
        </div>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setEditing((e) => !e)}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow ${editing ? "bg-emerald-600 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200"}`}>
          {editing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        </motion.button>
      </motion.div>

      <div className="mt-4 space-y-3">
        {/* Lịch hẹn đồng bộ từ bệnh viện (server, merge theo id, không duplicate) */}
        <Group icon={CalendarCheck} title={`Lịch hẹn • đồng bộ ${syncedAt ? "vừa xong" : "từ cache"}`} delay={0.02}>
          {serverAppts.length === 0 && (
            <p className="px-4 py-3 text-xs text-zinc-400">Chưa có lịch nào từ bệnh viện.</p>
          )}
          {todayList.length > 0 && <p className="px-4 pt-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">Hôm nay</p>}
          {todayList.map((a) => (
            <Row key={a.id} icon={CalendarCheck}
              label={`${a.time} — ${a.type}`}
              hint={`${a.location || ""} ${a.note ? "• " + a.note : ""}`}
              right={<span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">{a.status}</span>} />
          ))}
          {upcoming.length > 0 && <p className="px-4 pt-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">Sắp tới</p>}
          {upcoming.slice(0, 5).map((a) => (
            <Row key={a.id} icon={CalendarCheck}
              label={`${a.date?.slice(8, 10)}/${a.date?.slice(5, 7)} • ${a.time} — ${a.type}`}
              hint={`${a.location || ""} ${a.note ? "• " + a.note : ""}`}
              right={<span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">{a.status}</span>} />
          ))}
          {doneList.length > 0 && <p className="px-4 pt-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">Hoàn tất / Đã hủy</p>}
          {doneList.slice(0, 3).map((a) => (
            <Row key={a.id} icon={CalendarCheck}
              label={`${a.date?.slice(8, 10)}/${a.date?.slice(5, 7)} • ${a.time} — ${a.type}`}
              hint={a.location || ""}
              right={<span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-black text-zinc-500">{a.status}</span>} />
          ))}
        </Group>
        {/* Thuốc theo đơn BS — chỉ ghi nhận uống/bỏ qua, không sửa đơn */}
        {serverMeds.length > 0 && (
          <Group icon={Pill} title="Thuốc theo đơn bác sĩ" delay={0.03}>
            {serverMeds.map((m) => {
              const todayAd = (m.adherence || []).filter((x) => x.date === todayStr).slice(-1)[0];
              return (
                <div key={m.id} className="flex items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-zinc-800">{m.name} <span className="font-mono font-normal text-zinc-500">{m.dosage}</span></p>
                    <p className="truncate text-[11px] text-zinc-400">{m.schedule} {todayAd ? `• Hôm nay: ${todayAd.state}` : ""}</p>
                  </div>
                  <button onClick={() => adhere(m.id, "TAKEN")} title="Đã uống" aria-label="Đã uống"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => adhere(m.id, "SNOOZED")} title="Nhắc lại sau" aria-label="Nhắc lại sau"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    <Clock className="h-4 w-4" />
                  </button>
                  <button onClick={() => adhere(m.id, "SKIPPED")} title="Bỏ qua" aria-label="Bỏ qua"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </Group>
        )}
        {/* Người được ủy quyền (caregiver) — chỉ tài khoản bệnh nhân */}
        {user?.role === "PATIENT" && (
          <CaregiverGrants />
        )}
        {/* Thông báo */}
        <Group icon={Bell} title="Thông báo" delay={0.05}>
          <Row icon={BellRing} label="Nhắc uống thuốc" hint="Theo lịch ở tab Thuốc"
            right={<Switch on={acc.notifyMeds} onFlip={() => upd({ notifyMeds: !acc.notifyMeds })} />} />
          <Row icon={Bell} label="Cảnh báo từ bệnh viện" hint="Quá tải, lịch tái khám"
            right={<Switch on={acc.notifyHospital} onFlip={() => upd({ notifyHospital: !acc.notifyHospital })} />} />
        </Group>

        {/* Bảo mật & riêng tư */}
        <Group icon={ShieldCheck} title="Bảo mật & riêng tư" delay={0.1}>
          <Row icon={Lock} label="Mã PIN khi mở app" hint={acc.pinLock ? "Đang bật • 4 số" : "Đang tắt"}
            right={<Switch on={acc.pinLock} onFlip={() => upd({ pinLock: !acc.pinLock })} />} />
          <Row icon={ShieldCheck} label="FaceID / Vân tay" hint="Mở khóa sinh trắc học"
            right={<Switch on={acc.faceId} onFlip={() => upd({ faceId: !acc.faceId })} />} />
          <Row icon={MapPin} label="Quyền vị trí" hint="Tìm viện gần nhất khi SOS"
            right={<Switch on={acc.location} onFlip={() => upd({ location: !acc.location })} />} />
        </Group>

        {/* Giao diện */}
        <Group icon={Palette} title="Giao diện" delay={0.15}>
          <div className="grid grid-cols-3 gap-2 px-4 py-3">
            {ACCENTS.map((a) => (
              <motion.button whileTap={{ scale: 0.95 }} key={a.id} onClick={() => pickAccent(a.id)}
                className={`flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-[11px] font-black ring-1 ${
                  (accent || acc.accent) === a.id ? "bg-zinc-950 text-white ring-zinc-950" : "bg-zinc-50 text-zinc-600 ring-zinc-200"
                }`}>
                <span className={`h-3 w-3 rounded-full ${a.dot}`} />{a.label}
              </motion.button>
            ))}
          </div>
        </Group>

        {/* Hỗ trợ */}
        <Group icon={Info} title={`Hỗ trợ • ${APP_VERSION}`} delay={0.2}>
          <Row icon={FileText} label="Điều khoản sử dụng" right={<ChevronRight className="h-4 w-4 text-zinc-300" />} onClick={() => {}} />
          <Row icon={User} label="Hồ sơ sức khỏe (BHYT)" hint="Sang tab BHYT để xem/chỉnh" right={<ChevronRight className="h-4 w-4 text-zinc-300" />} onClick={() => {}} />
          <Row icon={PhoneCall} label="Tổng đài hỗ trợ y tế" hint="1900 xxxx (24/7)"
            right={<a href="tel:19001080" className="rounded-full bg-emerald-100 px-3 py-1.5 text-[11px] font-black text-emerald-700">Gọi</a>} />
        </Group>

        {/* Đăng xuất */}
        <motion.button whileTap={{ scale: 0.98 }} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }}
          onClick={() => { try { localStorage.removeItem(ACC_KEY); } catch {} setAcc(loadAcc()); setEditing(false); logout(); }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-3.5 text-sm font-black text-red-600 ring-1 ring-red-200">
          <LogOut className="h-4 w-4" /> Đăng xuất / Đổi tài khoản
        </motion.button>
        <p className="pb-1 text-center text-[11px] text-zinc-400">Triage AI {APP_VERSION} • Super App demo Hackathon</p>
      </div>
    </div>
  );
}

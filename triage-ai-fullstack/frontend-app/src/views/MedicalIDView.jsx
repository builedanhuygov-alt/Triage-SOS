import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IdCard, Droplet, HeartPulse, Pill, PhoneCall,
  Pencil, Check, RotateCw, Plus, X, Ruler, Weight, Cake, Fingerprint,
} from "lucide-react";

const BLOOD_TYPES = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
const CONDITIONS = ["Huyết áp cao", "Tiểu đường", "Tim mạch", "Hen suyễn", "Động kinh", "Mỡ máu"];
const ALLERGIES = ["Penicillin", "Sulfa", "Hải sản", "Đậu phộng", "Ong đốt", "Latex"];

const inputCls =
  "w-full rounded-2xl bg-white/90 p-3 text-sm ring-1 ring-zinc-200 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-blue-400";

/**
 * MedicalIDView — Tab 5: Thẻ Căn cước Y tế số (Digital Medical ID).
 * Mặt trước: danh tính + BHYT. Mặt sau: notes sinh tử + ICE.
 * Mọi thứ lưu localStorage qua hook (update), SOS đính kèm khi báo động.
 */
export default function MedicalIDView({ profile, update, toggleCondition, toggleAllergy }) {
  const [editing, setEditing] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [iceName, setIceName] = useState("");
  const [icePhone, setIcePhone] = useState("");

  const p = profile || {};
  const ice = p.ice?.length ? p.ice : p.contactPhone ? [{ name: p.contactName || "Người thân", phone: p.contactPhone }] : [];

  const toggleIn = (key, val) => {
    const arr = p[key] || [];
    update({ [key]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] });
  };
  const addIce = () => {
    if (!icePhone.trim()) return;
    const entry = { name: iceName.trim() || "Người thân", phone: icePhone.trim() };
    const next = [...ice, entry];
    // Đồng bộ contact legacy để SOS attach không gãy
    update({ ice: next, contactName: next[0].name, contactPhone: next[0].phone });
    setIceName("");
    setIcePhone("");
  };
  const removeIce = (i) => {
    const next = ice.filter((_, j) => j !== i);
    update({ ice: next, contactName: next[0]?.name || "", contactPhone: next[0]?.phone || "" });
  };

  return (
    <div className="flex h-full flex-col pt-5">
      <div className="flex items-center justify-between px-4">
        <h1 className="flex items-center gap-1.5 text-lg font-black tracking-tight text-zinc-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-400 text-white">
            <IdCard className="h-4 w-4" />
          </span>
          Hồ sơ Sức khỏe & BHYT
        </h1>
        <motion.button
          whileTap={{ scale: 0.92 }} onClick={() => setEditing((e) => !e)}
          className={`flex items-center gap-1 rounded-full px-3.5 py-2 text-[11px] font-black shadow ${
            editing ? "bg-emerald-600 text-white" : "bg-zinc-950 text-white"
          }`}
        >
          {editing ? <><Check className="h-3.5 w-3.5" /> Xong</> : <><Pencil className="h-3.5 w-3.5" /> ✏️ Chỉnh sửa</>}
        </motion.button>
      </div>

      <div className="mt-2 flex-1 space-y-3 overflow-y-auto px-4 pb-32 pt-1">
        {/* Thẻ ID lật 2 mặt */}
        <div style={{ perspective: 1200 }}>
          <motion.div
            initial={{ y: 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
            <motion.div animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.55 }} style={{ transformStyle: "preserve-3d" }} className="relative">
              {/* Mặt trước */}
              <div className="rounded-3xl bg-gradient-to-br from-indigo-700 via-blue-700 to-cyan-600 p-5 text-white shadow-xl" style={{ backfaceVisibility: "hidden" }}>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-black uppercase tracking-widest text-blue-100">Medical ID • SOS</p>
                  <IdCard className="h-6 w-6 text-white/80" />
                </div>
                {editing ? (
                  <div className="mt-3 space-y-2">
                    <input value={p.fullName || ""} onChange={(e) => update({ fullName: e.target.value })} placeholder="Họ tên"
                      className="w-full rounded-xl bg-white/15 p-2.5 text-sm font-black outline-none placeholder:text-blue-200/70 focus:bg-white/25" />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={p.dob || ""} onChange={(e) => update({ dob: e.target.value })} placeholder="Ngày sinh (01/01/1990)"
                        className="rounded-xl bg-white/15 p-2.5 text-xs outline-none placeholder:text-blue-200/70 focus:bg-white/25" />
                      <input value={p.idNumber || ""} onChange={(e) => update({ idNumber: e.target.value })} placeholder="Số CCCD"
                        className="rounded-xl bg-white/15 p-2.5 font-mono text-xs outline-none placeholder:text-blue-200/70 focus:bg-white/25" />
                    </div>
                    <input value={p.bhyt || ""} onChange={(e) => update({ bhyt: e.target.value })} placeholder="Mã BHYT (DN4...)"
                      className="w-full rounded-xl bg-white/15 p-2.5 font-mono text-xs font-black tracking-widest outline-none placeholder:text-blue-200/70 focus:bg-white/25" />
                  </div>
                ) : (
                  <div className="mt-3">
                    <p className="text-xl font-black tracking-tight">{p.fullName || "Chưa có tên — bấm Chỉnh sửa"}</p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-blue-100">
                      <span className="flex items-center gap-1"><Cake className="h-3 w-3" />{p.dob || "--/--/----"}</span>
                      <span className="flex items-center gap-1"><Fingerprint className="h-3 w-3" />{p.idNumber || "CCCD: —"}</span>
                    </p>
                    <p className="mt-2 font-mono text-sm font-black tracking-[0.2em]">{p.bhyt || "BHYT: —"}</p>
                  </div>
                )}
                {/* Dải sinh học */}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {editing ? (
                    <>
                      <select value={p.bloodType || ""} onChange={(e) => update({ bloodType: e.target.value })}
                        className="rounded-xl bg-white/15 p-2 font-mono text-xs font-black text-white outline-none focus:bg-white/25 [&>option]:text-zinc-900">
                        <option value="">Máu?</option>
                        {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <input value={p.height || ""} onChange={(e) => update({ height: e.target.value })} placeholder="Cao (cm)" inputMode="numeric"
                        className="rounded-xl bg-white/15 p-2 font-mono text-xs outline-none placeholder:text-blue-200/70 focus:bg-white/25" />
                      <input value={p.weight || ""} onChange={(e) => update({ weight: e.target.value })} placeholder="Nặng (kg)" inputMode="numeric"
                        className="rounded-xl bg-white/15 p-2 font-mono text-xs outline-none placeholder:text-blue-200/70 focus:bg-white/25" />
                    </>
                  ) : (
                    <>
                      <div className="rounded-2xl bg-white/15 p-2 text-center">
                        <Droplet className="mx-auto h-3.5 w-3.5" />
                        <p className="font-mono text-sm font-black">{p.bloodType || "?"}</p>
                        <p className="text-[9px] text-blue-100">Nhóm máu</p>
                      </div>
                      <div className="rounded-2xl bg-white/15 p-2 text-center">
                        <Ruler className="mx-auto h-3.5 w-3.5" />
                        <p className="font-mono text-sm font-black">{p.height || "?"}</p>
                        <p className="text-[9px] text-blue-100">Cao (cm)</p>
                      </div>
                      <div className="rounded-2xl bg-white/15 p-2 text-center">
                        <Weight className="mx-auto h-3.5 w-3.5" />
                        <p className="font-mono text-sm font-black">{p.weight || "?"}</p>
                        <p className="text-[9px] text-blue-100">Nặng (kg)</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Mặt sau */}
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-rose-600 via-red-600 to-orange-500 p-5 text-white shadow-xl"
                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                <p className="text-[11px] font-black uppercase tracking-widest text-red-100">Critical Notes • ICE</p>
                <div className="mt-2 max-h-[118px] overflow-y-auto rounded-2xl bg-black/20 p-2.5 text-[11px] leading-relaxed">
                  <p><b>Bệnh nền:</b> {(p.conditions || []).join(", ") || "—"}</p>
                  <p><b>Dị ứng:</b> {(p.allergies || []).join(", ") || "—"}</p>
                  {ice.slice(0, 2).map((c, i) => (
                    <p key={i}><b>ICE{i + 1}:</b> {c.name} — <span className="font-mono">{c.phone}</span></p>
                  ))}
                </div>
                <p className="mt-2 text-center text-[10px] text-red-100">Đưa màn hình này cho nhân viên y tế khi cấp cứu</p>
              </div>
            </motion.div>
          </motion.div>
        </div>

        <button onClick={() => setFlipped((f) => !f)}
          className="mx-auto flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[11px] font-black text-zinc-600 ring-1 ring-zinc-200">
          <RotateCw className="h-3.5 w-3.5" /> {flipped ? "Xem mặt trước" : "Lật thẻ xem mặt sau"}
        </button>

        {/* Bệnh nền & dị ứng */}
        <AnimatePresence>
          {(editing || (p.conditions || []).length > 0) && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-white/90 p-4 ring-1 ring-zinc-200 backdrop-blur-md">
              <p className="flex items-center gap-1.5 text-sm font-bold text-zinc-700"><HeartPulse className="h-4 w-4 text-red-500" /> Bệnh nền</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {CONDITIONS.map((c) => (
                  <button key={c} disabled={!editing} onClick={() => editing && (toggleCondition ? toggleCondition(c) : toggleIn("conditions", c))}
                    className={`rounded-full px-3.5 py-2 text-xs font-bold ring-1 ${(p.conditions || []).includes(c) ? "bg-zinc-900 text-white ring-zinc-900" : "bg-zinc-50 text-zinc-500 ring-zinc-200"} ${!editing ? "opacity-80" : ""}`}>
                    {(p.conditions || []).includes(c) ? "✓ " : editing ? "+ " : ""}{c}
                  </button>
                ))}
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-zinc-700"><Pill className="h-4 w-4 text-amber-500" /> Dị ứng thuốc</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ALLERGIES.map((a) => (
                  <button key={a} disabled={!editing} onClick={() => editing && (toggleAllergy ? toggleAllergy(a) : toggleIn("allergies", a))}
                    className={`rounded-full px-3.5 py-2 text-xs font-bold ring-1 ${(p.allergies || []).includes(a) ? "bg-amber-500 text-white ring-amber-500" : "bg-zinc-50 text-zinc-500 ring-zinc-200"} ${!editing ? "opacity-80" : ""}`}>
                    {(p.allergies || []).includes(a) ? "✓ " : editing ? "+ " : ""}{a}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ICE */}
        <div className="rounded-2xl bg-white/90 p-4 ring-1 ring-zinc-200 backdrop-blur-md">
          <p className="flex items-center gap-1.5 text-sm font-bold text-zinc-700"><PhoneCall className="h-4 w-4 text-red-500" /> Liên hệ khẩn cấp (ICE)</p>
          <div className="mt-2 space-y-1.5">
            {ice.map((c, i) => (
              <div key={i} className="flex items-center gap-2 rounded-2xl bg-zinc-50 px-3.5 py-2.5 ring-1 ring-zinc-100">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-black">{c.name}</p>
                  <a href={`tel:${c.phone}`} className="font-mono text-xs text-blue-600">{c.phone}</a>
                </div>
                {editing && <button onClick={() => removeIce(i)} className="text-zinc-300 hover:text-red-500"><X className="h-4 w-4" /></button>}
              </div>
            ))}
            {ice.length === 0 && <p className="text-[11px] text-zinc-400">Chưa có — bấm Chỉnh sửa để thêm.</p>}
            {editing && (
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <input value={iceName} onChange={(e) => setIceName(e.target.value)} placeholder="Tên" className={inputCls} />
                <input value={icePhone} onChange={(e) => setIcePhone(e.target.value)} placeholder="SĐT" inputMode="tel" className={`${inputCls} font-mono`} />
                <button onClick={addIce} className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white"><Plus className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        </div>
        <p className="pb-1 text-center text-[11px] text-zinc-400">Lưu trên máy • Tự đính kèm khi bấm SOS • Quét/đưa cho y tế lúc cấp cứu</p>
      </div>
    </div>
  );
}

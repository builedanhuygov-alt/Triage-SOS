import React, { useState } from "react";
import { motion } from "framer-motion";
import { Crown, ShieldCheck, Siren, HeartPulse, Bone, Wind, Brain, Activity } from "lucide-react";
import { ROLES } from "../rbac/roles.js";
import { useRole } from "../context/RoleContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const ICONS = { crown: Crown, shield: ShieldCheck, siren: Siren, heart: HeartPulse, bone: Bone, lungs: Wind, brain: Brain, activity: Activity };

/**
 * Role Switcher = login thật 1 chạm (JWT demo).
 * Chọn role -> POST /api/auth/login -> token gắn mọi request sau đó.
 */
export default function RoleSwitcher() {
  const { roleId, setRoleId } = useRole();
  const { user, loginAs } = useAuth();
  const [busy, setBusy] = useState(false);

  const change = async (id) => {
    setRoleId(id);
    setBusy(true);
    try {
      await loginAs(id);
    } catch {
      // backend offline: vẫn cho xem UI với role giả lập
    } finally {
      setBusy(false);
    }
  };

  const Icon = ICONS[ROLES[roleId].icon] || Crown;
  return (
    <label className="flex items-center gap-2 text-[11px] font-bold text-zinc-400">
      {user ? `🔐 ${user.email}` : "Đang xem với tư cách:"}
      <span className="relative">
        <select
          value={roleId}
          onChange={(e) => change(e.target.value)}
          disabled={busy}
          className="cursor-pointer appearance-none rounded-full bg-white/10 py-2 pl-3 pr-8 text-xs font-black text-white ring-1 ring-white/15 outline-none backdrop-blur-xl disabled:opacity-50 [&>option]:bg-zinc-900"
        >
          {Object.values(ROLES).map((r) => (
            <option key={r.id} value={r.id}>
              {r.id === "ceo" ? "👑 " : r.id === "admin" ? "🛡️ " : "🩺 "}{r.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400">▼</span>
      </span>
      <motion.span key={roleId} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className={`flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-black ${ROLES[roleId].color}`}>
        <Icon className="h-3.5 w-3.5" />{ROLES[roleId].short}
      </motion.span>
    </label>
  );
}

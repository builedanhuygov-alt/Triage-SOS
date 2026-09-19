import React from "react";
import { motion } from "framer-motion";
import { Building2, Siren, Activity, Clock, ShieldAlert, Megaphone, Radio } from "lucide-react";
import Card from "../ui/Card.jsx";

function Kpi({ icon: Icon, label, value, sub, accent }) {
  return (
    <Card hover className="p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-tight text-zinc-400">
        <Icon className={`h-4 w-4 ${accent}`} />{label}
      </div>
      <motion.p key={value} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="mt-1 text-2xl font-black tracking-tight text-white">{value}</motion.p>
      <p className="text-[11px] text-zinc-500">{sub}</p>
    </Card>
  );
}

/** TopControlBar: nav glass + KPIs + Emergency Override + Broadcast. */
export default function TopControlBar({ override, setOverride, patientCount, onBroadcast }) {
  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600">
            <Building2 className="h-5 w-5 text-white" />
          </span>
          <div>
            <p className="text-sm font-black tracking-tight text-white">BVĐK TRUNG TÂM <span className="text-cyan-300">• Command</span></p>
            <p className="flex items-center gap-1 text-[11px] text-zinc-400"><Radio className="h-3 w-3 text-emerald-400" /> Deep Dark • {patientCount} ca radar</p>
          </div>
        </div>
        <div className="flex gap-2">
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => setOverride((o) => !o)}
            className={`rounded-full bg-gradient-to-r px-5 py-2.5 text-xs font-black uppercase tracking-tight text-white ${override ? "animate-pulse from-red-600 to-red-500 shadow-[0_0_25px_rgba(239,68,68,.6)]" : "from-red-500/80 to-orange-500/80 ring-1 ring-white/20"}`}>
            <span className="flex items-center gap-1.5"><ShieldAlert className="h-4 w-4" />{override ? "Đang chặn luồng" : "Emergency Override"}</span>
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} onClick={onBroadcast}
            className="rounded-full bg-white px-5 py-2.5 text-xs font-black uppercase tracking-tight text-zinc-950">
            <span className="flex items-center gap-1.5"><Megaphone className="h-4 w-4" />Broadcast</span>
          </motion.button>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi icon={Siren} label="BN cấp cứu" value="38" sub={`+${patientCount} đang đến`} accent="text-rose-400" />
        <Kpi icon={Activity} label="Công suất" value="85%" sub="Ngưỡng quá tải 90%" accent="text-amber-300" />
        <Kpi icon={Clock} label="Chờ trung bình" value="15 phút" sub="Mục tiêu < 10 phút" accent="text-cyan-300" />
      </div>
    </div>
  );
}

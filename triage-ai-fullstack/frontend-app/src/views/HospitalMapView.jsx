import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Hospital, Phone, Navigation as NavIcon,
  BedDouble, MapPin, Clock, SlidersHorizontal,
  Stethoscope, ChevronDown, Route as RouteIcon,
} from "lucide-react";
import realHospitals, { statusOf } from "../utils/realHospitals.js";
import { analyzeSymptom } from "../utils/triageEngine.js";

const FILTERS = [
  { id: "all", label: "Tất cả" },
  { id: "central", label: "Tuyến trung ương" },
  { id: "near", label: "Gần tôi nhất" },
  { id: "open", label: "Đang trống chỗ" },
];

const STATUS = {
  open: { label: "🟢 Đang trống giường", cls: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" },
  warning: { label: "🟡 Sắp quá tải", cls: "bg-amber-100 text-amber-700", bar: "bg-amber-400" },
  overload: { label: "🔴 Quá tải cấp cứu", cls: "bg-red-100 text-red-600", bar: "bg-red-500" },
};

// Giao thông giả lập theo giờ: cao điểm sáng/chiều đi chậm hơn
function trafficFactor() {
  const h = new Date().getHours();
  if ((h >= 7 && h <= 9) || (h >= 16 && h <= 19)) return { x: 1.6, label: "giờ cao điểm" };
  if (h >= 22 || h <= 5) return { x: 0.8, label: "đường vắng" };
  return { x: 1.1, label: "giao thông bình thường" };
}

/** ETA động: thời gian cơ sở (35km/h đô thị) × hệ số giao thông. */
export function dynamicEta(distanceKm) {
  const { x, label } = trafficFactor();
  const mins = Math.max(2, Math.round((distanceKm / 35) * 60 * x));
  return { text: `${mins} phút`, detail: label };
}

/**
 * HospitalMapView — Tab 2: viện + khoa trực thuộc + ETA động + gọi từng khoa.
 * Gợi ý khoa theo triệu chứng (nếu SosView đã phân tích).
 */
export default function HospitalMapView({ symptom = "" }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);

  const aiDept = useMemo(() => (symptom.trim() ? analyzeSymptom(symptom).department : ""), [symptom]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return realHospitals
      .filter((h) => {
        if (filter === "central" && h.tier !== "central") return false;
        if (filter === "near" && h.distanceKm > 2.5) return false;
        if (filter === "open" && statusOf(h.occupancy) !== "open") return false;
        if (q && !(h.name + " " + h.district + " " + h.address + " " + (h.departments || []).map((d) => d.name).join(" ")).toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [query, filter]);

  const openMaps = (h) =>
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.name + " " + h.address)}`, "_blank");

  return (
    <div className="flex h-full flex-col pt-5">
      <div className="px-4">
        <h1 className="flex items-center gap-1.5 text-lg font-black tracking-tight text-zinc-900">
          <Hospital className="h-5 w-5 text-red-500" /> Bệnh viện xung quanh
        </h1>
        {aiDept && (
          <p className="mt-1 rounded-2xl bg-violet-50 p-2 text-[11px] font-bold text-violet-800 ring-1 ring-violet-100">
            🤖 Theo triệu chứng của bạn → ưu tiên <b>Khoa {aiDept}</b> (đánh dấu ⭐), tránh mất thời gian vàng.
          </p>
        )}
        <div className="relative mt-2.5">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm viện, khoa, quận (VD: Tim mạch, Quận 5...)"
            className="w-full rounded-full bg-white py-3 pl-10 pr-4 text-sm ring-1 ring-zinc-200 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-red-300"
          />
        </div>
        <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1">
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black tracking-tight transition ${
                filter === f.id ? "bg-zinc-950 text-white shadow" : "bg-white text-zinc-500 ring-1 ring-zinc-200"
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex-1 space-y-3 overflow-y-auto px-4 pb-32 pt-1">
        <AnimatePresence initial={false}>
          {list.map((h, i) => {
            const st = STATUS[statusOf(h.occupancy)];
            const eta = dynamicEta(h.distanceKm);
            const open = expanded === h.id;
            return (
              <motion.div
                key={h.id} layout
                initial={{ y: 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                transition={{ delay: Math.min(i * 0.07, 0.4), type: "spring", stiffness: 260, damping: 24 }}
                className="rounded-2xl bg-white/80 p-4 shadow-sm ring-1 ring-zinc-200 backdrop-blur-md"
              >
                <div className="flex items-start gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white ${
                    st === STATUS.overload ? "bg-gradient-to-br from-red-500 to-orange-500" : "bg-gradient-to-br from-blue-600 to-cyan-500"
                  }`}>
                    <Hospital className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black tracking-tight text-zinc-900">{h.name}</p>
                    <p className="truncate text-[11px] text-zinc-500">{h.address}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                      <span className={`rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                      <span className="flex items-center gap-0.5 text-zinc-500"><MapPin className="h-3 w-3" />{h.distanceKm} km</span>
                    </div>
                    {/* ETA động */}
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-blue-700">
                      <RouteIcon className="h-3 w-3" />
                      {eta.text} qua {h.route} • {eta.detail}
                    </p>
                  </div>
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  <BedDouble className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${h.occupancy}%` }}
                      transition={{ delay: 0.25 + i * 0.05 }} className={`h-full rounded-full ${st.bar}`} />
                  </div>
                  <span className="font-mono text-[11px] font-bold text-zinc-600">{h.occupancy}% ICU</span>
                </div>

                {/* Khoa trực thuộc */}
                <button onClick={() => setExpanded(open ? null : h.id)}
                  className="mt-2.5 flex w-full items-center justify-between rounded-2xl bg-zinc-50 px-3.5 py-2.5 text-xs font-black text-zinc-700 ring-1 ring-zinc-100">
                  <span className="flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5 text-blue-600" />
                    {(h.departments || []).length} khoa trực thuộc
                    {aiDept && (h.departments || []).some((d) => d.name === aiDept) && (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] text-violet-700">⭐ Có khoa {aiDept}</span>
                    )}
                  </span>
                  <motion.span animate={{ rotate: open ? 180 : 0 }}><ChevronDown className="h-4 w-4" /></motion.span>
                </button>
                <AnimatePresence>
                  {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="space-y-1.5 pt-2">
                        {(h.departments || []).map((d) => (
                          <div key={d.name} className="flex items-center justify-between rounded-2xl bg-zinc-50 px-3.5 py-2 ring-1 ring-zinc-100">
                            <span className="text-xs font-bold text-zinc-700">
                              {d.name}
                              {aiDept === d.name && <span className="ml-1.5 rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] text-white">KHUYÊN ĐẾN</span>}
                            </span>
                            <a href={`tel:${d.phone}`} className="flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1.5 font-mono text-[11px] font-black text-white">
                              <Phone className="h-3 w-3" />{d.phone}
                            </a>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => openMaps(h)}
                    className="flex items-center justify-center gap-1.5 rounded-full bg-zinc-950 py-2.5 text-xs font-black text-white">
                    <NavIcon className="h-3.5 w-3.5" /> Chỉ đường
                  </motion.button>
                  <motion.a whileTap={{ scale: 0.97 }} href={`tel:${h.phone}`}
                    className="flex items-center justify-center gap-1.5 rounded-full bg-red-600 py-2.5 text-xs font-black text-white shadow">
                    <Phone className="h-3.5 w-3.5" /> {h.phone}
                  </motion.a>
                </div>
                {st === STATUS.overload && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-red-500"><Clock className="h-3 w-3" /> Quá tải — khuyên chuyển hướng sang viện khác.</p>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {list.length === 0 && (
          <p className="rounded-2xl bg-white/80 p-6 text-center text-xs text-zinc-400 ring-1 ring-zinc-200 backdrop-blur-md">
            Không tìm thấy viện nào khớp. Thử từ khóa khác.
          </p>
        )}
      </div>
    </div>
  );
}

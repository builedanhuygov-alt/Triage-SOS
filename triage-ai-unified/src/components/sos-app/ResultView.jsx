import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Polyline } from "@react-google-maps/api";
import mapStyles from "../../utils/mapStyles.js";
import realHospitals, { userLocation } from "../../utils/realHospitals.js";

const containerStyle = { width: "100%", height: "100%" };
const TOP1_ID = "bvdk-trung-tam";

// Pin SVG data-uri: user = dot xanh neon, viện top1 = pin đỏ to, viện thường = pin xanh nhỏ
const pin = (color, size = 40) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 40 40"><circle cx="20" cy="20" r="12" fill="${color}" stroke="white" stroke-width="3"/><circle cx="20" cy="20" r="18" fill="${color}" opacity="0.25"/></svg>`
  )}`;

/**
 * ResultView + Google Maps Dark/Cyberpunk.
 * - Skeleton shimmer khi isLoaded=false (không crash).
 * - Fallback mock-map khi chưa có VITE_GOOGLE_MAPS_API_KEY.
 * - Map full-screen, Bottom Sheet Framer Motion đè nửa dưới.
 */
export default function ResultView({ onReport, onBack }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  const [selectedId, setSelectedId] = useState(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "triage-google-map",
    googleMapsApiKey: apiKey,
    // Không gọi loader khi chưa có key -> tránh crash, hiện fallback
    preventGoogleFontsLoading: true,
  });

  const top1 = useMemo(() => realHospitals.find((h) => h.id === TOP1_ID) || realHospitals[0], []);
  const selected = useMemo(() => realHospitals.find((h) => h.id === selectedId) || null, [selectedId]);
  const routePath = useMemo(
    () => [{ lat: userLocation.lat, lng: userLocation.lng }, { lat: top1.lat, lng: top1.lng }],
    [top1]
  );

  // Chưa có key -> fallback mock (app vẫn chạy, nhắc tạo .env)
  if (!apiKey) {
    return (
      <div className="flex h-full flex-col">
        <div className="relative flex h-60 items-center justify-center bg-zinc-950 px-6 text-center">
          <div>
            <p className="text-sm font-black text-cyan-300">🗺️ Chưa có Google Maps API key</p>
            <p className="mx-auto mt-1 max-w-[280px] text-[11px] leading-relaxed text-zinc-400">
              Tạo file <code className="rounded bg-white/10 px-1 font-mono">.env</code> ở thư mục gốc với{" "}
              <code className="rounded bg-white/10 px-1 font-mono">VITE_GOOGLE_MAPS_API_KEY=...</code> rồi restart dev server.
            </p>
          </div>
        </div>
        <Sheet top1={top1} onReport={onReport} onBack={onBack} />
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Bản đồ full-screen */}
      <div className="absolute inset-0">
        {!isLoaded || loadError ? (
          <MapSkeleton error={loadError} />
        ) : (
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={userLocation}
            zoom={14}
            options={{
              styles: mapStyles,
              disableDefaultUI: true,
              zoomControl: true,
              gestureHandling: "greedy",
              backgroundColor: "#020617",
            }}
          >
            {/* Marker người dùng */}
            <Marker
              position={userLocation}
              title="Vị trí của bạn"
              icon={{ url: pin("#22d3ee", 36) }}
              onClick={() => setSelectedId(null)}
            />
            {/* Marker bệnh viện */}
            {realHospitals.map((h) => (
              <Marker
                key={h.id}
                position={{ lat: h.lat, lng: h.lng }}
                title={h.name}
                icon={{ url: pin(h.top1 ? "#ef4444" : h.status === "overload" ? "#f59e0b" : "#3b82f6", h.top1 ? 52 : 40) }}
                onClick={() => setSelectedId(h.id)}
              />
            ))}
            {/* Tuyến đường user -> Top1 (nét đứt neon) */}
            <Polyline
              path={routePath}
              options={{
                strokeColor: "#22d3ee",
                strokeOpacity: 0.9,
                strokeWeight: 4,
                icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "14px" }],
              }}
            />
            {/* InfoWindow khi click viện */}
            {selected && (
              <InfoWindow position={{ lat: selected.lat, lng: selected.lng }} onCloseClick={() => setSelectedId(null)}>
                <div style={{ minWidth: 180 }}>
                  <p style={{ fontWeight: 800, fontSize: 13 }}>{selected.name}</p>
                  <p style={{ fontSize: 11, color: "#64748b" }}>📍 {selected.distance}</p>
                  <p style={{ fontSize: 11, color: selected.status === "overload" ? "#dc2626" : "#059669", fontWeight: 700 }}>
                    {selected.status === "overload" ? "🔴 Đang quá tải" : "🟢 Đang trống giường"}
                  </p>
                  <a href={`tel:${selected.phone}`} style={{ fontSize: 12, fontWeight: 800, color: "#2563eb" }}>
                    📞 {selected.phone}
                  </a>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        )}
      </div>

      {/* Bottom Sheet nổi đè bản đồ */}
      <div className="pointer-events-none relative mt-auto">
        <div className="pointer-events-auto">
          <Sheet top1={top1} onReport={onReport} onBack={onBack} onSelect={setSelectedId} />
        </div>
      </div>
    </div>
  );
}

/** Skeleton shimmer khi map đang tải / lỗi (không crash). */
function MapSkeleton({ error }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-zinc-950 p-8">
      {!error ? (
        <>
          {[0, 1, 2].map((i) => (
            <motion.div key={i} initial={{ opacity: 0.3 }} animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.4, delay: i * 0.2 }}
              className="h-12 w-full max-w-[300px] rounded-2xl bg-white/10" />
          ))}
          <p className="animate-pulse text-xs font-bold text-cyan-200">Đang tải bản đồ...</p>
        </>
      ) : (
        <p className="max-w-[280px] text-center text-xs text-red-300">
          Không tải được Google Maps (kiểm tra API key / billing). App vẫn chạy với Bottom Sheet bên dưới.
        </p>
      )}
    </div>
  );
}

/** Bottom Sheet: Top1 + viện quá tải + nút hành động. */
function Sheet({ top1, onReport, onBack, onSelect }) {
  return (
    <motion.div initial={{ y: 40 }} animate={{ y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="rounded-t-[1.75rem] bg-white/85 p-4 shadow-2xl backdrop-blur-xl">
      <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-zinc-300" />
      <button onClick={() => onSelect?.(top1.id)} className="w-full text-left">
        <div className="rounded-2xl bg-white p-4 shadow-lg shadow-blue-500/20 ring-1 ring-black/5">
          <p className="font-black tracking-tight text-zinc-900">{top1.name}</p>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-bold">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">🟢 Trống giường</span>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">⚡ {top1.specialty}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{top1.distance} • 📞 {top1.phone}</p>
        </div>
      </button>
      <motion.button whileTap={{ scale: 0.97 }} onClick={onReport}
        className="mt-3 w-full rounded-full bg-blue-600 py-4 font-black tracking-tight text-white shadow-lg shadow-blue-500/20">
        Bắt đầu chỉ đường & Báo bệnh viện</motion.button>
      <div className="mt-2 scale-[0.97] rounded-2xl bg-white/60 p-3 opacity-60 ring-1 ring-black/5">
        <p className="text-xs font-bold text-zinc-600">Bệnh viện Quận X — 🔴 Quá tải. Gần (1km) nhưng hết chỗ. Không đề xuất.</p>
      </div>
      <button onClick={onBack} className="mt-1 w-full py-2 text-xs font-bold text-zinc-400">Hủy / Trở về</button>
    </motion.div>
  );
}

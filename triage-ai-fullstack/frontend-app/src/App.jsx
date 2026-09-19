import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Siren, Hospital, Pill, HeartPulse,
  FolderOpen, MessageCircle, Settings, Home, ClipboardList,
} from "lucide-react";
import HomeView from "./views/HomeView.jsx";
import SosView from "./views/SosView.jsx";
import HospitalMapView from "./views/HospitalMapView.jsx";
import MedicationView from "./views/MedicationView.jsx";
import HealthMetricsView from "./views/HealthMetricsView.jsx";
import MedicalIDView from "./views/MedicalIDView.jsx";
import AiChatbotView from "./views/AiChatbotView.jsx";
import ProfileView from "./views/ProfileView.jsx";
import PatientHealthView from "./views/PatientHealthView.jsx";
import LoginView from "./components/LoginView.jsx";
import { useMedicalProfile } from "./hooks/useMedicalProfile.js";
import { SessionProvider, useSession } from "./context/SessionContext.jsx";
import { socket } from "./services/realtime.js";

const spring = { type: "spring", stiffness: 320, damping: 30 };

// 8 tabs: icon lucide + tên rút gọn
const TABS = [
  { id: "home", label: "Home", icon: Home },
  { id: "sos", label: "SOS", icon: Siren },
  { id: "hospitals", label: "Viện", icon: Hospital },
  { id: "meds", label: "Thuốc", icon: Pill },
  { id: "metrics", label: "Chỉ số", icon: HeartPulse },
  { id: "records", label: "Dữ liệu", icon: ClipboardList },
  { id: "medicalid", label: "Hồ sơ", icon: FolderOpen },
  { id: "chat", label: "AI Chat", icon: MessageCircle },
  { id: "profile", label: "Cài đặt", icon: Settings },
];

function loadAccent() {
  try {
    return localStorage.getItem("triage-accent") || "red";
  } catch {
    return "red";
  }
}

/**
 * App — Super App 7 tabs + Bottom Navigation fixed đáy.
 * Khung: max-w-md mx-auto h-screen relative overflow-hidden bg-zinc-50 flex flex-col.
 */
/**
 * AppShell (trong SessionProvider): gate login + banner ONLINE/OFFLINE/SYNCED.
 */
function AppShell() {
  const [activeTab, setActiveTab] = useState("sos"); // mặc định SOS
  const [accent, setAccent] = useState(loadAccent);
  const [net, setNet] = useState({ online: navigator.onLine, socket: socket.connected });
  const { session } = useSession();
  const { profile, update, toggleCondition, toggleAllergy, addVaccine, removeVaccine } =
    useMedicalProfile();

  useEffect(() => {
    try {
      localStorage.setItem("triage-accent", accent);
    } catch {}
  }, [accent]);

  // ONLINE / OFFLINE / RECONNECTING / SYNCED
  useEffect(() => {
    const up = () => setNet((n) => ({ ...n, online: true }));
    const down = () => setNet((n) => ({ ...n, online: false }));
    const on = () => setNet((n) => ({ ...n, socket: true }));
    const off = () => setNet((n) => ({ ...n, socket: false }));
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    socket.on("connect", on);
    socket.on("disconnect", off);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      socket.off("connect", on);
      socket.off("disconnect", off);
    };
  }, []);

  const netLabel = !net.online
    ? ["OFFLINE — dùng cache", "bg-zinc-800"]
    : !net.socket
      ? ["RECONNECTING...", "bg-amber-500"]
      : null;

  const activeColor = accent === "blue" ? "text-blue-600" : accent === "green" ? "text-emerald-600" : "text-red-600";
  const activeBg = accent === "blue" ? "bg-blue-50" : accent === "green" ? "bg-emerald-50" : "bg-red-50";

  // Gate login: chưa session thì ở màn hình riêng (không phải web)
  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-800 sm:py-6">
        <div className="relative mx-auto flex h-screen max-w-md flex-col overflow-hidden bg-zinc-950 shadow-2xl sm:h-[860px] sm:rounded-[2rem] sm:ring-8 sm:ring-zinc-950">
          <LoginView />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-800 sm:py-6">
      {/* Khung di động chuẩn */}
      <div className="relative mx-auto flex h-screen max-w-md flex-col overflow-hidden bg-zinc-50 shadow-2xl sm:h-[860px] sm:rounded-[2rem] sm:ring-8 sm:ring-zinc-950">
        {/* Banner mạng */}
        {netLabel && (
          <div className={`z-40 px-4 py-1.5 text-center text-[11px] font-black text-white ${netLabel[1]}`}>
            {netLabel[0]}
          </div>
        )}
        {/* CARE MODE — caregiver thấy rõ đang chăm ai */}
        {session?.user?.role === "CAREGIVER" && (
          <div className="z-40 bg-violet-700 px-4 py-2 text-center text-white">
            <p className="text-[11px] font-black tracking-wide">💜 CARE MODE — Managing care for Patient {session.user.patientId}</p>
          </div>
        )}
        {/* Nội dung: cuộn + chừa chỗ cho nav (pb-24) */}
        <div className="min-h-0 flex-1 overflow-y-auto pb-24">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ x: 56, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -56, opacity: 0 }}
              transition={spring}
              className="min-h-full"
            >
              {activeTab === "home" && <HomeView user={session?.user} onNavigate={setActiveTab} />}
              {activeTab === "sos" && <SosView profile={profile} onNavigateTab={setActiveTab} />}
              {activeTab === "hospitals" && <HospitalMapView />}
              {activeTab === "meds" && <MedicationView />}
              {activeTab === "metrics" && <HealthMetricsView />}
              {activeTab === "records" && <PatientHealthView />}
              {activeTab === "medicalid" && (
                <MedicalIDView
                  profile={profile} update={update} toggleCondition={toggleCondition}
                  toggleAllergy={toggleAllergy} addVaccine={addVaccine} removeVaccine={removeVaccine}
                />
              )}
              {activeTab === "chat" && <AiChatbotView />}
              {activeTab === "profile" && <ProfileView accent={accent} setAccent={setAccent} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom Navigation — fixed đáy, 7 tabs đều nhau */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md border-t border-zinc-200 bg-white/90 backdrop-blur-xl">
          <div className="grid grid-cols-8 gap-0.5 px-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-1.5">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  aria-label={t.label}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[9px] font-bold tracking-tight transition-colors ${
                    active ? activeColor : "text-zinc-400 hover:text-zinc-600"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="tab-active-bg"
                      transition={spring}
                      className={`absolute inset-0 rounded-2xl ${activeBg}`}
                    />
                  )}
                  <span className="relative">
                    <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                    {t.id === "sos" && (
                      <span className="absolute -right-1 -top-1 flex h-2 w-2">
                        <span className="absolute h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                      </span>
                    )}
                  </span>
                  <span className="relative">{t.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

/** Root: session gate cho toàn Super App. */
export default function App() {
  return (
    <SessionProvider>
      <AppShell />
    </SessionProvider>
  );
}

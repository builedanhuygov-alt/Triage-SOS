import React, { useState } from "react";
import StaffDashboard from "./StaffDashboard.jsx";
import StaffDirectory from "./StaffDirectory.jsx";
import OrgTree from "./OrgTree.jsx";
import DoctorDirectory from "./DoctorDirectory.jsx";
import DepartmentDirectory from "./DepartmentDirectory.jsx";
import DemoPortal from "./DemoPortal.jsx";
import PermissionInspector from "./PermissionInspector.jsx";
import CommandCenter from "./CommandCenter.jsx";
import DirectorConsole from "./DirectorConsole.jsx";
import "./tokens.css";
import { ResourceControl, FinanceDesk, DocControl, SecurityCenter } from "./OpsPanels.jsx";
import { IntakeForm, PatientChart, BhytPanel } from "./IntakeChart.jsx";

const TABS = [
  { id: "cmd", label: "🗺️ Command" },
  { id: "director", label: "👔 Giám đốc" },
  { id: "intake", label: "🧾 Tiếp nhận" },
  { id: "chart", label: "📋 Hồ sơ" },
  { id: "res", label: "📦 Tài nguyên" },
  { id: "fin", label: "💰 Kế toán" },
  { id: "doc", label: "📄 Văn thư" },
  { id: "sec", label: "🛡️ An ninh" },
  { id: "bhyt", label: "💳 BHYT" },
  { id: "dash", label: "📊 Nhân sự" },
  { id: "staff", label: "👥 Tài khoản" },
  { id: "org", label: "🏢 Tổ chức" },
  { id: "doctors", label: "🩺 Bác sĩ" },
  { id: "depts", label: "🏥 Khoa" },
  { id: "demo", label: "🔑 Demo Login" },
  { id: "rbac", label: "🛡️ Phân quyền" },
];

/** Container module DEMO1: Staff Directory, Org Tree, RBAC, Demo Portal… */
export default function HospitalAdmin() {
  const [tab, setTab] = useState("cmd");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 rounded-2xl bg-white/[0.04] p-2 ring-1 ring-white/10 backdrop-blur-xl">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-xl px-3.5 py-2 text-xs font-black ${tab === t.id ? "bg-white text-zinc-950" : "text-zinc-300 hover:bg-white/10"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "cmd" && <CommandCenter />}
      {tab === "director" && <DirectorConsole />}
      {tab === "intake" && <IntakeForm />}
      {tab === "chart" && <PatientChart />}
      {tab === "res" && <ResourceControl />}
      {tab === "fin" && <FinanceDesk />}
      {tab === "doc" && <DocControl />}
      {tab === "sec" && <SecurityCenter />}
      {tab === "bhyt" && <BhytPanel />}
      {tab === "dash" && <StaffDashboard />}
      {tab === "staff" && <StaffDirectory />}
      {tab === "org" && <OrgTree />}
      {tab === "doctors" && <DoctorDirectory />}
      {tab === "depts" && <DepartmentDirectory />}
      {tab === "demo" && <DemoPortal />}
      {tab === "rbac" && <PermissionInspector />}
    </div>
  );
}

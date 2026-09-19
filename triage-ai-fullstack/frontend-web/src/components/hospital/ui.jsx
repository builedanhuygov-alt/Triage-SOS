import React from "react";

export const BANNER = "DEMO ENVIRONMENT — NOT FOR PRODUCTION";

export function DemoBanner() {
  return (
    <div className="rounded-2xl bg-amber-400/10 p-2.5 text-center text-[11px] font-black tracking-wide text-amber-300 ring-1 ring-amber-400/30">
      {BANNER} — BỆNH VIỆN ĐA KHOA TW DEMO1 · dữ liệu giả lập, không phải người thật
    </div>
  );
}

export function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10 backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children }) {
  return <h2 className="text-sm font-black tracking-tight text-white">{children}</h2>;
}

const STATUS_COLOR = {
  ACTIVE: "bg-emerald-500/15 text-emerald-300",
  INACTIVE: "bg-zinc-500/15 text-zinc-300",
  LOCKED: "bg-red-500/15 text-red-300",
  PENDING: "bg-amber-400/15 text-amber-300",
};

export function StatusBadge({ status }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_COLOR[status] || "bg-white/10 text-zinc-300"}`}>
      {status}
    </span>
  );
}

export function RoleBadge({ role }) {
  return (
    <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 font-mono text-[11px] font-bold text-cyan-300">
      {role}
    </span>
  );
}

export function Field({ label, children }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <div className="mt-0.5 text-[13px] font-semibold text-zinc-100">{children}</div>
    </div>
  );
}

export function initials(name = "?") {
  return name.split(" ").filter(Boolean).slice(-2).map((w) => w[0]).join("").toUpperCase();
}

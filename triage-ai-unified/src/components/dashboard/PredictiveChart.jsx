import React from "react";
import { BrainCircuit } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area } from "recharts";
import Card from "../ui/Card.jsx";

export const chartData = [
  { time: "-12h", actual: 18, forecast: null },
  { time: "-10h", actual: 22, forecast: null },
  { time: "-8h", actual: 26, forecast: null },
  { time: "-6h", actual: 24, forecast: null },
  { time: "-4h", actual: 31, forecast: null },
  { time: "-2h", actual: 35, forecast: null },
  { time: "Now", actual: 38, forecast: 38 },
  { time: "+1h", actual: null, forecast: 41 },
  { time: "+2h", actual: null, forecast: 44 },
  { time: "+3h", actual: null, forecast: 47 },
  { time: "+4h", actual: null, forecast: 51 },
  { time: "+5h", actual: null, forecast: 54 },
  { time: "+6h", actual: null, forecast: 57 },
];
export const OVERLOAD = 50;

/** PredictiveChart: Recharts custom minimal + gradient fill dự báo AI. */
export default function PredictiveChart() {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-black tracking-tight text-white">
          <BrainCircuit className="h-4 w-4 text-violet-300" /> AI Predictive — Dự báo quá tải
        </h2>
        <span className="animate-pulse rounded-full bg-red-500/15 px-3 py-1 text-[11px] font-bold text-red-300 ring-1 ring-red-500/30">⚠️ Chạm ngưỡng trong ~4h</span>
      </div>
      <div className="mt-2 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id="fc-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#27272a" strokeDasharray="2 6" vertical={false} />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "rgba(0,0,0,.75)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, fontSize: 12, color: "#fff" }} />
            <ReferenceLine y={OVERLOAD} stroke="#ef4444" strokeDasharray="4 4" />
            <Area type="monotone" dataKey="forecast" stroke="none" fill="url(#fc-fill)" />
            <Line type="monotone" dataKey="actual" stroke="#22d3ee" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="forecast" stroke="#a78bfa" strokeWidth={2.5} strokeDasharray="6 5" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

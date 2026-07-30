import React from "react";
import { Target } from "lucide-react";
import { KPI_LABELS, KPI_ICONS, formatMetric } from "./metrics";

export default function KpiCard({ kpi, value, sublabel }) {
  const Icon = KPI_ICONS[kpi] || Target;
  const label = KPI_LABELS[kpi] || kpi;
  return (
    <div className="bg-white border border-[#2563EB]/15 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-[#2563EB]" />
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900">{formatMetric(kpi, value)}</div>
      {sublabel && <div className="text-xs text-slate-400 mt-1">{sublabel}</div>}
    </div>
  );
}
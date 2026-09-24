import React from "react";
import { Sparkles, Clock, TrendingUp } from "lucide-react";

const C = {
  container: "#1a1a1a", border: "#2d2d2d",
  text: "#ffffff", muted: "#a0a0a0", accent: "#FF5A4F",
};

// Studio Production Minutes card — sidebar bottom widget matching canonical Studio.
export default function StudioProductionMinutesCard({ entitlement }) {
  const included = entitlement?.monthly_minutes || 0;
  const remaining = entitlement?.minutes_remaining ?? 0;
  const used = entitlement?.minutes_used ?? 0;
  const percent = included > 0 ? Math.min(100, (remaining / included) * 100) : 0;

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: C.container,
        border: `1px solid ${C.border}`,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="w-3.5 h-3.5" style={{ color: C.accent }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
          Studio Production Minutes
        </span>
      </div>
      <p className="text-2xl font-bold mb-1" style={{ color: C.text }}>
        {remaining}
        <span className="text-sm font-medium ml-1" style={{ color: C.muted }}>/ {included}</span>
      </p>
      <p className="text-xs mb-3" style={{ color: C.muted }}>included this month</p>
      <div className="w-full h-1.5 rounded-full overflow-hidden mb-2" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, background: "linear-gradient(135deg, #FF4F46 0%, #FF806F 100%)" }} />
      </div>
      <div className="flex items-center gap-1 text-xs" style={{ color: C.muted }}>
        <TrendingUp className="w-3 h-3" style={{ color: C.accent }} />
        {used} used
      </div>
    </div>
  );
}
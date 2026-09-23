import React from "react";
import { Sparkles, Clock, TrendingUp } from "lucide-react";

// Studio Production Minutes card — canonical Studio visual language.
// Dark charcoal card, subtle border, coral icon, large available value,
// muted supporting text, thin progress bar with Studio gradient fill.
// Values come from the canonical Studio entitlement — never hardcoded.
export default function StudioProductionMinutesCard({ entitlement }) {
  const included = entitlement?.monthly_minutes || 0;
  const remaining = entitlement?.minutes_remaining ?? 0;
  const used = entitlement?.minutes_used ?? 0;
  const percent = included > 0 ? Math.min(100, (remaining / included) * 100) : 0;

  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "#1C1C1F",
        border: "1px solid rgba(255,90,79,0.15)",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className="w-3.5 h-3.5" style={{ color: "#FF5A4F" }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(250,248,245,0.5)" }}>
              Studio Production Minutes
            </span>
          </div>
          <p className="text-3xl font-extrabold" style={{ color: "#FAF8F5" }}>
            {remaining}
            <span className="text-sm font-medium ml-1" style={{ color: "rgba(250,248,245,0.4)" }}>min available</span>
          </p>
        </div>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #FF4F46 0%, #FF806F 100%)" }}
        >
          <Clock className="w-5 h-5 text-white" />
        </div>
      </div>

      {/* Thin progress bar with Studio gradient fill */}
      <div className="w-full h-1.5 rounded-full overflow-hidden mb-3" style={{ background: "rgba(250,248,245,0.08)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${percent}%`,
            background: "linear-gradient(135deg, #FF4F46 0%, #FF806F 100%)",
          }}
        />
      </div>

      <div className="flex items-center gap-4 text-xs" style={{ color: "rgba(250,248,245,0.5)" }}>
        <span className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3" style={{ color: "#FF746B" }} />
          {used} used
        </span>
        <span>·</span>
        <span>{included} included/mo</span>
      </div>
    </div>
  );
}
import React from "react";

export const CREAM = "#FFFBF5";
export const GOLD = "#B8956A";
export const GOLD_DARK = "#A68559";
export const TEXT_DARK = "#1A1A1A";
export const MUTED_DARK = "rgba(26,26,26,0.45)";
export const MUTED_LIGHT = "rgba(255,251,245,0.5)";
export const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };
export const MONO = { fontFamily: "'SF Mono', 'Monaco', 'Menlo', monospace" };

export const card = {
  backgroundColor: "#1A1A1A",
  border: "1px solid rgba(184,149,106,0.2)",
  borderRadius: "14px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
};

export const CHART_COLORS = ["#B8956A", "#A68559", "#C9B08A", "#8E724B", "#755E3E", "#D2BC9C", "#E8DCC6"];

export function SectionWrapper({ title, icon: Icon, children, action }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ ...SERIF, color: TEXT_DARK }}>
          {Icon && <Icon className="w-5 h-5" style={{ color: GOLD }} />}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export function KpiCard({ label, value, sub, accent }) {
  return (
    <div className="p-4" style={card}>
      <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: MUTED_LIGHT }}>{label}</p>
      <p className="text-2xl font-bold" style={{ ...SERIF, ...MONO, color: accent || GOLD }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: MUTED_LIGHT }}>{sub}</p>}
    </div>
  );
}

export function EmptyState({ message }) {
  return (
    <div className="p-8 text-center" style={card}>
      <p className="text-sm" style={{ color: MUTED_LIGHT }}>{message}</p>
    </div>
  );
}

export function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.3)", borderRadius: "8px", padding: "8px 12px" }}>
      {label && <p className="text-xs font-bold mb-1" style={{ color: CREAM }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-xs" style={{ color: p.color || GOLD }}>
          {p.name}: {typeof p.value === "number" ? p.value : p.value}
        </p>
      ))}
    </div>
  );
}
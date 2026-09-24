import React from "react";
import { Sparkles, TrendingUp, Clock, CheckCircle2, RefreshCw } from "lucide-react";
import { getStudioPlan } from "@/lib/arrivStudioConfig";

const STUDIO_FONT = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };
const C = {
  bg: "#0f0f0f", container: "#1a1a1a", border: "#2d2d2d",
  text: "#ffffff", muted: "#a0a0a0", accent: "#FF5A4F",
};

// Studio Usage & Billing — canonical Studio usage display.
export default function StudioUsage({ entitlement, onRefresh }) {
  const included = entitlement?.monthly_minutes || 0;
  const remaining = entitlement?.minutes_remaining ?? 0;
  const used = entitlement?.minutes_used ?? 0;
  const percent = included > 0 ? Math.min(100, (remaining / included) * 100) : 0;
  const plan = getStudioPlan(entitlement?.plan_id);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8" style={{ ...STUDIO_FONT }}>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: C.text }}>Usage & Billing</h1>
          <p className="text-sm mt-1" style={{ color: C.muted }}>Manage your Studio Production Minutes and subscription.</p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: C.container, color: C.muted, border: `1px solid ${C.border}` }}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {plan && (
        <div className="rounded-xl p-5" style={{ background: C.container, border: `1px solid ${C.border}` }}>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.muted }}>Current Plan</span>
          <h2 className="text-xl font-bold mt-1" style={{ color: C.text }}>{plan.name}</h2>
          <p className="text-sm mt-1" style={{ color: C.muted }}>{plan.description}</p>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-2xl font-bold" style={{ color: C.accent }}>${plan.price}</span>
            <span className="text-sm" style={{ color: C.muted }}>/month</span>
          </div>
        </div>
      )}

      <div className="rounded-xl p-6" style={{ background: C.container, border: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4" style={{ color: C.accent }} />
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: C.muted }}>Studio Production Minutes</h2>
        </div>
        <div className="flex items-end gap-2 mb-6">
          <span className="text-5xl font-bold" style={{ color: C.text }}>{remaining}</span>
          <span className="text-sm pb-2" style={{ color: C.muted }}>min available</span>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden mb-4" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, background: "linear-gradient(135deg, #FF4F46 0%, #FF806F 100%)" }} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <UsageStat icon={CheckCircle2} label="Included" value={`${included} min`} color="#22c55e" />
          <UsageStat icon={TrendingUp} label="Used" value={`${used} min`} color={C.accent} />
          <UsageStat icon={Clock} label="Available" value={`${remaining} min`} color={C.accent} />
          <UsageStat icon={RefreshCw} label="Resets" value="Monthly" color={C.muted} />
        </div>
      </div>

      {entitlement?.entitlement_overrides && (
        <div className="rounded-xl p-5" style={{ background: C.container, border: `1px solid ${C.border}` }}>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: C.muted }}>Preferred Membership Benefits</h2>
          <div className="space-y-2">
            {entitlement.entitlement_overrides.studio_discount_percent > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: C.muted }}>Studio Discount</span>
                <span className="font-semibold" style={{ color: C.accent }}>{entitlement.entitlement_overrides.studio_discount_percent}% off</span>
              </div>
            )}
            {entitlement.entitlement_overrides.studio_included_minutes_bonus > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: C.muted }}>Bonus Minutes</span>
                <span className="font-semibold" style={{ color: C.accent }}>+{entitlement.entitlement_overrides.studio_included_minutes_bonus} min/mo</span>
              </div>
            )}
            {entitlement.entitlement_overrides.studio_priority && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: C.muted }}>Priority Rendering</span>
                <span className="font-semibold" style={{ color: "#22c55e" }}>Enabled</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UsageStat({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4" style={{ color }} />
      <div>
        <p className="text-xs" style={{ color: C.muted }}>{label}</p>
        <p className="text-sm font-semibold" style={{ color: C.text }}>{value}</p>
      </div>
    </div>
  );
}
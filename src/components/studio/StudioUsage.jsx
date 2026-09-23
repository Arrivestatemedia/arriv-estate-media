import React from "react";
import { Sparkles, TrendingUp, Clock, CheckCircle2, RefreshCw } from "lucide-react";
import { getStudioPlan } from "@/lib/arrivStudioConfig";

const STUDIO_FONT = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };

// Studio Usage & Billing — canonical Studio usage display.
// Shows Included, Rollover, Purchased, Available from canonical Studio entitlement.
// No local usage ledger — all values come from the canonical Studio backend.
export default function StudioUsage({ entitlement, onRefresh }) {
  const included = entitlement?.monthly_minutes || 0;
  const remaining = entitlement?.minutes_remaining ?? 0;
  const used = entitlement?.minutes_used ?? 0;
  const percent = included > 0 ? Math.min(100, (remaining / included) * 100) : 0;
  const plan = getStudioPlan(entitlement?.plan_id);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8" style={{ ...STUDIO_FONT }}>
      {/* Page heading */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: "#FAF8F5" }}>
            Usage & Billing
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(250,248,245,0.4)" }}>
            Manage your Studio Production Minutes and subscription.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{ background: "#1C1C1F", color: "rgba(250,248,245,0.6)", border: "1px solid rgba(250,248,245,0.08)" }}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Current Plan */}
      {plan && (
        <div className="rounded-xl p-5" style={{ background: "#1C1C1F", border: "1px solid rgba(255,90,79,0.15)" }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(250,248,245,0.5)" }}>
              Current Plan
            </span>
          </div>
          <h2 className="text-xl font-bold" style={{ color: "#FAF8F5" }}>{plan.name}</h2>
          <p className="text-sm mt-1" style={{ color: "rgba(250,248,245,0.4)" }}>{plan.description}</p>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-2xl font-extrabold" style={{ color: "#FF5A4F" }}>${plan.price}</span>
            <span className="text-sm" style={{ color: "rgba(250,248,245,0.4)" }}>/month</span>
          </div>
        </div>
      )}

      {/* Production Minutes Summary */}
      <div className="rounded-xl p-6" style={{ background: "#1C1C1F", border: "1px solid rgba(250,248,245,0.08)" }}>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4" style={{ color: "#FF5A4F" }} />
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "rgba(250,248,245,0.5)" }}>
            Studio Production Minutes
          </h2>
        </div>

        {/* Large available number */}
        <div className="flex items-end gap-2 mb-6">
          <span className="text-5xl font-extrabold" style={{ color: "#FAF8F5" }}>{remaining}</span>
          <span className="text-sm pb-2" style={{ color: "rgba(250,248,245,0.4)" }}>min available</span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 rounded-full overflow-hidden mb-4" style={{ background: "rgba(250,248,245,0.08)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${percent}%`, background: "linear-gradient(135deg, #FF4F46 0%, #FF806F 100%)" }}
          />
        </div>

        {/* Breakdown grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" style={{ color: "#22c55e" }} />
            <div>
              <p className="text-xs" style={{ color: "rgba(250,248,245,0.4)" }}>Included</p>
              <p className="text-sm font-semibold" style={{ color: "#FAF8F5" }}>{included} min</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" style={{ color: "#FF746B" }} />
            <div>
              <p className="text-xs" style={{ color: "rgba(250,248,245,0.4)" }}>Used</p>
              <p className="text-sm font-semibold" style={{ color: "#FAF8F5" }}>{used} min</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" style={{ color: "#FF5A4F" }} />
            <div>
              <p className="text-xs" style={{ color: "rgba(250,248,245,0.4)" }}>Available</p>
              <p className="text-sm font-semibold" style={{ color: "#FAF8F5" }}>{remaining} min</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" style={{ color: "rgba(250,248,245,0.4)" }} />
            <div>
              <p className="text-xs" style={{ color: "rgba(250,248,245,0.4)" }}>Resets</p>
              <p className="text-sm font-semibold" style={{ color: "#FAF8F5" }}>Monthly</p>
            </div>
          </div>
        </div>
      </div>

      {/* Entitlement Overrides (Preferred membership) */}
      {entitlement?.entitlement_overrides && (
        <div className="rounded-xl p-5" style={{ background: "#1C1C1F", border: "1px solid rgba(255,90,79,0.15)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "rgba(250,248,245,0.5)" }}>
            Preferred Membership Benefits
          </h2>
          <div className="space-y-2">
            {entitlement.entitlement_overrides.studio_discount_percent > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: "rgba(250,248,245,0.6)" }}>Studio Discount</span>
                <span className="font-semibold" style={{ color: "#FF746B" }}>{entitlement.entitlement_overrides.studio_discount_percent}% off</span>
              </div>
            )}
            {entitlement.entitlement_overrides.studio_included_minutes_bonus > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: "rgba(250,248,245,0.6)" }}>Bonus Minutes</span>
                <span className="font-semibold" style={{ color: "#FF746B" }}>+{entitlement.entitlement_overrides.studio_included_minutes_bonus} min/mo</span>
              </div>
            )}
            {entitlement.entitlement_overrides.studio_priority && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: "rgba(250,248,245,0.6)" }}>Priority Rendering</span>
                <span className="font-semibold" style={{ color: "#22c55e" }}>Enabled</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
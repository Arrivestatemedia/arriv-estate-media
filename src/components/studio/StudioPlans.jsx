import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Check } from "lucide-react";
import { studioPlans } from "@/lib/arrivStudioConfig";
import StudioLogo from "@/components/studio/StudioLogo";

const STUDIO_FONT = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };
const C = {
  bg: "#0f0f0f", container: "#1a1a1a", border: "#2d2d2d",
  text: "#ffffff", muted: "#a0a0a0", accent: "#FF5A4F",
};

// Studio plan selection for customers without an active entitlement.
export default function StudioPlans({ onSubscribed, compact = false }) {
  const [subscribing, setSubscribing] = useState(null);
  const [error, setError] = useState(null);

  const handleSubscribe = async (planId) => {
    setSubscribing(planId);
    setError(null);
    try {
      const res = await base44.functions.invoke("manageStudioSubscription", {
        action: "subscribe",
        plan_id: planId,
      });
      const data = res?.data || res;
      if (data?.success) {
        localStorage.setItem("studio_entitlement", JSON.stringify({
          active: true,
          plan_id: data.subscription.plan_id,
          plan_name: data.subscription.plan_name,
        }));
        onSubscribed?.(data.subscription);
      } else {
        setError(data?.error || "Failed to activate Studio.");
      }
    } catch (e) {
      setError(e?.message || "Failed to activate Studio.");
    } finally {
      setSubscribing(null);
    }
  };

  return (
    <div className={compact ? "" : "px-4 py-8"} style={STUDIO_FONT}>
      {!compact && (
        <div className="text-center mb-8">
          <div className="flex flex-col items-center gap-3 mb-4">
            <StudioLogo size={40} />
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: C.text }}>Studio for Real Estate</h2>
          <p className="text-sm max-w-md mx-auto" style={{ color: C.muted }}>
            Create professional listing promos, property videos, social content, agent marketing,
            and training — all powered by Arriv Studio, built for real estate.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm text-center" style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {studioPlans.map((plan) => {
          const isPro = plan.id === "studio_pro";
          return (
            <div
              key={plan.id}
              className="rounded-xl p-6 flex flex-col transition-all"
              style={{ background: C.container, border: isPro ? "2px solid #FF5A4F" : `1px solid ${C.border}` }}
            >
              {isPro && (
                <div className="mb-3">
                  <span className="text-xs font-bold px-3 py-1 rounded-full text-white" style={{ background: "linear-gradient(135deg, #FF4F46 0%, #FF806F 100%)" }}>
                    MOST POPULAR
                  </span>
                </div>
              )}
              <h3 className="text-lg font-bold mb-1" style={{ color: C.text }}>
                {plan.name.split("—")[1]?.trim() || plan.name}
              </h3>
              <div className="mb-4">
                <span className="text-3xl font-bold" style={{ color: C.text }}>${plan.price}</span>
                <span className="text-sm" style={{ color: C.muted }}>/month</span>
              </div>
              <p className="text-xs mb-4" style={{ color: C.muted }}>{plan.description}</p>
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                    <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: C.accent }} />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => handleSubscribe(plan.id)}
                disabled={subscribing !== null}
                className="w-full"
                style={{
                  background: isPro ? "linear-gradient(135deg, #FF4F46 0%, #FF806F 100%)" : "rgba(255,255,255,0.06)",
                  color: C.text,
                  border: isPro ? "none" : "1px solid rgba(255,90,79,0.3)",
                }}
              >
                {subscribing === plan.id ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Activating...</>
                ) : (
                  `Get ${plan.name.split("—")[1]?.trim() || plan.name}`
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
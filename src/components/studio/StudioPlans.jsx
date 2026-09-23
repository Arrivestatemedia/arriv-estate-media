import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Check, Film } from "lucide-react";
import { studioPlans } from "@/lib/arrivStudioConfig";

// Studio plan selection and purchase for customers without an active entitlement.
// Estate Media handles the transaction via manageStudioSubscription.
// After verified subscription activation, the Studio tab appears.
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
        // Refresh entitlement cache
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
    <div className={compact ? "" : "px-4 py-8"}>
      {!compact && (
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #FF5A4F, #FF806F)" }}>
              <Film className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-3xl font-bold" style={{ color: "#111111" }}>Studio for Real Estate</h2>
          </div>
          <p className="text-sm max-w-md mx-auto" style={{ color: "rgba(28,28,31,0.6)" }}>
            Create professional listing promos, property videos, social content, agent marketing,
            and training — all powered by Arriv Studio, built for real estate.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm text-center" style={{ background: "#FFF0ED", color: "#FF5A4F" }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {studioPlans.map((plan) => (
          <div
            key={plan.id}
            className="rounded-2xl border-2 p-6 flex flex-col transition-all"
            style={{
              borderColor: plan.id === "studio_pro" ? "#FF5A4F" : "rgba(28,28,31,0.1)",
              background: plan.id === "studio_pro" ? "#FFF0ED" : "#FAF8F5",
            }}
          >
            {plan.id === "studio_pro" && (
              <div className="mb-3">
                <span className="text-xs font-bold px-3 py-1 rounded-full text-white" style={{ background: "linear-gradient(135deg, #FF5A4F, #FF806F)" }}>
                  MOST POPULAR
                </span>
              </div>
            )}
            <h3 className="text-xl font-bold mb-1" style={{ color: "#111111" }}>{plan.name.split("—")[1]?.trim() || plan.name}</h3>
            <div className="mb-4">
              <span className="text-3xl font-bold" style={{ color: "#111111" }}>${plan.price}</span>
              <span className="text-sm" style={{ color: "rgba(28,28,31,0.5)" }}>/month</span>
            </div>
            <p className="text-xs mb-4" style={{ color: "rgba(28,28,31,0.6)" }}>{plan.description}</p>
            <ul className="space-y-2 mb-6 flex-1">
              {plan.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-xs" style={{ color: "rgba(28,28,31,0.7)" }}>
                  <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "#FF5A4F" }} />
                  {f}
                </li>
              ))}
            </ul>
            <Button
              onClick={() => handleSubscribe(plan.id)}
              disabled={subscribing !== null}
              className="w-full"
              style={{
                background: plan.id === "studio_pro" ? "linear-gradient(135deg, #FF5A4F, #FF806F)" : "#111111",
                color: "#FAF8F5",
              }}
            >
              {subscribing === plan.id ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Activating...</>
              ) : (
                `Get ${plan.name.split("—")[1]?.trim() || plan.name}`
              )}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
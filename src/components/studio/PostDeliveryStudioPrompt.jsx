import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Film, ArrowRight, Sparkles } from "lucide-react";
import { postDeliveryActions } from "@/lib/arrivStudioConfig";
import { createPageUrl } from "@/utils";

// Post-delivery Studio prompt — CONDITIONAL on entitlement.
// WITH Studio: shows direct creation actions that navigate to the native Studio workspace.
// WITHOUT Studio: shows "TURN YOUR MEDIA INTO MORE" upsell with purchase option.
export default function PostDeliveryStudioPrompt({ booking }) {
  const navigate = useNavigate();
  const [entitlement, setEntitlement] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    base44.functions.invoke("getStudioEntitlement", {})
      .then((res) => {
        const data = res?.data || res;
        setEntitlement(data);
      })
      .catch(() => setEntitlement({ active: false }))
      .finally(() => setChecking(false));
  }, []);

  if (checking) return null;

  // WITHOUT Studio — show upsell
  if (!entitlement?.active) {
    return (
      <div className="mt-4 rounded-xl border-2 p-4" style={{ borderColor: "rgba(255,90,79,0.3)", background: "#FFF0ED" }}>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5" style={{ color: "#FF5A4F" }} />
          <h4 className="text-sm font-bold tracking-wide" style={{ color: "#111111" }}>
            TURN YOUR MEDIA INTO MORE
          </h4>
        </div>
        <p className="text-xs mb-3" style={{ color: "rgba(28,28,31,0.6)" }}>
          Your media is delivered. Add Arriv Studio to create professional listing promos,
          property videos, and social content from your shoot.
        </p>
        <Button
          size="sm"
          onClick={() => navigate(createPageUrl("StudioWorkspace"))}
          className="text-xs"
          style={{ background: "linear-gradient(135deg, #FF5A4F, #FF806F)", color: "white" }}
        >
          <Film className="w-3.5 h-3.5 mr-1.5" />
          Explore Studio for Real Estate
        </Button>
      </div>
    );
  }

  // WITH Studio — show direct creation actions
  return (
    <div className="mt-4 rounded-xl border-2 p-4" style={{ borderColor: "rgba(255,90,79,0.3)", background: "#111111" }}>
      <div className="flex items-center gap-2 mb-3">
        <Film className="w-5 h-5" style={{ color: "#FF5A4F" }} />
        <h4 className="text-sm font-bold tracking-wide" style={{ color: "#FAF8F5" }}>
          CREATE WITH ARRIV STUDIO
        </h4>
        <span className="text-xs ml-auto" style={{ color: "rgba(250,248,245,0.5)" }}>
          {entitlement.minutes_remaining ?? 0} min remaining
        </span>
      </div>
      <p className="text-xs mb-3" style={{ color: "rgba(250,248,245,0.6)" }}>
        Your media is delivered. Turn it into professional videos, social content, and promotions.
      </p>
      <div className="flex flex-wrap gap-2">
        {postDeliveryActions.map((action) => (
          <Button
            key={action.id}
            size="sm"
            onClick={() => navigate(createPageUrl("StudioWorkspace"))}
            className="text-xs"
            style={{ background: "rgba(255,90,79,0.15)", color: "#FAF8F5", border: "1px solid rgba(255,90,79,0.3)" }}
          >
            <ArrowRight className="w-3 h-3 mr-1" />
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
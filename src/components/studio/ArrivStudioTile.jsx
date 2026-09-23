import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Film, ArrowRight } from "lucide-react";
import { createPageUrl } from "@/utils";

// Client Portal entry tile for Arriv Studio.
// Navigates to the native embedded Studio workspace inside Estate Media.
// No redirect — Studio lives inside Estate Media.
export default function ArrivStudioTile({ subscription, onManage }) {
  const navigate = useNavigate();

  return (
    <div className="rounded-2xl border-2 overflow-hidden mb-8" style={{ background: "#111111", borderColor: "rgba(255,90,79,0.3)" }}>
      <div className="p-6 sm:p-8">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #FF5A4F, #FF806F)" }}>
            <Film className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold tracking-wide" style={{ color: "#FAF8F5" }}>ARRIV STUDIO</h2>
            <p className="text-sm mt-1" style={{ color: "rgba(250,248,245,0.6)" }}>
              Create professional real-estate videos, social content, promotions, and training.
            </p>
          </div>
        </div>

        {subscription && (
          <div className="mb-4 px-3 py-2 rounded-lg" style={{ background: "rgba(255,90,79,0.1)", border: "1px solid rgba(255,90,79,0.2)" }}>
            <p className="text-xs" style={{ color: "rgba(250,248,245,0.8)" }}>
              <span className="font-semibold" style={{ color: "#FF746B" }}>{subscription.plan_name}</span>
              {subscription.minutes_remaining != null && (
                <span className="ml-2">· {subscription.minutes_remaining} min remaining</span>
              )}
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => navigate(createPageUrl("StudioWorkspace"))}
            style={{ background: "linear-gradient(135deg, #FF5A4F, #FF806F)", color: "white" }}
          >
            <ArrowRight className="w-4 h-4 mr-2" />
            {subscription ? "Open Arriv Studio" : "Explore Arriv Studio"}
          </Button>
          {onManage && (
            <Button
              onClick={onManage}
              variant="outline"
              className="border-[#FF5A4F]/40 hover:bg-[#FF5A4F]/10"
              style={{ color: "#FAF8F5" }}
            >
              {subscription ? "Manage Subscription" : "See Studio Plans"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
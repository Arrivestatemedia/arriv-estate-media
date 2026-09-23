import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Film, ArrowRight } from "lucide-react";
import { createPageUrl } from "@/utils";

// "TURN YOUR MEDIA INTO MORE" commerce section shown after core Estate Media packages.
// Discovery is allowed before purchase — but the Studio tab only appears after entitlement.
export default function StudioCommerceSection({ onExplore, onSeePlans }) {
  const navigate = useNavigate();

  const handleExplore = () => {
    if (onExplore) return onExplore();
    navigate(createPageUrl("StudioWorkspace"));
  };

  const handleSeePlans = () => {
    if (onSeePlans) return onSeePlans();
    navigate(createPageUrl("StudioWorkspace"));
  };

  return (
    <div className="rounded-lg shadow-lg border-2 overflow-hidden mb-8" style={{ background: "white", borderColor: "rgba(255,90,79,0.2)" }}>
      <div className="p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #FF5A4F, #FF806F)" }}>
            <Film className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold" style={{ color: "#111111" }}>
            TURN YOUR MEDIA INTO MORE
          </h2>
        </div>

        <p className="text-lg mb-2" style={{ color: "rgba(17,17,17,0.7)" }}>
          Your shoot doesn't have to end at delivery.
        </p>
        <p className="text-sm mb-6 max-w-2xl" style={{ color: "rgba(17,17,17,0.6)" }}>
          Use Arriv Studio to turn your listing photos and video into professional property
          promotions, social content, agent marketing, client education, and training.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleExplore}
            style={{ background: "linear-gradient(135deg, #FF5A4F, #FF806F)", color: "white" }}
          >
            Explore Arriv Studio
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <Button
            onClick={handleSeePlans}
            variant="outline"
            className="border-[#FF5A4F]/40 hover:bg-[#FF5A4F]/5"
            style={{ color: "#111111" }}
          >
            See Studio Plans
          </Button>
        </div>
      </div>
    </div>
  );
}
import React from "react";
import { Activity, ArrowRight } from "lucide-react";
import PerformanceDataView from "@/components/hireiq/PerformanceDataView";
import LearningPanel from "@/components/hireiq/LearningPanel";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED_DARK = "rgba(26,26,26,0.6)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

export default function PostHireIntelligenceView() {
  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className="text-center py-4" style={{ animation: "phiRise 0.5s ease-out" }}>
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-3"
          style={{ backgroundColor: "rgba(184,149,106,0.1)", border: "1px solid rgba(184,149,106,0.2)" }}
        >
          <Activity className="w-4 h-4" style={{ color: GOLD }} />
          <span className="text-xs font-medium" style={{ color: GOLD }}>Post-Hire Intelligence</span>
        </div>
        <h1 className="text-3xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Post-Hire Intelligence</h1>
        <p className="text-sm mt-2 max-w-2xl mx-auto" style={{ color: MUTED_DARK }}>
          Track post-hire performance outcomes and correlate hiring predictions with actual results —
          performance data feeds the learning engine on the right.
        </p>
      </div>

      {/* Two-column layout with pulsing connector */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
        {/* Pulsing connector — only on desktop */}
        <div className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: GOLD, animation: "phiPulse 1.5s ease-in-out infinite" }} />
            <ArrowRight className="w-4 h-4" style={{ color: GOLD, animation: "phiPulse 1.5s ease-in-out infinite", animationDelay: "0.2s" }} />
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: GOLD, animation: "phiPulse 1.5s ease-in-out infinite", animationDelay: "0.4s" }} />
          </div>
        </div>

        {/* Left: Performance Data */}
        <div style={{ animation: "phiRise 0.5s ease-out 0.1s both" }}>
          <PerformanceDataView />
        </div>

        {/* Right: Learning Panel */}
        <div style={{ animation: "phiRise 0.5s ease-out 0.2s both" }}>
          <LearningPanel />
        </div>
      </div>

      <style>{`
        @keyframes phiRise {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes phiPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
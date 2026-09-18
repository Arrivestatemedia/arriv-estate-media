import React from "react";
import { Activity, Brain, ArrowRight } from "lucide-react";
import PerformanceDataView from "@/components/hireiq/PerformanceDataView";
import LearningPanel from "@/components/hireiq/LearningPanel";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED_DARK = "rgba(26,26,26,0.6)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const whiteCard = {
  backgroundColor: "#FFFFFF",
  border: "1px solid rgba(184,149,106,0.15)",
  borderRadius: "0.75rem",
};

export default function PostHireIntelligence() {
  return (
    <div className="space-y-6">
      <style>{`
        @keyframes phiPulse {
          0%, 100% { opacity: 0.45; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        .phi-pulse-connector { animation: phiPulse 2.2s ease-in-out infinite; }
        @keyframes phiRise {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .phi-rise { animation: phiRise 0.6s cubic-bezier(0.2, 0.75, 0.25, 1) both; }
        .phi-rise-1 { animation-delay: 0.12s; }
        .phi-rise-2 { animation-delay: 0.24s; }
      `}</style>

      {/* Hero header */}
      <div className="relative overflow-hidden p-6 sm:p-8" style={whiteCard}>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(to bottom right, rgba(184,149,106,0.06), transparent)" }}
        />
        <div className="relative">
          <div className="flex items-center gap-2" style={{ color: GOLD }}>
            <Activity className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Post-Hire Intelligence</span>
          </div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight" style={{ ...SERIF, color: TEXT_DARK }}>
            Connect outcomes. Learn from every hire.
          </h1>
          <p className="mt-2 text-sm max-w-2xl" style={{ color: MUTED_DARK }}>
            Connect the systems that contain actual employee outcomes, then enable learning to correlate
            hiring predictions with post-hire performance — all in one place.
          </p>
        </div>
      </div>

      {/* Two-column layout: sources left, learning right. Stacks on mobile. */}
      <div className="relative grid grid-cols-1 lg:grid-cols-[1.08fr_0.92fr] gap-6">
        {/* Pulsing connector — desktop only */}
        <div className="hidden lg:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <div
            className="relative flex items-center justify-center w-8 h-8 rounded-full"
            style={{ backgroundColor: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}
          >
            <ArrowRight className="w-4 h-4 phi-pulse-connector" style={{ color: GOLD }} />
          </div>
        </div>

        {/* Left column — Performance Data */}
        <div className="min-w-0 p-4 sm:p-5 phi-rise phi-rise-1" style={whiteCard}>
          <div
            className="flex items-center gap-2 pb-3 mb-3"
            style={{ borderBottom: "1px solid rgba(184,149,106,0.15)" }}
          >
            <Activity className="w-5 h-5" style={{ color: GOLD }} />
            <h2 className="text-lg font-semibold" style={{ ...SERIF, color: TEXT_DARK }}>Performance Data</h2>
          </div>
          <PerformanceDataView />
        </div>

        {/* Right column — Learning */}
        <div className="min-w-0 p-4 sm:p-5 phi-rise phi-rise-2" style={whiteCard}>
          <div
            className="flex items-center gap-2 pb-3 mb-3"
            style={{ borderBottom: "1px solid rgba(184,149,106,0.15)" }}
          >
            <Brain className="w-5 h-5" style={{ color: GOLD }} />
            <h2 className="text-lg font-semibold" style={{ ...SERIF, color: TEXT_DARK }}>Learning</h2>
          </div>
          <LearningPanel />
        </div>
      </div>
    </div>
  );
}
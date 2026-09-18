import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Activity, Brain, ArrowRight } from "lucide-react";
import PerformanceDataSourcesPanel from "@/components/posthire/PerformanceDataSourcesPanel";
import LearningPanel from "@/components/hireiq/LearningPanel";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED_DARK = "rgba(26,26,26,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

export default function PostHireIntelligence() {
  const [tenantId, setTenantId] = useState("");
  const [arrivOneConnected, setArrivOneConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const user = await base44.auth.me().catch(() => null);
        const tid = user?.data?.tenant_id || user?.tenant_id || "tnt_estate_media";
        setTenantId(tid);
        const tRes = await base44.entities.ArrivOneTenantConfig.filter({}, "-created_date", 1).catch(() => null);
        const tenants = tRes?.data ?? tRes ?? [];
        setArrivOneConnected(tenants[0]?.arriv_one_sync_mode === "connected");
      } catch (_) {}
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "rgba(184,149,106,0.4)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6">
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
      <div className="relative overflow-hidden rounded-2xl p-6 sm:p-8" style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.2)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(184,149,106,0.06), transparent 60%)" }} />
        <div className="relative">
          <div className="flex items-center gap-2" style={{ color: GOLD }}>
            <Activity className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Post-Hire Intelligence</span>
          </div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight" style={{ ...SERIF, color: CREAM }}>
            Connect outcomes. Learn from every hire.
          </h1>
          <p className="mt-2 text-sm max-w-2xl" style={{ color: "rgba(255,251,245,0.55)" }}>
            Connect the systems that contain actual employee outcomes, then enable learning to correlate
            hiring predictions with post-hire performance — all in one place.
          </p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="relative grid grid-cols-1 lg:grid-cols-[1.08fr_0.92fr] gap-6">
        {/* Pulsing connector — desktop only */}
        <div className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none items-center justify-center w-8 h-8 rounded-full" style={{ backgroundColor: "#FFFBF5", border: "1px solid rgba(184,149,106,0.3)" }}>
          <ArrowRight className="w-4 h-4 phi-pulse-connector" style={{ color: GOLD }} />
        </div>

        {/* Left column — Performance Data Sources */}
        <div className="min-w-0 rounded-2xl p-4 sm:p-5 phi-rise phi-rise-1" style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.2)" }}>
          <div className="flex items-center gap-2 pb-3 mb-3 border-b" style={{ borderColor: "rgba(184,149,106,0.15)" }}>
            <Activity className="w-5 h-5" style={{ color: GOLD }} />
            <h2 className="text-lg font-semibold" style={{ ...SERIF, color: CREAM }}>Performance Data</h2>
          </div>
          <PerformanceDataSourcesPanel tenantId={tenantId} arrivOneConnected={arrivOneConnected} />
        </div>

        {/* Right column — Learning */}
        <div className="min-w-0 rounded-2xl p-4 sm:p-5 phi-rise phi-rise-2" style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.2)" }}>
          <div className="flex items-center gap-2 pb-3 mb-3 border-b" style={{ borderColor: "rgba(184,149,106,0.15)" }}>
            <Brain className="w-5 h-5" style={{ color: GOLD }} />
            <h2 className="text-lg font-semibold" style={{ ...SERIF, color: CREAM }}>Learning</h2>
          </div>
          <LearningPanel tenantId={tenantId} arrivOneConnected={arrivOneConnected} />
        </div>
      </div>
    </div>
  );
}
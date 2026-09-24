import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Film, Clock, BarChart3, Star, Sparkles, ArrowRight, FolderOpen,
} from "lucide-react";
import { getStudioPlan } from "@/lib/arrivStudioConfig";

const STUDIO_FONT = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };
const C = {
  bg: "#0f0f0f", container: "#1a1a1a", border: "#2d2d2d",
  text: "#ffffff", muted: "#a0a0a0", accent: "#FF5A4F", accentBg: "#331b1b",
};

// Studio Dashboard — "Production Workspace" matching canonical Arriv Studio.
// Real-estate adapted: property listing context, estate media asset sources.
export default function StudioDashboard({ entitlement, onStartProject, onNavigate }) {
  const plan = getStudioPlan(entitlement?.plan_id);
  const included = entitlement?.monthly_minutes || 0;
  const used = entitlement?.minutes_used ?? 0;
  const remaining = entitlement?.minutes_remaining ?? 0;
  const activeProjects = entitlement?.active_projects ?? 0;

  const [recentProjects, setRecentProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    // Fetch recent bookings that could serve as Studio project sources
    const clientEmail = localStorage.getItem("user_email") || sessionStorage.getItem("user_email");
    if (!clientEmail) { setLoadingProjects(false); return; }
    base44.entities.Booking.filter({ client_email: clientEmail })
      .then((rows) => {
        setRecentProjects((rows || []).slice(0, 4));
      })
      .catch(() => {})
      .finally(() => setLoadingProjects(false));
  }, []);

  const lifecycleSteps = [
    "Creative Brief",
    "Script & AI Editorial",
    "Brand & Cast",
    "AI Director & Storyboard",
    "Approve & Produce",
    "Audio QC & Review",
    "Distribution",
  ];

  return (
    <div style={{ ...STUDIO_FONT }}>
      {/* Header */}
      <div className="px-8 pt-8 pb-6">
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: C.text }}>
          Production Workspace
        </h1>
        <p className="text-sm mt-2 max-w-2xl" style={{ color: C.muted }}>
          The intelligent real-estate media-production platform. From listing to distribution —
          script, direct, produce, and deliver professional property media.
        </p>
      </div>

      <div className="px-8 pb-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Metric cards row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard icon={Film} label="Active Projects" value={String(activeProjects)} />
            <MetricCard icon={Clock} label="Minutes Used" value={String(used)} sub={`of ${included} included`} />
            <MetricCard icon={BarChart3} label="Minutes Remaining" value={String(remaining)} sub="this month" />
            <MetricCard icon={Star} label="Current Plan" value={plan?.name || "—"} sub={plan ? `$${plan.price}/mo` : ""} />
          </div>

          {/* Start a new production CTA */}
          <div
            className="rounded-xl p-6"
            style={{ background: C.container, border: "1px solid #5c2e2e" }}
          >
            <h2 className="text-lg font-bold mb-2" style={{ color: C.text }}>
              Start a new production
            </h2>
            <p className="text-sm mb-4 max-w-lg" style={{ color: C.muted }}>
              Describe what you want in natural language. Studio handles the brief, script,
              direction, and production — tailored for real-estate marketing.
            </p>
            <button
              onClick={() => onStartProject?.({ mode: "new_production" })}
              className="inline-flex items-center gap-1.5 text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ color: C.accent }}
            >
              Create project <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Recent Projects */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold" style={{ color: C.text }}>Recent Projects</h2>
              <button
                onClick={() => onNavigate?.("projects")}
                className="text-sm font-medium flex items-center gap-1 hover:opacity-70"
                style={{ color: C.accent }}
              >
                View all <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {loadingProjects ? (
              <div className="rounded-xl p-6 text-sm" style={{ background: C.container, border: `1px solid ${C.border}`, color: C.muted }}>
                Loading projects...
              </div>
            ) : recentProjects.length === 0 ? (
              <div className="rounded-xl p-6" style={{ background: C.container, border: `1px solid ${C.border}` }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,90,79,0.1)" }}>
                    <FolderOpen className="w-5 h-5" style={{ color: C.accent }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: C.text }}>No projects yet</p>
                    <p className="text-xs" style={{ color: C.muted }}>Create your first production to get started.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {recentProjects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onStartProject?.({ mode: "from_booking", bookingId: p.id, propertyAddress: p.property_address })}
                    className="rounded-xl p-4 text-left transition-all hover:border-[#FF5A4F]/40"
                    style={{ background: C.container, border: `1px solid ${C.border}` }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#2d2d2d", color: C.muted }}>Brief</span>
                    </div>
                    <p className="text-sm font-medium truncate" style={{ color: C.text }}>
                      {p.property_address || "Property Project"}
                    </p>
                    <p className="text-xs mt-1" style={{ color: C.muted }}>
                      {p.package || "Estate Media"} · {p.status}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar — Production Lifecycle */}
        <div>
          <div className="rounded-xl p-5 sticky top-4" style={{ background: C.container, border: `1px solid ${C.border}` }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: C.text }}>Production Lifecycle</h3>
            <ol className="space-y-3">
              {lifecycleSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{
                      background: i === 0 ? C.accent : "#2d2d2d",
                      color: i === 0 ? "#ffffff" : C.muted,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm pt-0.5" style={{ color: i === 0 ? C.text : C.muted }}>
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-xl p-4" style={{ background: C.container, border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs" style={{ color: C.muted }}>{label}</span>
        <Icon className="w-4 h-4" style={{ color: C.muted }} />
      </div>
      <p className="text-2xl font-bold" style={{ color: C.text }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: C.muted }}>{sub}</p>}
    </div>
  );
}
import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import BriefTab from "@/components/studio/project/BriefTab";
import ScriptTab from "@/components/studio/project/ScriptTab";
import BrandCastTab from "@/components/studio/project/BrandCastTab";
import StoryboardTab from "@/components/studio/project/StoryboardTab";
import ProductionTab from "@/components/studio/project/ProductionTab";

const STUDIO_FONT = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };
const C = {
  bg: "#0f0f0f", container: "#1a1a1a", border: "#2d2d2d",
  text: "#ffffff", muted: "#a0a0a0", accent: "#FF5A4F",
};

const TABS = [
  { id: "brief", label: "Brief" },
  { id: "script", label: "Script" },
  { id: "brand_cast", label: "Brand & Cast" },
  { id: "storyboard", label: "Storyboard" },
  { id: "production", label: "Production" },
  { id: "review", label: "Review" },
  { id: "talent", label: "Talent Packet" },
  { id: "academy", label: "Academy" },
];

// Studio Project Detail — tabbed project view matching canonical Arriv Studio.
// Shows project header with metadata, tab navigation, and tab content.
// Real-estate adapted: project data from the New Production wizard.
export default function StudioProjectDetail({ project, onBack, onLaunchStudio }) {
  const [activeTab, setActiveTab] = useState("brief");

  const projectType = project?.projectType || "Property Listing";
  const format = project?.outputFormat || "16:9";
  const runtime = project?.targetRuntime ? `${project.targetRuntime} min` : "—";
  const source = project?.sourceProduct || "standalone";

  return (
    <div style={{ ...STUDIO_FONT }}>
      {/* Header */}
      <div className="px-8 pt-6 pb-4 border-b" style={{ borderColor: C.border }}>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm mb-3 hover:opacity-70"
          style={{ color: C.muted }}
        >
          <ArrowLeft className="w-4 h-4" /> Projects
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold" style={{ color: C.text }}>
            {project?.projectName || "Untitled Project"}
          </h1>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#2d2d2d", color: C.muted }}>
            Brief
          </span>
        </div>
        <p className="text-sm mt-1" style={{ color: C.muted }}>
          {projectType} · {format} · {runtime} · {source}
        </p>
      </div>

      {/* Tabs */}
      <div className="px-8 border-b" style={{ borderColor: C.border }}>
        <div className="flex gap-6 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="py-3 text-sm font-medium whitespace-nowrap transition-all relative"
              style={{ color: activeTab === tab.id ? C.text : C.muted }}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: C.accent }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-8 py-6">
        {activeTab === "brief" && <BriefTab project={project} />}
        {activeTab === "script" && <ScriptTab project={project} onLaunchStudio={onLaunchStudio} />}
        {activeTab === "brand_cast" && <BrandCastTab project={project} onLaunchStudio={onLaunchStudio} />}
        {activeTab === "storyboard" && <StoryboardTab project={project} onLaunchStudio={onLaunchStudio} />}
        {activeTab === "production" && <ProductionTab project={project} entitlement={{ minutes_remaining: 5, monthly_minutes: 5 }} onLaunchStudio={onLaunchStudio} />}
        {activeTab === "review" && <PlaceholderTab title="Review" description="Review your final production before delivery." />}
        {activeTab === "talent" && <PlaceholderTab title="Talent Packet" description="Presenter and talent resources for this production." />}
        {activeTab === "academy" && <PlaceholderTab title="Academy" description="Learn how to get the most out of Arriv Studio for real estate." />}
      </div>
    </div>
  );
}

function PlaceholderTab({ title, description }) {
  return (
    <div className="rounded-xl p-8 text-center" style={{ background: C.container, border: `1px solid ${C.border}` }}>
      <h2 className="text-lg font-bold mb-2" style={{ color: C.text }}>{title}</h2>
      <p className="text-sm" style={{ color: C.muted }}>{description}</p>
    </div>
  );
}
import React, { useState } from "react";
import { Sparkles, Users, GitBranch, Send, SquareCheckBig, BarChart3, Settings } from "lucide-react";
import RecruitingChat from "./RecruitingChat";
import RecruitingAssistantHome from "./RecruitingAssistantHome";
import ProspectReviewQueue from "./ProspectReviewQueue";
import ProspectProfile from "./ProspectProfile";
import TalentPipelinesView from "./TalentPipelinesView";
import RecruitingAnalytics from "./RecruitingAnalytics";
import RecruitingSettingsView from "./RecruitingSettingsView";
import RecruitingTasksView from "./RecruitingTasksView";

const GOLD = "#B8956A";
const GOLD_DARK = "#A68559";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.6)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

// Matches the central KhethaIQ app's tab structure exactly
const VIEWS = [
  { id: "assistant", label: "Recruiting Assistant", icon: Sparkles },
  { id: "prospects", label: "Prospects", icon: Users },
  { id: "pipelines", label: "Talent Pipelines", icon: GitBranch },
  { id: "outreach", label: "Outreach", icon: Send },
  { id: "tasks", label: "Recruiting Tasks", icon: SquareCheckBig },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function RecruitingPanel() {
  const [view, setView] = useState("assistant");
  const [selectedProspectId, setSelectedProspectId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [defaultZip, setDefaultZip] = useState("");

  const handleSelectProspect = (prospect) => {
    setSelectedProspectId(prospect.id);
    setView("prospect");
  };

  const handleProspectsFound = () => {
    setRefreshKey((k) => k + 1);
    setView("prospects");
  };

  const handleStartSearch = () => {
    setDefaultZip("");
    setView("assistant");
  };

  const renderView = () => {
    if (view === "prospect" && selectedProspectId) {
      return (
        <ProspectProfile
          prospectId={selectedProspectId}
          onBack={() => { setSelectedProspectId(null); setView("prospects"); }}
          onConverted={() => { setSelectedProspectId(null); setView("prospects"); setRefreshKey((k) => k + 1); }}
        />
      );
    }
    switch (view) {
      case "assistant": return <RecruitingAssistantHome onStartSearch={handleStartSearch} />;
      case "outreach": return <RecruitingChat onProspectsFound={handleProspectsFound} defaultZip={defaultZip} />;
      case "prospects": return <ProspectReviewQueue refreshKey={refreshKey} onSelectProspect={handleSelectProspect} />;
      case "pipelines": return <TalentPipelinesView />;
      case "tasks": return <RecruitingTasksView />;
      case "analytics": return <RecruitingAnalytics />;
      case "settings": return <RecruitingSettingsView />;
      default: return <RecruitingAssistantHome onStartSearch={handleStartSearch} />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header - matches central app */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Recruiting</h1>
          <p className="text-sm" style={{ color: MUTED }}>
            Khetha IQ actively researches and recruits talent for your open roles.
          </p>
        </div>
        <button
          onClick={() => { setView("assistant"); setSelectedProspectId(null); }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors w-fit"
          style={{ backgroundColor: GOLD, color: "#1A1A1A" }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = GOLD_DARK}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = GOLD}
        >
          <Sparkles className="w-4 h-4" />
          Ask the Recruiting Assistant
        </button>
      </div>

      {/* Sub-tabs - bottom-border style matching central app */}
      <div className="flex gap-1 overflow-x-auto pb-1 border-b" style={{ borderColor: "rgba(184,149,106,0.15)" }}>
        {VIEWS.map((v) => {
          const Icon = v.icon;
          const active = view === v.id || (view === "prospect" && v.id === "prospects");
          return (
            <button
              key={v.id}
              onClick={() => { setView(v.id); setSelectedProspectId(null); }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors"
              style={{
                borderColor: active ? GOLD : "transparent",
                color: active ? GOLD : MUTED,
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = TEXT_DARK; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = MUTED; }}
            >
              <Icon className="w-4 h-4" />
              {v.label}
            </button>
          );
        })}
      </div>

      {renderView()}
    </div>
  );
}
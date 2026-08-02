import React, { useState } from "react";
import { Sparkles, MessageSquare, Home, Users, Layers, Map, BarChart3, Settings, ListTodo } from "lucide-react";
import RecruitingChat from "./RecruitingChat";
import RecruitingAssistantHome from "./RecruitingAssistantHome";
import ProspectReviewQueue from "./ProspectReviewQueue";
import ProspectProfile from "./ProspectProfile";
import TalentPipelinesView from "./TalentPipelinesView";
import PipelineMapView from "./PipelineMapView";
import RecruitingAnalytics from "./RecruitingAnalytics";
import RecruitingSettingsView from "./RecruitingSettingsView";
import RecruitingTasksView from "./RecruitingTasksView";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const VIEWS = [
  { id: "home", label: "Home", icon: Home },
  { id: "chat", label: "Sourcing Chat", icon: MessageSquare },
  { id: "prospects", label: "Prospects", icon: Users },
  { id: "pipelines", label: "Pipelines", icon: Layers },
  { id: "map", label: "Map", icon: Map },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function RecruitingPanel() {
  const [view, setView] = useState("home");
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

  const handleStartSearch = (job) => {
    setDefaultZip("");
    setView("chat");
  };

  const renderView = () => {
    if (view === "prospect" && selectedProspectId) {
      return <ProspectProfile prospectId={selectedProspectId} onBack={() => { setSelectedProspectId(null); setView("prospects"); }} onConverted={() => { setSelectedProspectId(null); setView("prospects"); setRefreshKey((k) => k + 1); }} />;
    }
    switch (view) {
      case "home": return <RecruitingAssistantHome onStartSearch={handleStartSearch} />;
      case "chat": return <RecruitingChat onProspectsFound={handleProspectsFound} defaultZip={defaultZip} />;
      case "prospects": return <ProspectReviewQueue refreshKey={refreshKey} onSelectProspect={handleSelectProspect} />;
      case "pipelines": return <TalentPipelinesView />;
      case "map": return <PipelineMapView />;
      case "tasks": return <RecruitingTasksView />;
      case "analytics": return <RecruitingAnalytics />;
      case "settings": return <RecruitingSettingsView />;
      default: return <RecruitingAssistantHome onStartSearch={handleStartSearch} />;
    }
  };

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {VIEWS.map((v) => {
          const Icon = v.icon;
          const active = view === v.id || (view === "prospect" && v.id === "prospects");
          return (
            <button key={v.id} onClick={() => { setView(v.id); setSelectedProspectId(null); }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all shrink-0"
              style={{
                backgroundColor: active ? GOLD : "rgba(26,26,26,0.05)",
                color: active ? "#1A1A1A" : MUTED,
                border: active ? "1px solid " + GOLD : "1px solid rgba(184,149,106,0.15)",
              }}>
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
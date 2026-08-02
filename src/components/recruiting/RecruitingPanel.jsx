import React, { useState, useEffect } from "react";
import { Sparkles, Home, Users, Layers, Map, BarChart3, Settings, CheckSquare } from "lucide-react";
import RecruitingChat from "./RecruitingChat";
import RecruitingAssistantHome from "./RecruitingAssistantHome";
import ProspectReviewQueue from "./ProspectReviewQueue";
import ProspectProfile from "./ProspectProfile";
import TalentPipelinesView from "./TalentPipelinesView";
import PipelineMapView from "./PipelineMapView";
import RecruitingAnalytics from "./RecruitingAnalytics";
import RecruitingSettingsView from "./RecruitingSettingsView";
import RecruitingTasksView from "./RecruitingTasksView";

const VIEWS = [
  { id: "chat", label: "AI Search", icon: Sparkles },
  { id: "home", label: "Dashboard", icon: Home },
  { id: "prospects", label: "Prospects", icon: Users },
  { id: "pipelines", label: "Pipelines", icon: Layers },
  { id: "map", label: "Map", icon: Map },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function RecruitingPanel() {
  const [view, setView] = useState("chat");
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedProspectId, setSelectedProspectId] = useState(null);

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-[#FFFBF5]">
      {/* Sidebar */}
      <div className="w-56 shrink-0 bg-[#1A1A1A] flex flex-col">
        <div className="px-4 py-5 border-b border-[#B8956A]/20">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#B8956A]" />
            <span className="font-semibold text-[#FFFBF5]">Recruiting</span>
          </div>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            const active = view === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-[#B8956A] text-[#1A1A1A]"
                    : "text-[#FFFBF5]/70 hover:text-[#FFFBF5] hover:bg-[#FFFBF5]/10"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {v.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {view === "chat" && (
          <RecruitingChat
            selectedJobId={selectedJobId}
            onJobSelect={setSelectedJobId}
            onReviewProspects={() => setView("prospects")}
          />
        )}
        {view === "home" && <RecruitingAssistantHome onNavigate={setView} />}
        {view === "prospects" && (
          <ProspectReviewQueue
            onSelectProspect={(id) => {
              setSelectedProspectId(id);
              setView("prospect_detail");
            }}
          />
        )}
        {view === "prospect_detail" && selectedProspectId && (
          <ProspectProfile
            prospectId={selectedProspectId}
            onBack={() => setView("prospects")}
          />
        )}
        {view === "pipelines" && <TalentPipelinesView />}
        {view === "map" && <PipelineMapView />}
        {view === "analytics" && <RecruitingAnalytics />}
        {view === "tasks" && <RecruitingTasksView />}
        {view === "settings" && <RecruitingSettingsView />}
      </div>
    </div>
  );
}
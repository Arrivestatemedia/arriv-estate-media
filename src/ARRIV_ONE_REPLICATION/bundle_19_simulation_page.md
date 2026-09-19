// FILE: src/pages/TrainingSimulation.jsx
// Copy this entire file into Arriv One at the same path.
// NOTE: This imports modulePracticals.js which is Estate Media specific.
// For Arriv One, either create your own modulePracticals.js or remove the
// "Module Practicals" view (keep only "By Level" and "Manager Review").

import React, { useState, useEffect } from "react";
import { SimulationProvider, useSimulation } from "@/components/simulation/SimulationContext";
import SimulationBanner from "@/components/simulation/SimulationBanner";
import ScenarioRunner from "@/components/simulation/ScenarioRunner";
import ManagerReview from "@/components/simulation/ManagerReview";
import { SIMULATION_LEVELS, getScenariosByLevel, getScenarioById } from "@/lib/simulationScenarios";
import { GraduationCap, ArrowLeft, ClipboardList, Play, BookOpen, Eye, Hand, Users, UserPlus } from "lucide-react";

// For Arriv One: import your own modulePracticals or remove the modules view
// import { MODULE_PRACTICALS, PRACTICAL_TYPES, getModulesWithPracticals } from "@/lib/modulePracticals";

const PRACTICAL_ICONS = { follow_me: Eye, do_it_yourself: Hand, customer_scenario: Users, onboarding_practical: UserPlus, teach_back: GraduationCap };

function SimulationContent() {
  const { currentScenario, currentLevel, startScenario, resetScenario } = useSimulation();
  const [view, setView] = useState("levels");
  const [selectedLevel, setSelectedLevel] = useState("WATCH_IT");
  const [isAdmin, setIsAdmin] = useState(false);
  const [learnerId, setLearnerId] = useState(null);

  useEffect(() => {
    const role = localStorage.getItem("user_role") || sessionStorage.getItem("user_role");
    const salesRole = localStorage.getItem("sales_member_role") || sessionStorage.getItem("sales_member_role");
    const salesId = localStorage.getItem("sales_member_id") || sessionStorage.getItem("sales_member_id");
    setIsAdmin(role === "admin" || salesRole === "admin");
    setLearnerId(salesId);
  }, []);

  if (currentScenario && view !== "manager") {
    return (
      <div>
        <SimulationBanner level={currentLevel} scenarioTitle={currentScenario.title} />
        <div className="max-w-2xl mx-auto px-4 py-3">
          <button onClick={resetScenario} className="flex items-center gap-1.5 text-sm text-[#1A1A1A]/60 hover:text-[#B8956A]">
            <ArrowLeft className="w-4 h-4" /> Back to Scenarios
          </button>
        </div>
        <ScenarioRunner />
      </div>
    );
  }

  if (view === "manager") {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-serif text-[#1A1A1A] flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-[#B8956A]" /> Manager Review
          </h2>
          <button onClick={() => setView("levels")} className="flex items-center gap-1.5 text-sm text-[#1A1A1A]/60 hover:text-[#B8956A]">
            <ArrowLeft className="w-4 h-4" /> Back to Scenarios
          </button>
        </div>
        <ManagerReview learnerId={learnerId} isAdmin={isAdmin} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-serif text-[#1A1A1A] flex items-center gap-2 mb-1">
          <GraduationCap className="w-6 h-6 text-[#B8956A]" /> Training Simulation Lab
        </h1>
        <p className="text-sm text-[#1A1A1A]/60">
          Practice the sales process in a fully simulated environment. No real data is modified — all actions are sandboxed.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setView("levels")} className={`px-4 py-2 rounded-lg text-sm font-medium ${view === "levels" ? "bg-[#1A1A1A] text-[#FFFBF5]" : "bg-white border border-[#B8956A]/20 text-[#1A1A1A] hover:border-[#B8956A]"}`}>
          By Level
        </button>
        {/* Remove this button if you don't have modulePracticals.js */}
        <button onClick={() => setView("modules")} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 ${view === "modules" ? "bg-[#1A1A1A] text-[#FFFBF5]" : "bg-white border border-[#B8956A]/20 text-[#1A1A1A] hover:border-[#B8956A]"}`}>
          <BookOpen className="w-4 h-4" /> Module Practicals
        </button>
        {isAdmin && (
          <button onClick={() => setView("manager")} className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 border border-[#B8956A]/30 text-[#B8956A] hover:bg-[#B8956A]/5">
            <ClipboardList className="w-4 h-4" /> Manager Review
          </button>
        )}
      </div>

      {view === "levels" && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {SIMULATION_LEVELS.map(level => (
              <button key={level.id} onClick={() => setSelectedLevel(level.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${selectedLevel === level.id ? "bg-[#1A1A1A] text-[#FFFBF5]" : "bg-white border border-[#B8956A]/20 text-[#1A1A1A] hover:border-[#B8956A]"}`}>
                {level.label}
              </button>
            ))}
          </div>
          <div className="p-3 rounded-lg bg-[#B8956A]/10 border border-[#B8956A]/20">
            <p className="text-sm text-[#1A1A1A]/70">{SIMULATION_LEVELS.find(l => l.id === selectedLevel)?.description}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {getScenariosByLevel(selectedLevel).map(scenario => (
              <button key={scenario.id} onClick={() => startScenario(scenario.id, scenario.level)}
                className="text-left p-4 rounded-xl border border-[#B8956A]/20 bg-white hover:border-[#B8956A] hover:bg-[#B8956A]/5 transition-all group">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium text-[#1A1A1A]">{scenario.title}</h3>
                  <Play className="w-4 h-4 text-[#B8956A] group-hover:scale-110 transition-transform flex-shrink-0 mt-0.5" />
                </div>
                <p className="text-sm text-[#1A1A1A]/60 mb-3">{scenario.description}</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full font-medium ${scenario.criticality === "critical" ? "bg-red-100 text-red-700" : scenario.criticality === "high" ? "bg-amber-100 text-amber-700" : "bg-[#1A1A1A]/5 text-[#1A1A1A]/60"}`}>{scenario.criticality}</span>
                  <span className="text-[#1A1A1A]/40">{scenario.steps.length} steps</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Remove this block if you don't have modulePracticals.js */}
      {view === "modules" && (
        <div className="p-6 text-center text-[#1A1A1A]/40">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Module Practicals view requires modulePracticals.js. Create your own or remove this view.</p>
        </div>
      )}
    </div>
  );
}

export default function TrainingSimulation() {
  return (
    <SimulationProvider>
      <SimulationContent />
    </SimulationProvider>
  );
}
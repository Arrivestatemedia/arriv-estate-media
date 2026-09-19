import React from "react";
import { CheckCircle2, AlertTriangle, XCircle, RotateCcw, Award, ArrowRight } from "lucide-react";
import { useSimulation } from "./SimulationContext";
import SimUIRenderer from "./SimUIRenderer";

export default function ScenarioRunner() {
  const { currentScenario, currentStep, stepIndex, simState, lastValidation, isComplete, resetScenario, dispatch } = useSimulation();

  if (!currentScenario) return null;

  if (isComplete) {
    const hasFailure = simState?.critical_failure || simState?.boundary_violation;
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className={`p-6 rounded-2xl border text-center ${hasFailure ? "border-red-300 bg-red-50" : "border-emerald-300 bg-emerald-50"}`}>
          {hasFailure ? <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" /> : <Award className="w-12 h-12 text-emerald-600 mx-auto mb-3" />}
          <h3 className="text-xl font-serif text-[#1A1A1A] mb-2">{hasFailure ? "Scenario Failed" : "Scenario Complete!"}</h3>
          <p className="text-sm text-[#1A1A1A]/60 mb-4">
            {hasFailure ? "A critical boundary was violated. Review the training material and try again." : "You've completed all steps in this scenario. Events have been logged for manager review."}
          </p>
          <button onClick={resetScenario} className="px-6 py-2.5 rounded-lg bg-[#B8956A] text-white font-medium hover:bg-[#A68559] transition-colors inline-flex items-center gap-2">
            <RotateCcw className="w-4 h-4" /> Replay Scenario
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">
      {/* Step progress */}
      <div className="flex items-center gap-1.5">
        {currentScenario.steps.map((_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i < stepIndex ? "bg-emerald-400" : i === stepIndex ? "bg-[#B8956A]" : "bg-[#1A1A1A]/10"}`} />
        ))}
      </div>

      {/* Step header */}
      <div>
        <p className="text-xs text-[#B8956A] font-medium uppercase tracking-wide mb-1">
          {currentScenario.title} · Step {stepIndex + 1} of {currentScenario.steps.length}
        </p>
        <h2 className="text-xl font-serif text-[#1A1A1A] mb-1">{currentStep?.title}</h2>
        <p className="text-sm text-[#1A1A1A]/60">{currentStep?.description}</p>
      </div>

      {/* Guidance */}
      <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
        <p className="text-sm text-blue-800">
          <strong>Guidance:</strong> {currentStep?.guidance}
        </p>
      </div>

      {/* UI Renderer */}
      <div className="p-4 rounded-xl border border-[#B8956A]/20 bg-[#FFFBF5]">
        <SimUIRenderer step={currentStep} />
      </div>

      {/* Validation feedback */}
      {lastValidation && (
        <div className={`p-3 rounded-lg flex items-start gap-2 ${
          lastValidation.result === "correct" ? "bg-emerald-50 border border-emerald-200" :
          lastValidation.result === "warning" ? "bg-amber-50 border border-amber-200" :
          lastValidation.result === "critical_failure" ? "bg-red-50 border border-red-200" :
          "bg-orange-50 border border-orange-200"
        }`}>
          {lastValidation.result === "correct" ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" /> :
           lastValidation.result === "critical_failure" ? <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" /> :
           <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />}
          <div>
            <p className="text-sm font-medium text-[#1A1A1A]">
              {lastValidation.result === "correct" ? "Correct!" : lastValidation.result === "critical_failure" ? "Critical Failure" : lastValidation.result === "warning" ? "Warning" : "Try Again"}
            </p>
            <p className="text-sm text-[#1A1A1A]/70">{lastValidation.notes}</p>
          </div>
        </div>
      )}
    </div>
  );
}
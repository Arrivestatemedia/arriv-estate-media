import React from "react";

const STEPS = [
  { num: 1, label: "Intake" },
  { num: 2, label: "Role Profile" },
  { num: 3, label: "Scorecard" },
  { num: 4, label: "Sourcing" },
  { num: 5, label: "Screening" },
  { num: 6, label: "Interview" },
  { num: 7, label: "Evaluation" },
  { num: 8, label: "Decision" },
  { num: 9, label: "Offer" },
  { num: 10, label: "Hired" },
];

export default function WorkflowStepper({ currentStep = 1 }) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex items-start min-w-[680px] px-1">
        {STEPS.map((step, i) => {
          const isComplete = step.num < currentStep;
          const isCurrent = step.num === currentStep;
          return (
            <React.Fragment key={step.num}>
              {i > 0 && (
                <div className="flex-1 h-px mt-3" style={{
                  backgroundColor: isComplete ? "#B8956A" : "rgba(26,26,26,0.1)",
                }} />
              )}
              <div className="flex flex-col items-center" style={{ minWidth: "52px" }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all"
                  style={{
                    backgroundColor: isComplete ? "#B8956A" : isCurrent ? "#FFFBF5" : "transparent",
                    border: `1.5px solid ${isComplete ? "#B8956A" : isCurrent ? "#B8956A" : "rgba(26,26,26,0.15)"}`,
                    color: isComplete ? "#FFFBF5" : isCurrent ? "#B8956A" : "rgba(26,26,26,0.3)",
                    boxShadow: isCurrent ? "0 0 0 3px rgba(184,149,106,0.15)" : "none",
                  }}>
                  {step.num}
                </div>
                <span className="text-[10px] mt-1.5 font-medium whitespace-nowrap" style={{
                  color: isCurrent ? "#B8956A" : isComplete ? "#1A1A1A" : "rgba(26,26,26,0.3)",
                }}>{step.label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
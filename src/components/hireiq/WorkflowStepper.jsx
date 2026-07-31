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
                <div className="flex-1 h-[2px] mt-[15px]" style={{
                  backgroundColor: isComplete ? "#B8956A" : "#1a2021",
                  opacity: isComplete ? 1 : 0.25,
                }} />
              )}
              <div className="flex flex-col items-center" style={{ minWidth: "56px" }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                  style={{
                    backgroundColor: isComplete ? "#B8956A" : isCurrent ? "#f3efe9" : "transparent",
                    border: `2px solid ${isComplete ? "#B8956A" : isCurrent ? "#B8956A" : "#1a2021"}`,
                    color: isComplete ? "#fff" : isCurrent ? "#B8956A" : "#8a9a98",
                  }}>
                  {step.num}
                </div>
                <span className="text-[10px] mt-1.5 font-medium whitespace-nowrap" style={{
                  color: isCurrent ? "#B8956A" : isComplete ? "#2a3536" : "#8a9a98",
                }}>{step.label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
import React from "react";
import { CheckCircle2, XCircle } from "lucide-react";

export default function ReadinessChecklist({ readiness }) {
  if (!readiness) return null;

  const items = [
    { key: "all_modules_passed", label: "All 20 modules (E0–E19) passed" },
    { key: "quiz_average_met", label: "Quiz average ≥ 95%" },
    { key: "critical_questions_all_correct", label: "All critical questions correct (100%)" },
    { key: "final_exam_passed", label: "Final exam passed (≥ 95%)" },
    { key: "roleplay_passed", label: "Role-play passed (≥ 95/100)" },
    { key: "system_crm_passed", label: "CRM/System practical passed (≥ 95/100)" },
    { key: "onboarding_passed", label: "Onboarding practical passed (≥ 95/100)" },
    { key: "teachback_passed", label: "Teach-back practical passed (≥ 95/100)" },
    { key: "no_critical_failures", label: "No unresolved critical failures" },
    { key: "no_remediation_pending", label: "No pending remediation modules" },
  ];

  return (
    <div className="space-y-1.5">
      {items.map(item => {
        const met = readiness[item.key];
        return (
          <div key={item.key} className="flex items-center gap-2 text-sm">
            {met ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
            <span className={met ? "text-[#1A1A1A]" : "text-[#1A1A1A]/60"}>{item.label}</span>
          </div>
        );
      })}
      <div className={`mt-3 p-3 rounded-lg ${readiness.ready_for_authorization ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"}`}>
        <p className={`text-sm font-medium ${readiness.ready_for_authorization ? "text-emerald-700" : "text-amber-700"}`}>
          {readiness.ready_for_authorization
            ? "✓ Ready for manager authorization. Automated scores do NOT authorize — a manager must explicitly authorize."
            : "✗ Not yet ready for authorization. Requirements above must all be met."}
        </p>
      </div>
    </div>
  );
}
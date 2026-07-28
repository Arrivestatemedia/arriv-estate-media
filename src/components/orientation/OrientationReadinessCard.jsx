import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, Circle, Clock } from "lucide-react";

export default function OrientationReadinessCard({ readiness, orientation }) {
  if (!readiness) return null;
  const { percent, completed, missing, blocked, nextAction } = readiness;
  const tone = blocked.length ? "text-red-600" : percent >= 100 ? "text-green-600" : "text-[#B8956A]";

  return (
    <Card className="border-2 border-[#B8956A]/30 bg-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-[#1A1A1A]">
          <Clock className="w-4 h-4 text-[#B8956A]" /> Payroll Readiness
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-2">
          <span className={`text-3xl font-bold ${tone}`}>{percent}%</span>
          <span className="text-xs text-[#1A1A1A]/60 mb-1">ready for payroll</span>
        </div>
        <div className="w-full h-2 rounded-full bg-[#B8956A]/10 overflow-hidden">
          <div className={`h-full ${blocked.length ? "bg-red-500" : percent >= 100 ? "bg-green-500" : "bg-[#B8956A]"}`} style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
        {orientation?.orientation_deadline && (
          <p className="text-xs text-[#1A1A1A]/60">Orientation deadline: <strong>{orientation.orientation_deadline}</strong></p>
        )}
        {orientation?.expected_first_payroll_date && (
          <p className="text-xs text-[#1A1A1A]/60">Expected first eligible pay date: <strong>{orientation.expected_first_payroll_date}</strong></p>
        )}
        <div className="space-y-1">
          {blocked.map((b) => (
            <div key={`b-${b}`} className="flex items-center gap-2 text-xs text-red-600"><AlertTriangle className="w-3.5 h-3.5" /> {b} <span className="text-red-400">(blocks payroll)</span></div>
          ))}
          {missing.map((m) => (
            <div key={`m-${m}`} className="flex items-center gap-2 text-xs text-[#1A1A1A]/60"><Circle className="w-3.5 h-3.5 text-[#B8956A]/50" /> {m}</div>
          ))}
          {completed.map((c) => (
            <div key={`c-${c}`} className="flex items-center gap-2 text-xs text-green-600"><CheckCircle2 className="w-3.5 h-3.5" /> {c}</div>
          ))}
        </div>
        <div className="pt-1 border-t border-[#B8956A]/10">
          <p className="text-xs text-[#1A1A1A]/60">Next action</p>
          <p className="text-sm font-medium text-[#1A1A1A]">{nextAction}</p>
        </div>
      </CardContent>
    </Card>
  );
}
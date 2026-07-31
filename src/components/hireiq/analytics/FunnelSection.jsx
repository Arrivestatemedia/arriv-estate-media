import React from "react";
import { Filter } from "lucide-react";
import { SectionWrapper, CREAM, GOLD, MUTED_LIGHT, SERIF, MONO, card } from "./shared";
import { computeFunnel } from "@/lib/analyticsEngine";

export default function FunnelSection({ data }) {
  const stages = computeFunnel(data);
  const maxCount = Math.max(...stages.map(s => s.count), 1);

  return (
    <SectionWrapper title="Hiring Funnel" icon={Filter}>
      <div className="p-5" style={card}>
        <div className="space-y-1">
          {stages.map((s, i) => {
            const width = maxCount > 0 ? (s.count / maxCount) * 100 : 0;
            return (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium" style={{ color: CREAM }}>{s.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold" style={{ ...MONO, color: GOLD }}>{s.count}</span>
                    {i > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(184,149,106,0.12)", color: MUTED_LIGHT }}>
                        {s.conversion}% conv
                      </span>
                    )}
                    <span className="text-xs" style={{ color: MUTED_LIGHT }}>{s.overallConversion}%</span>
                  </div>
                </div>
                <div className="h-8 rounded-lg overflow-hidden" style={{ backgroundColor: "rgba(255,251,245,0.05)" }}>
                  <div className="h-full rounded-lg flex items-center justify-end pr-3 transition-all"
                    style={{ width: `${Math.max(width, 2)}%`, backgroundColor: s.color, minWidth: s.count > 0 ? "40px" : "0" }}>
                    {s.count > 0 && <span className="text-xs font-bold" style={{ color: "#1A1A1A" }}>{s.count}</span>}
                  </div>
                </div>
                {i < stages.length - 1 && (
                  <div className="flex justify-center py-0.5">
                    <span className="text-xs" style={{ color: GOLD }}>↓</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs mt-3" style={{ color: MUTED_LIGHT }}>
          Conversion % shows rate from previous stage · Overall % shows rate from initial applications
        </p>
      </div>
    </SectionWrapper>
  );
}
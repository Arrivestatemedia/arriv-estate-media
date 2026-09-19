import React from "react";
import { ShieldAlert, Eye } from "lucide-react";

export default function SimulationBanner({ level, scenarioTitle }) {
  return (
    <div className="sticky top-0 z-[60] bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          <div>
            <span className="font-bold text-sm tracking-wide">TRAINING MODE</span>
            {scenarioTitle && <span className="text-xs ml-2 opacity-90">— {scenarioTitle}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {level && <span className="bg-white/20 px-2 py-0.5 rounded-full font-medium">{level.replace("_", " ")}</span>}
          <span className="hidden sm:flex items-center gap-1 opacity-90">
            <Eye className="w-3 h-3" /> Simulated — no real data is modified
          </span>
        </div>
      </div>
    </div>
  );
}
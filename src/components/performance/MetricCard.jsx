import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default function MetricCard({ label, value, target, format, icon: Icon, color = "#B8956A" }) {
  const displayValue = format ? format(value) : value;
  const displayTarget = target != null ? (format ? format(target) : target) : null;
  const pct = target != null && target > 0 ? Math.min(100, Math.round((value / target) * 100)) : null;

  return (
    <Card style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.2)' }}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {Icon && (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
            )}
            <span className="text-xs font-medium" style={{ color: 'rgba(26,26,26,0.6)' }}>{label}</span>
          </div>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>{displayValue}</span>
          {displayTarget && (
            <span className="text-sm" style={{ color: 'rgba(26,26,26,0.4)' }}>/ {displayTarget}</span>
          )}
        </div>
        {pct != null && (
          <div className="mt-2">
            <Progress value={pct} className="h-2" style={{ backgroundColor: 'rgba(184,149,106,0.1)' }} />
            <p className="text-xs mt-1" style={{ color: pct >= 100 ? '#16a34a' : 'rgba(26,26,26,0.4)' }}>
              {pct >= 100 ? '✓ Goal met' : `${pct}% of goal`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
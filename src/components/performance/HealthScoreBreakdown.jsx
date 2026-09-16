import React from "react";
import { TrendingUp } from "lucide-react";

/**
 * HealthScoreBreakdown
 *
 * Renders the deterministic Sales Health Score with all 5 components,
 * sub-item progress bars, coaching hints, and ramp stage context.
 * Uses amber/gold/orange/red tones — never green (per brand preference).
 */
function scoreColor(pct) {
  if (pct >= 80) return '#B8956A'; // gold (strong)
  if (pct >= 60) return '#D4A574'; // light gold
  if (pct >= 40) return '#E8A33D'; // amber
  if (pct >= 20) return '#F59E0B'; // orange
  return '#EF4444'; // red
}

function scoreLabel(pct) {
  if (pct >= 80) return 'Strong';
  if (pct >= 60) return 'On Track';
  if (pct >= 40) return 'Needs Work';
  if (pct >= 20) return 'Behind';
  return 'Critical';
}

export default function HealthScoreBreakdown({ healthScore, rampStage, workModeLabel: modeLabel }) {
  if (!healthScore) return null;

  const { total, components, ramp_note, coaching_hints, summary } = healthScore;
  const totalColor = scoreColor(total);

  return (
    <div className="space-y-4">
      {/* Total Score + Summary */}
      <div className="flex items-center gap-4 pb-4 border-b" style={{ borderColor: 'rgba(184,149,106,0.15)' }}>
        <div className="flex-shrink-0">
          <div className="relative w-20 h-20">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(184,149,106,0.12)" strokeWidth="6" />
              <circle
                cx="40" cy="40" r="34" fill="none" stroke={totalColor} strokeWidth="6"
                strokeDasharray={2 * Math.PI * 34}
                strokeDashoffset={2 * Math.PI * 34 - (total / 100) * 2 * Math.PI * 34}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold" style={{ color: totalColor }}>{total}</span>
              <span className="text-[10px]" style={{ color: 'rgba(26,26,26,0.4)' }}>/ 100</span>
            </div>
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold" style={{ color: totalColor }}>{scoreLabel(total)}</span>
            {modeLabel && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(184,149,106,0.1)', color: '#B8956A' }}>
                {modeLabel}
              </span>
            )}
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(26,26,26,0.6)' }}>{summary}</p>
        </div>
      </div>

      {/* Ramp Note */}
      {ramp_note && (
        <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'rgba(184,149,106,0.06)' }}>
          <p className="text-xs" style={{ color: 'rgba(26,26,26,0.6)' }}>
            <span className="font-semibold" style={{ color: '#B8956A' }}>Ramp Stage: </span>
            {ramp_note}
          </p>
        </div>
      )}

      {/* Component Breakdown */}
      <div className="space-y-3">
        {components.map((comp) => {
          const pct = comp.max > 0 ? Math.round((comp.score / comp.max) * 100) : 0;
          const color = scoreColor(pct);
          return (
            <div key={comp.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium" style={{ color: '#1A1A1A' }}>{comp.label}</span>
                <span className="text-sm font-bold" style={{ color }}>
                  {comp.score}/{comp.max}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full overflow-hidden mb-1.5" style={{ backgroundColor: 'rgba(184,149,106,0.12)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
              <p className="text-xs mb-2" style={{ color: 'rgba(26,26,26,0.5)' }}>{comp.detail}</p>
              {/* Sub-items */}
              {comp.sub_items && comp.sub_items.length > 0 && (
                <div className="grid grid-cols-3 gap-2 pl-2">
                  {comp.sub_items.map((item, i) => (
                    <div key={i} className="text-center">
                      <p className="text-[10px] font-medium" style={{ color: 'rgba(26,26,26,0.4)' }}>{item.label}</p>
                      <p className="text-xs font-bold" style={{ color: '#1A1A1A' }}>
                        {item.value}<span className="font-normal" style={{ color: 'rgba(26,26,26,0.3)' }}>/{item.target}</span>
                      </p>
                      <p className="text-[10px]" style={{ color: scoreColor(item.pct) }}>{item.pct}%</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Coaching Hints */}
      {coaching_hints && coaching_hints.length > 0 && (
        <div className="pt-3 border-t" style={{ borderColor: 'rgba(184,149,106,0.15)' }}>
          <p className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: '#B8956A' }}>
            <TrendingUp className="w-3.5 h-3.5" /> Coaching Focus
          </p>
          <ul className="space-y-1.5">
            {coaching_hints.map((hint, i) => (
              <li key={i} className="text-xs flex items-start gap-2" style={{ color: 'rgba(26,26,26,0.7)' }}>
                <span style={{ color: '#B8956A' }}>→</span> {hint}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
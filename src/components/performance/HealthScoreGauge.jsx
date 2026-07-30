import React from "react";

export default function HealthScoreGauge({ score, summary, loading }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#f59e0b' : score >= 40 ? '#f97316' : '#ef4444';

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(184,149,106,0.15)" strokeWidth="10" />
          <circle
            cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {loading ? (
            <div className="w-6 h-6 border-2 border-[#B8956A] border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span className="text-3xl font-bold" style={{ color }}>{score}</span>
              <span className="text-xs" style={{ color: 'rgba(26,26,26,0.4)' }}>/ 100</span>
            </>
          )}
        </div>
      </div>
      {summary && !loading && (
        <p className="text-sm text-center mt-3 max-w-xs leading-relaxed" style={{ color: 'rgba(26,26,26,0.7)' }}>
          {summary}
        </p>
      )}
    </div>
  );
}
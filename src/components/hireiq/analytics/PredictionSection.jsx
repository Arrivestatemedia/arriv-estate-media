import React from "react";
import { Target } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { SectionWrapper, KpiCard, EmptyState, ChartTooltip, CREAM, GOLD, MUTED_LIGHT, card, SERIF, MONO, CHART_COLORS } from "./shared";
import { computePredictionAccuracy } from "@/lib/analyticsEngine";

export default function PredictionSection({ data }) {
  const p = computePredictionAccuracy(data);

  if (!p) {
    return (
      <SectionWrapper title="AI Prediction Accuracy" icon={Target}>
        <EmptyState message="Not enough data — need at least 3 hired candidates with both AI evaluations and performance records to measure prediction accuracy." />
      </SectionWrapper>
    );
  }

  const summaryKpis = [
    { label: "Avg Predicted Score", value: `${p.avgPredicted}/100` },
    { label: "Avg Actual Performance", value: `${p.avgActual}/100` },
    { label: "Prediction Accuracy", value: `${p.accuracy}%`, accent: p.accuracy >= 75 ? GOLD : "#FB923C" },
    { label: "Overestimated", value: p.overestimated, accent: "#FCA5A5" },
    { label: "Underestimated", value: p.underestimated, accent: "#FCD34D" },
    { label: "Accurate Predictions", value: p.accurate, accent: GOLD },
  ];

  const calData = p.calibration.map(c => ({ level: c.level, accuracy: c.accuracy, count: c.count }));

  return (
    <SectionWrapper title="AI Prediction Accuracy" icon={Target}>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {summaryKpis.map((k, i) => <KpiCard key={i} {...k} />)}
      </div>
      <div className="p-5" style={card}>
        <h3 className="text-sm font-bold mb-3" style={{ ...SERIF, color: CREAM }}>Calibration by Confidence Level</h3>
        {calData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={calData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(184,149,106,0.1)" />
              <XAxis dataKey="level" tick={{ fill: CREAM, fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fill: MUTED_LIGHT, fontSize: 11 }} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(184,149,106,0.05)" }} />
              <Bar dataKey="accuracy" name="Accuracy %" radius={[6, 6, 0, 0]}>
                {calData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-center py-6" style={{ color: MUTED_LIGHT }}>No confidence level data available</p>
        )}
        {p.calibration.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
            {p.calibration.map((c, i) => (
              <div key={i} className="p-2 rounded text-center" style={{ backgroundColor: "rgba(255,251,245,0.05)" }}>
                <p className="text-xs" style={{ color: MUTED_LIGHT }}>{c.level}</p>
                <p className="text-sm font-bold" style={{ color: GOLD }}>{c.accuracy}%</p>
                <p className="text-xs" style={{ color: MUTED_LIGHT }}>n={c.count}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  );
}
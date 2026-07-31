import React from "react";
import { Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { SectionWrapper, EmptyState, ChartTooltip, CREAM, GOLD, MUTED_LIGHT, card, SERIF, CHART_COLORS } from "./shared";
import { computeSourceEffectiveness } from "@/lib/analyticsEngine";

export default function SourceSection({ data }) {
  const sources = computeSourceEffectiveness(data);

  if (sources.length === 0) {
    return (
      <SectionWrapper title="Source Effectiveness" icon={Users}>
        <EmptyState message="No source data available yet. Add candidates with a source field to see where your hires come from." />
      </SectionWrapper>
    );
  }

  const chartData = sources.map(s => ({ name: s.label, Applications: s.applications, Interviews: s.interviews, Offers: s.offers, Hires: s.hires }));

  return (
    <SectionWrapper title="Source Effectiveness" icon={Users}>
      <div className="p-5 mb-4" style={card}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 30, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(184,149,106,0.1)" />
            <XAxis dataKey="name" tick={{ fill: CREAM, fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
            <YAxis tick={{ fill: MUTED_LIGHT, fontSize: 11 }} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(184,149,106,0.05)" }} />
            <Legend wrapperStyle={{ fontSize: 12, color: CREAM }} />
            <Bar dataKey="Applications" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Interviews" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Offers" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Hires" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={card}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(184,149,106,0.15)" }}>
              {["Source", "Applications", "Interviews", "Offers", "Hires", "Avg Performance", "Avg AI Score"].map(h => (
                <th key={h} className="py-3 px-3 text-left text-xs font-semibold uppercase" style={{ color: MUTED_LIGHT }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.map((s, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(184,149,106,0.06)" }}>
                <td className="py-2.5 px-3 font-medium" style={{ color: CREAM }}>{s.label}</td>
                <td className="py-2.5 px-3" style={{ color: CREAM }}>{s.applications}</td>
                <td className="py-2.5 px-3" style={{ color: CREAM }}>{s.interviews}</td>
                <td className="py-2.5 px-3" style={{ color: CREAM }}>{s.offers}</td>
                <td className="py-2.5 px-3" style={{ color: GOLD, fontWeight: 600 }}>{s.hires}</td>
                <td className="py-2.5 px-3" style={{ color: CREAM }}>{s.avgPerf}</td>
                <td className="py-2.5 px-3" style={{ color: CREAM }}>{s.avgAIScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionWrapper>
  );
}
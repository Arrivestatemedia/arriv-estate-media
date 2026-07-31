import React from "react";
import { Clock } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { SectionWrapper, KpiCard, EmptyState, ChartTooltip, CREAM, GOLD, MUTED_LIGHT, card, SERIF, MONO, CHART_COLORS } from "./shared";
import { computeRetention } from "@/lib/analyticsEngine";

export default function RetentionSection({ data }) {
  const r = computeRetention(data);

  if (!r) {
    return (
      <SectionWrapper title="Retention" icon={Clock}>
        <EmptyState message="Not enough data — need at least 3 hired candidates with performance records containing retention data to calculate retention metrics." />
      </SectionWrapper>
    );
  }

  const kpis = [
    { label: "30-Day Retention", value: `${r.retention30}%`, accent: r.retention30 >= 80 ? GOLD : "#FB923C" },
    { label: "90-Day Retention", value: `${r.retention90}%`, accent: r.retention90 >= 70 ? GOLD : "#FB923C" },
    { label: "6-Month Retention", value: `${r.retention6mo}%` },
    { label: "1-Year Retention", value: `${r.retention1yr}%` },
    { label: "Average Retention", value: `${r.avgRetention}mo`, sub: `across ${r.total} employees` },
  ];

  const pieData = [
    { name: "Retained 1yr+", value: r.retention1yr },
    { name: "6mo–1yr", value: r.retention6mo - r.retention1yr },
    { name: "3–6mo", value: r.retention90 - r.retention6mo },
    { name: "1–3mo", value: r.retention30 - r.retention90 },
    { name: "<30 days", value: 100 - r.retention30 },
  ].filter(d => d.value > 0);

  return (
    <SectionWrapper title="Retention" icon={Clock}>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {kpis.map((k, i) => <KpiCard key={i} {...k} />)}
      </div>
      <div className="p-5" style={card}>
        <h3 className="text-sm font-bold mb-3" style={{ ...SERIF, color: CREAM }}>Retention Distribution</h3>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2}>
              {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, color: CREAM }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </SectionWrapper>
  );
}
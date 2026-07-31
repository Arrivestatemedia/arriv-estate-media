import React from "react";
import { BarChart3 } from "lucide-react";
import { SectionWrapper, KpiCard, card, CREAM, GOLD, MUTED_LIGHT, SERIF, MONO } from "./shared";
import { computeOverview } from "@/lib/analyticsEngine";

export default function OverviewSection({ data }) {
  const o = computeOverview(data);
  const kpis = [
    { label: "Open Jobs", value: o.openJobs },
    { label: "Total Candidates", value: o.totalCandidates },
    { label: "In Interview", value: o.inInterview },
    { label: "Offers Extended", value: o.offersExtended },
    { label: "Hires", value: o.hires },
    { label: "Offer Acceptance Rate", value: `${o.offerAcceptanceRate}%`, accent: o.offerAcceptanceRate >= 50 ? GOLD : "#FB923C" },
    { label: "Avg Time to Fill", value: `${o.timeToFill}d`, sub: "days from job posted to hire" },
    { label: "Application → Interview", value: `${o.appToInterview}d`, sub: "avg days" },
    { label: "Interview → Offer", value: `${o.interviewToOffer}d`, sub: "avg days" },
  ];

  return (
    <SectionWrapper title="Hiring Overview" icon={BarChart3}>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((kpi, i) => (
          <KpiCard key={i} label={kpi.label} value={kpi.value} sub={kpi.sub} accent={kpi.accent} />
        ))}
      </div>
    </SectionWrapper>
  );
}
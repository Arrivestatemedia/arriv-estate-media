import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { loadAnalyticsData } from "@/lib/analyticsEngine";
import { CREAM, GOLD, MUTED_DARK, MUTED_LIGHT, SERIF } from "./shared";
import OverviewSection from "./OverviewSection";
import FunnelSection from "./FunnelSection";
import PredictionSection from "./PredictionSection";
import QuestionSection from "./QuestionSection";
import SourceSection from "./SourceSection";
import RetentionSection from "./RetentionSection";
import LearningSection from "./LearningSection";
import AskYouHireIQSection from "./AskYouHireIQSection";
import AnalyticsExport from "./AnalyticsExport";

export default function AnalyticsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalyticsData()
      .then(d => setData(d))
      .catch(() => setData({ jobs: [], candidates: [], interviews: [], performances: [] }))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
        <span className="ml-3 text-sm" style={{ color: MUTED_DARK }}>Loading analytics...</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm" style={{ color: MUTED_DARK }}>
          Hiring effectiveness, AI prediction accuracy, and performance insights
        </p>
        <AnalyticsExport data={data} />
      </div>
      <OverviewSection data={data} />
      <FunnelSection data={data} />
      <PredictionSection data={data} />
      <QuestionSection data={data} />
      <SourceSection data={data} />
      <RetentionSection data={data} />
      <LearningSection data={data} />
      <AskYouHireIQSection data={data} />
    </div>
  );
}
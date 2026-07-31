import React, { useState, useEffect } from "react";
import { Brain, Sparkles, TrendingUp, AlertTriangle, Lightbulb, BarChart3 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import { SectionWrapper, EmptyState, CREAM, GOLD, GOLD_DARK, MUTED_LIGHT, card, SERIF } from "./shared";
import { generateLearningInsights } from "@/lib/hireiq";

function InsightSection({ title, items, icon: Icon, color }) {
  if (!items?.length) return null;
  return (
    <div className="p-4" style={card}>
      <p className="text-sm font-bold mb-2 flex items-center gap-1.5" style={{ ...SERIF, color }}>
        <Icon className="w-4 h-4" /> {title}
      </p>
      <ul className="text-sm space-y-1 ml-5" style={{ color: CREAM }}>
        {items.map((item, i) => <li key={i} className="list-disc">{item}</li>)}
      </ul>
    </div>
  );
}

export default function LearningSection({ data }) {
  const [insights, setInsights] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    base44.entities.AppSetting.filter({ key: "hireiq_learning_enabled" }, null, 1)
      .then(res => {
        const s = res?.data ?? res;
        if (Array.isArray(s) && s.length > 0) setEnabled(s[0].value === "true");
      }).catch(() => {});
  }, []);

  const toggleEnabled = async () => {
    const newVal = !enabled;
    setEnabled(newVal);
    try {
      const res = await base44.entities.AppSetting.filter({ key: "hireiq_learning_enabled" }, null, 1);
      const existing = res?.data ?? res;
      if (Array.isArray(existing) && existing.length > 0) {
        await base44.entities.AppSetting.update(existing[0].id, { value: String(newVal) });
      } else {
        await base44.entities.AppSetting.create({ key: "hireiq_learning_enabled", value: String(newVal) });
      }
    } catch (_) {}
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const hiredCandidates = data.candidates.filter(c => data.performances.some(p => p.candidate_id === c.id));
      const result = await generateLearningInsights(data.performances, hiredCandidates, data.jobs);
      setInsights(result);
    } catch (_) {}
    setAnalyzing(false);
  };

  const hasEnoughData = data.performances.length >= 3;

  return (
    <SectionWrapper title="Learning Insights" icon={Brain}
      action={
        <div className="flex items-center gap-3">
          <button onClick={toggleEnabled} className="relative w-12 h-6 rounded-full transition-colors"
            style={{ backgroundColor: enabled ? GOLD : "rgba(26,26,26,0.2)" }}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${enabled ? "translate-x-6" : ""}`} />
          </button>
          <span className="text-xs" style={{ color: MUTED_LIGHT }}>{enabled ? "Enabled" : "Disabled"}</span>
        </div>
      }
    >
      {!enabled ? (
        <EmptyState message="Enable the Learning System to track post-hire performance and correlate hiring predictions with actual outcomes." />
      ) : !hasEnoughData ? (
        <EmptyState message={`At least 3 performance records are needed to generate insights. Currently have ${data.performances.length}.`} />
      ) : (
        <>
          <button onClick={handleAnalyze} disabled={analyzing}
            className="mb-4 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            style={{ backgroundColor: GOLD, color: "#1A1A1A", border: "none", fontWeight: 600 }}>
            {analyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing patterns...</> : <><Sparkles className="w-4 h-4" /> Generate Learning Insights</>}
          </button>
          {analyzing && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
              <span className="ml-2 text-sm" style={{ color: MUTED_LIGHT }}>AI is correlating hiring predictions with performance data...</span>
            </div>
          )}
          {insights && !analyzing && (
            <div className="space-y-4">
              {insights.data_sufficiency && (
                <div className="p-3 rounded-lg" style={{ backgroundColor: "rgba(184,149,106,0.1)", border: "1px solid rgba(184,149,106,0.2)" }}>
                  <p className="text-sm font-semibold" style={{ color: GOLD }}>Data Assessment</p>
                  <p className="text-sm mt-1" style={{ color: CREAM }}>{insights.data_sufficiency}</p>
                </div>
              )}
              {insights.summary && (
                <div className="p-3 rounded-lg" style={{ backgroundColor: "rgba(26,26,26,0.05)", border: "1px solid rgba(184,149,106,0.12)" }}>
                  <p className="text-sm font-semibold mb-1" style={{ color: CREAM }}>Summary</p>
                  <p className="text-sm" style={{ color: CREAM }}>{insights.summary}</p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InsightSection title="Top Success Predictors" items={insights.top_success_predictors} icon={TrendingUp} color={GOLD} />
                <InsightSection title="Top Risk Indicators" items={insights.top_risk_indicators} icon={AlertTriangle} color="#FCA5A5" />
                <InsightSection title="Competency Insights" items={insights.competency_insights} icon={Brain} color={CREAM} />
                <InsightSection title="Resume Patterns" items={insights.resume_patterns} icon={BarChart3} color="rgba(255,251,245,0.6)" />
                <InsightSection title="Interview Patterns" items={insights.interview_patterns} icon={Brain} color={GOLD_DARK} />
                <InsightSection title="Recommendations" items={insights.recommendations} icon={Lightbulb} color={GOLD} />
              </div>
            </div>
          )}
        </>
      )}
    </SectionWrapper>
  );
}
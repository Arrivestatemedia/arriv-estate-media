import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Brain, Sparkles, TrendingUp, AlertTriangle, Lightbulb, BarChart3 } from "lucide-react";
import { generateLearningInsights } from "@/lib/hireiq";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const GOLD_DARK = "#A68559";
const TEXT_DARK = "#1A1A1A";
const MUTED_DARK = "rgba(26,26,26,0.45)";
const MUTED_LIGHT = "rgba(255,251,245,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };
const MONO = { fontFamily: "'SF Mono', 'Monaco', 'Menlo', monospace" };

const card = {
  backgroundColor: "rgba(26,26,26,0.85)",
  border: "1px solid rgba(184,149,106,0.2)",
  borderRadius: "14px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
};

export default function LearningPanel() {
  const [performances, setPerformances] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [enabled, setEnabled] = useState(false);

  const loadData = async () => {
    try {
      const [perfsRes, candsRes, allJobsRes] = await Promise.all([
        base44.entities.HirePerformance.list("-created_date", 200).catch(() => null),
        base44.entities.HireCandidate.list("-created_date", 200).catch(() => null),
        base44.entities.HireJob.list("-created_date", 100).catch(() => null),
      ]);
      const perfs = perfsRes?.data ?? perfsRes;
      const cands = candsRes?.data ?? candsRes;
      const allJobs = allJobsRes?.data ?? allJobsRes;
      setPerformances(Array.isArray(perfs) ? perfs : []);
      setCandidates(Array.isArray(cands) ? cands : []);
      setJobs(Array.isArray(allJobs) ? allJobs : []);

      const settingRes = await base44.entities.AppSetting.filter({ key: "hireiq_learning_enabled" }, null, 1).catch(() => null);
      const setting = settingRes?.data ?? settingRes;
      if (Array.isArray(setting) && setting.length > 0) setEnabled(setting[0].value === "true");
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const toggleEnabled = async () => {
    const newVal = !enabled;
    setEnabled(newVal);
    try {
      const existingRes = await base44.entities.AppSetting.filter({ key: "hireiq_learning_enabled" }, null, 1);
      const existing = existingRes?.data ?? existingRes;
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
      const hiredCandidates = candidates.filter(c => performances.some(p => p.candidate_id === c.id));
      const result = await generateLearningInsights(performances, hiredCandidates, jobs);
      setInsights(result);
    } catch (_) {}
    setAnalyzing(false);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: MUTED_DARK }} /></div>;

  const hasEnoughData = performances.length >= 3;
  const hiredCount = candidates.filter(c => performances.some(p => p.candidate_id === c.id)).length;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Toggle card */}
      <div className="p-5 mb-5" style={card}>
        <div className="flex items-center justify-between">
          <div className="flex-1 pr-4">
            <p className="font-bold mb-1" style={{ ...SERIF, color: CREAM }}>Learning System</p>
            <p className="text-sm" style={{ color: MUTED_LIGHT }}>Enable to track post-hire performance and correlate hiring predictions with actual outcomes.</p>
          </div>
          <button onClick={toggleEnabled} className="relative w-12 h-6 rounded-full transition-colors flex-shrink-0" style={{ backgroundColor: enabled ? GOLD : "rgba(255,251,245,0.15)" }}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${enabled ? "translate-x-6" : ""}`} />
          </button>
        </div>
      </div>

      {!enabled ? (
        <div className="p-10 text-center" style={card}>
          <Brain className="w-12 h-12 mx-auto mb-4" style={{ color: "rgba(184,149,106,0.4)" }} />
          <p style={{ color: CREAM }}>Enable the Learning System to start tracking performance and generating AI insights.</p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-5">
            {[
              { val: performances.length, label: "Performance Records" },
              { val: hiredCount, label: "Hired Tracked" },
              { val: jobs.length, label: "Jobs" },
            ].map((stat, i) => (
              <div key={i} className="p-4 text-center" style={card}>
                <p className="text-3xl font-bold" style={{ ...SERIF, ...MONO, color: GOLD }}>{stat.val}</p>
                <p className="text-xs mt-1" style={{ color: MUTED_LIGHT }}>{stat.label}</p>
              </div>
            ))}
          </div>

          {!hasEnoughData ? (
            <div className="p-8 text-center" style={card}>
              <BarChart3 className="w-12 h-12 mx-auto mb-4" style={{ color: "rgba(184,149,106,0.4)" }} />
              <p className="font-medium" style={{ color: CREAM }}>Not enough data yet</p>
              <p className="text-sm mt-1" style={{ color: MUTED_LIGHT }}>At least 3 performance records are needed to generate meaningful learning insights. Currently have {performances.length}.</p>
              <p className="text-sm mt-2" style={{ color: MUTED_LIGHT }}>Record performance for hired candidates from their candidate profile.</p>
            </div>
          ) : (
            <>
              <Button onClick={handleAnalyze} disabled={analyzing} className="mb-4" style={{ backgroundColor: GOLD, color: "#0A0A0A", border: "none", fontWeight: 600 }}>
                {analyzing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing patterns...</> : <><Sparkles className="w-4 h-4 mr-2" /> Generate Learning Insights</>}
              </Button>

              {analyzing && (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} /><span className="ml-2" style={{ color: MUTED_LIGHT }}>AI is correlating hiring predictions with performance data...</span></div>
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
                    <div className="p-3 rounded-lg" style={{ backgroundColor: "rgba(255,251,245,0.04)", border: "1px solid rgba(184,149,106,0.12)" }}>
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
        </>
      )}
    </div>
  );
}

function InsightSection({ title, items, icon, color }) {
  if (!items || items.length === 0) return null;
  const Icon = icon;
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
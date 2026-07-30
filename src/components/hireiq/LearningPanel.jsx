import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Brain, Sparkles, TrendingUp, AlertTriangle, Lightbulb, BarChart3 } from "lucide-react";
import { generateLearningInsights } from "@/lib/hireiq";

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

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;

  const hasEnoughData = performances.length >= 3;
  const hiredCount = candidates.filter(c => performances.some(p => p.candidate_id === c.id)).length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-lg bg-[#3b82f6] flex items-center justify-center">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#1f2937]">HireIQ Learning</h1>
          <p className="text-sm text-[#6b7280]">AI-powered analysis of hiring prediction accuracy</p>
        </div>
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex-1 pr-4">
            <p className="font-semibold text-[#1f2937] mb-1">Learning System</p>
            <p className="text-sm text-[#6b7280]">Enable to track post-hire performance and correlate hiring predictions with actual outcomes.</p>
          </div>
          <button onClick={toggleEnabled} className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${enabled ? "bg-[#3b82f6]" : "bg-gray-300"}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${enabled ? "translate-x-6" : ""}`} />
          </button>
        </div>
      </div>

      {!enabled ? (
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-8 text-center">
          <Brain className="w-12 h-12 text-[#93c5fd] mx-auto mb-4" />
          <p className="text-[#1f2937]">Enable the Learning System to start tracking performance and generating AI insights.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-[#3b82f6]">{performances.length}</p>
              <p className="text-xs text-[#6b7280]">Performance Records</p>
            </div>
            <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-[#3b82f6]">{hiredCount}</p>
              <p className="text-xs text-[#6b7280]">Hired Tracked</p>
            </div>
            <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-[#3b82f6]">{jobs.length}</p>
              <p className="text-xs text-[#6b7280]">Jobs</p>
            </div>
          </div>

          {!hasEnoughData ? (
            <div className="bg-white border border-[#e5e7eb] rounded-xl p-8 text-center">
              <BarChart3 className="w-12 h-12 text-[#93c5fd] mx-auto mb-4" />
              <p className="text-[#1f2937] font-medium">Not enough data yet</p>
              <p className="text-sm text-[#6b7280] mt-1">At least 3 performance records are needed to generate meaningful learning insights. Currently have {performances.length}.</p>
              <p className="text-sm text-[#6b7280] mt-2">Record performance for hired candidates from their candidate profile.</p>
            </div>
          ) : (
            <>
              <Button onClick={handleAnalyze} disabled={analyzing} className="mb-4 bg-[#1a1a1a] hover:bg-[#1a1a1a]/90 text-white">
                {analyzing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing patterns...</> : <><Sparkles className="w-4 h-4 mr-2" /> Generate Learning Insights</>}
              </Button>

              {analyzing && (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-[#3b82f6]" /><span className="ml-2 text-[#6b7280]">AI is correlating hiring predictions with performance data...</span></div>
              )}

              {insights && !analyzing && (
                <div className="space-y-4">
                  {insights.data_sufficiency && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm font-semibold text-blue-700">Data Assessment</p>
                      <p className="text-sm text-blue-600 mt-1">{insights.data_sufficiency}</p>
                    </div>
                  )}
                  {insights.summary && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-sm font-semibold mb-1">Summary</p>
                      <p className="text-sm text-gray-700">{insights.summary}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InsightSection title="Top Success Predictors" items={insights.top_success_predictors} icon={TrendingUp} color="#16a34a" />
                    <InsightSection title="Top Risk Indicators" items={insights.top_risk_indicators} icon={AlertTriangle} color="#dc2626" />
                    <InsightSection title="Competency Insights" items={insights.competency_insights} icon={Brain} color="#2563eb" />
                    <InsightSection title="Resume Patterns" items={insights.resume_patterns} icon={BarChart3} color="#7c3aed" />
                    <InsightSection title="Interview Patterns" items={insights.interview_patterns} icon={Brain} color="#0891b2" />
                    <InsightSection title="Recommendations" items={insights.recommendations} icon={Lightbulb} color="#3b82f6" />
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
    <div className="bg-white border border-[#e5e7eb] rounded-lg p-3">
      <p className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color }}>
        <Icon className="w-4 h-4" /> {title}
      </p>
      <ul className="text-sm text-gray-700 space-y-1 ml-6">
        {items.map((item, i) => <li key={i} className="list-disc">{item}</li>)}
      </ul>
    </div>
  );
}
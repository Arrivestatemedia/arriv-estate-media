import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Brain, Sparkles, TrendingUp, AlertTriangle, Lightbulb, BarChart3 } from "lucide-react";
import { generateLearningInsights } from "@/lib/hireiq";

export default function HireIQLearning() {
  const [performances, setPerformances] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [enabled, setEnabled] = useState(true);

  const loadData = async () => {
    try {
      const [perfs, cands, allJobs] = await Promise.all([
        base44.entities.HirePerformance.list("-created_date", 200),
        base44.entities.HireCandidate.list("-created_date", 200),
        base44.entities.HireJob.list("-created_date", 100),
      ]);
      setPerformances(perfs || []);
      setCandidates(cands || []);
      setJobs(allJobs || []);

      const setting = await base44.entities.AppSetting.filter({ key: "hireiq_learning_enabled" }, null, 1);
      if (setting && setting.length > 0) setEnabled(setting[0].value === "true");
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const toggleEnabled = async () => {
    const newVal = !enabled;
    setEnabled(newVal);
    const existing = await base44.entities.AppSetting.filter({ key: "hireiq_learning_enabled" }, null, 1);
    if (existing && existing.length > 0) {
      await base44.entities.AppSetting.update(existing[0].id, { value: String(newVal) });
    } else {
      await base44.entities.AppSetting.create({ key: "hireiq_learning_enabled", value: String(newVal) });
    }
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

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#B8956A] flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">HireIQ Learning System</h1>
            <p className="text-sm text-gray-500">Correlating hiring predictions with actual performance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Learning:</span>
          <button onClick={toggleEnabled} className={`relative w-12 h-6 rounded-full transition-colors ${enabled ? "bg-green-500" : "bg-gray-300"}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${enabled ? "translate-x-6" : ""}`} />
          </button>
        </div>
      </div>

      {!enabled && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-yellow-700">Learning is currently disabled. Enable it to start collecting performance data and generating insights.</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="border rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-[#B8956A]">{performances.length}</p>
          <p className="text-xs text-gray-500">Performance Records</p>
        </div>
        <div className="border rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-[#B8956A]">{candidates.filter(c => performances.some(p => p.candidate_id === c.id)).length}</p>
          <p className="text-xs text-gray-500">Hired Candidates Tracked</p>
        </div>
        <div className="border rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-[#B8956A]">{jobs.length}</p>
          <p className="text-xs text-gray-500">Jobs</p>
        </div>
      </div>

      {!hasEnoughData ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Not enough data yet</p>
          <p className="text-sm text-gray-400 mt-1">At least 3 performance records are needed to generate meaningful learning insights. Currently have {performances.length}.</p>
          <p className="text-sm text-gray-400 mt-2">Record performance for hired candidates from their candidate profile page.</p>
        </div>
      ) : (
        <>
          <Button onClick={handleAnalyze} disabled={analyzing} style={{ backgroundColor: "#B8956A" }} className="mb-4">
            {analyzing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing patterns...</> : <><Sparkles className="w-4 h-4 mr-2" /> Generate Learning Insights</>}
          </Button>

          {analyzing && (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" /><span className="ml-2 text-gray-500">AI is correlating hiring predictions with performance data...</span></div>
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
                <InsightSection title="Recommendations" items={insights.recommendations} icon={Lightbulb} color="#B8956A" />
              </div>
            </div>
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
    <div className="border rounded-lg p-3">
      <p className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color }}>
        <Icon className="w-4 h-4" /> {title}
      </p>
      <ul className="text-sm text-gray-700 space-y-1 ml-6">
        {items.map((item, i) => <li key={i} className="list-disc">{item}</li>)}
      </ul>
    </div>
  );
}
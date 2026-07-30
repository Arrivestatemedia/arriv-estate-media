import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Phone, Mail, MessageSquare, Calendar, Users, DollarSign, Wallet, TrendingUp, Sparkles, Sun, Target, Award, Loader2, RefreshCw, ChevronRight, X, BookOpen } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MetricCard from "@/components/performance/MetricCard";
import PipelineFunnel from "@/components/performance/PipelineFunnel";
import HealthScoreGauge from "@/components/performance/HealthScoreGauge";

const METRIC_CONFIG = {
  calls: { label: 'Calls', icon: Phone, format: (v) => v },
  emails: { label: 'Emails', icon: Mail, format: (v) => v },
  texts: { label: 'Texts', icon: MessageSquare, format: (v) => v },
  meaningful_conversations: { label: 'Conversations', icon: Users, format: (v) => v },
  appointments: { label: 'Appointments', icon: Calendar, format: (v) => v },
  deals_closed: { label: 'Deals Closed', icon: Target, format: (v) => v },
  revenue: { label: 'Revenue', icon: DollarSign, format: (v) => `$${v.toLocaleString()}` },
  commission: { label: 'Commission', icon: Wallet, format: (v) => `$${v.toLocaleString()}` },
};

const KPI_CONFIG = [
  { key: 'calls_completed', label: 'Calls', format: (v) => v },
  { key: 'talk_time_minutes', label: 'Talk Time', format: (v) => `${v}m` },
  { key: 'emails_sent', label: 'Emails', format: (v) => v },
  { key: 'texts_sent', label: 'Texts', format: (v) => v },
  { key: 'new_contacts_claimed', label: 'New Contacts', format: (v) => v },
  { key: 'follow_ups_completed', label: 'Follow-ups', format: (v) => v },
  { key: 'meetings_scheduled', label: 'Meetings', format: (v) => v },
  { key: 'deals_won', label: 'Deals Won', format: (v) => v },
  { key: 'deals_lost', label: 'Deals Lost', format: (v) => v },
  { key: 'revenue_generated', label: 'Revenue', format: (v) => `$${v.toLocaleString()}` },
  { key: 'commission_earned', label: 'Commission', format: (v) => `$${v.toLocaleString()}` },
  { key: 'close_rate', label: 'Close Rate', format: (v) => `${Math.round(v * 100)}%` },
  { key: 'average_deal_size', label: 'Avg Deal Size', format: (v) => `$${Math.round(v).toLocaleString()}` },
];

export default function SalesPerformanceDashboard() {
  const [repId, setRepId] = useState(null);
  const [repName, setRepName] = useState('');
  const [perfData, setPerfData] = useState(null);
  const [goals, setGoals] = useState([]);
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kpiPeriod, setKpiPeriod] = useState('weekly');
  const [healthScore, setHealthScore] = useState(null);
  const [coaching, setCoaching] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [verseModal, setVerseModal] = useState(null);
  const [repSource, setRepSource] = useState(() => localStorage.getItem('culture_banner_source') || 'bible');
  const [bannerMode, setBannerMode] = useState('manual');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem('sales_member_id');
    const name = localStorage.getItem('sales_member_name');
    if (!id) {
      window.location.replace('/SalesLogin');
      return;
    }
    setRepId(id);
    setRepName(name || '');
  }, []);

  const loadData = useCallback(async () => {
    if (!repId) return;
    setLoading(true);
    try {
      const [perfRes, bannerRes] = await Promise.all([
        base44.functions.invoke('computeSalesPerformance', { sales_member_id: repId }),
        base44.functions.invoke('getDailyCultureBanner', { source: repSource }),
      ]);
      setPerfData(perfRes.data);
      setGoals((perfRes.data?.goals || []).filter(g => !g.sales_member_id || g.sales_member_id === repId));
      setBanners(bannerRes.data?.banners || []);
      setBannerMode(bannerRes.data?.mode || 'manual');
      setLoadError(false);
    } catch (e) {
      console.error('Performance load error:', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [repId, repSource]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Generate AI health score + coaching
  useEffect(() => {
    if (!perfData?.reps?.[0]?.metrics) return;
    const rep = perfData.reps[0];
    const m = rep.metrics;
    setAiLoading(true);
    const prompt = `You are a sales performance coach analyzing a Sales Growth Advisor at Arriv Estate Media.

REP: ${rep.rep_name}
PERIOD METRICS:
- Today: ${m.daily.calls_completed} calls, ${m.daily.emails_sent} emails, ${m.daily.meaningful_conversations} conversations, ${m.daily.appointments_scheduled} appointments, ${m.daily.deals_closed} deals, $${m.daily.revenue_generated} revenue
- This Week: ${m.weekly.calls_completed} calls, ${m.weekly.meaningful_conversations} conversations, ${m.weekly.appointments_scheduled} appointments, ${m.weekly.deals_closed} deals, $${m.weekly.revenue_generated} revenue, ${m.weekly.talk_time_minutes}m talk time
- This Month: ${m.monthly.calls_completed} calls, ${m.monthly.deals_closed} deals, $${m.monthly.revenue_generated} revenue, $${m.monthly.commission_earned} commission
- Call streak: ${m.daily.call_streak} consecutive days
- Pipeline: ${m.weekly.pipeline.leads} leads → ${m.weekly.pipeline.conversations} conversations → ${m.weekly.pipeline.appointments} appointments → ${m.weekly.pipeline.clients} clients → $${m.weekly.pipeline.revenue} revenue

Generate a JSON response with:
1. health_score: 0-100 integer considering daily activity consistency, follow-up completion, pipeline balance, goal completion, conversion performance
2. summary: one sentence overall assessment
3. strengths: array of 2-3 specific strengths based on the data
4. areas_for_improvement: array of 2-3 specific areas to improve
5. recommended_actions: array of 2-3 specific actionable recommendations
6. growth_trends: array of 1-2 trend observations (comparing daily vs weekly vs monthly if possible)

Be specific and data-driven. Reference actual numbers. Keep each item to one sentence.`;

    base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          health_score: { type: 'number' },
          summary: { type: 'string' },
          strengths: { type: 'array', items: { type: 'string' } },
          areas_for_improvement: { type: 'array', items: { type: 'string' } },
          recommended_actions: { type: 'array', items: { type: 'string' } },
          growth_trends: { type: 'array', items: { type: 'string' } },
        },
        required: ['health_score', 'summary', 'strengths', 'areas_for_improvement', 'recommended_actions', 'growth_trends'],
      },
    }).then(result => {
      const data = typeof result === 'string' ? JSON.parse(result) : result;
      setHealthScore(data);
      setCoaching(data);
    }).catch(e => {
      console.error('AI coaching error:', e);
      setHealthScore({ health_score: 0, summary: 'Unable to generate score.' });
    }).finally(() => setAiLoading(false));
  }, [perfData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFBF5' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#B8956A' }} />
      </div>
    );
  }

  if (loadError || !perfData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#FFFBF5' }}>
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-sm mb-4" style={{ color: 'rgba(26,26,26,0.7)' }}>
              {loadError ? 'Unable to load performance data. Please try again.' : 'No performance data found.'}
            </p>
            <Button variant="outline" size="sm" onClick={loadData} className="gap-2">
              <RefreshCw className="w-4 h-4" /> Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const rep = perfData.reps[0];
  if (!rep) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#FFFBF5' }}>
        <Card><CardContent className="pt-6 text-center">No performance data found for your account.</CardContent></Card>
      </div>
    );
  }

  const dailyMetrics = rep.metrics.daily;
  const kpiMetrics = rep.metrics[kpiPeriod];
  const isFriday = new Date().getDay() === 5;
  const todayBanner = banners.length > 0 ? banners[new Date().getDate() % banners.length] : null;

  // Friday mode: check if weekly goals are met
  const weeklyGoalsMet = goals.filter(g => g.period === 'weekly').every(g => {
    const actual = rep.metrics.weekly[g.metric] || 0;
    return actual >= g.target_value;
  });
  const hasWeeklyGoals = goals.some(g => g.period === 'weekly');

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: '#FFFBF5' }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>
              <span style={{ fontStyle: 'italic' }}>Arriv</span>{' '}
              <span style={{ fontStyle: 'italic', fontWeight: 'bold', color: '#3B82F6' }}>One</span>
            </h1>
            <p className="text-sm mt-1" style={{ color: 'rgba(26,26,26,0.6)' }}>
              {repName}'s Performance Dashboard
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadData} className="gap-2">
              <RefreshCw className="w-4 h-4" /> Refresh
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link to={createPageUrl("EmployeeProfile")}>
                <Award className="w-4 h-4" /> My Profile
              </Link>
            </Button>
          </div>
        </div>

        {/* Culture Banner */}
        {todayBanner && (
          <div className="mb-6 rounded-xl p-4 flex items-center gap-3" style={{ backgroundColor: 'rgba(184,149,106,0.1)', border: '1px solid rgba(184,149,106,0.3)' }}>
            <Sparkles className="w-5 h-5 flex-shrink-0" style={{ color: '#B8956A' }} />
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: '#1A1A1A' }}>{todayBanner.message}</p>
              {todayBanner.verse_reference && (
                <button
                  onClick={() => setVerseModal({ reference: todayBanner.verse_reference, text: todayBanner.verse_text })}
                  className="text-xs mt-1 flex items-center gap-1 hover:underline"
                  style={{ color: '#B8956A' }}
                >
                  <BookOpen className="w-3 h-3" />
                  {todayBanner.verse_reference}
                </button>
              )}
            </div>
            {bannerMode === 'automated' && (
              <Select
                value={repSource}
                onValueChange={(v) => {
                  setRepSource(v);
                  localStorage.setItem('culture_banner_source', v);
                }}
              >
                <SelectTrigger className="w-36 h-7 text-xs flex-shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bible">Bible</SelectItem>
                  <SelectItem value="quran">Quran</SelectItem>
                  <SelectItem value="torah">Torah / Tanakh</SelectItem>
                  <SelectItem value="buddhist">Buddhist Teachings</SelectItem>
                  <SelectItem value="hindu">Hindu Texts</SelectItem>
                  <SelectItem value="secular">Secular</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Verse Modal */}
        {verseModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setVerseModal(null)}>
            <div className="max-w-md w-full rounded-2xl p-6 relative" style={{ backgroundColor: '#FFFBF5', border: '1px solid rgba(184,149,106,0.3)' }} onClick={e => e.stopPropagation()}>
              <button onClick={() => setVerseModal(null)} className="absolute top-3 right-3 p-1 rounded-lg" style={{ color: 'rgba(26,26,26,0.5)' }}>
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-5 h-5" style={{ color: '#B8956A' }} />
                <h3 className="text-lg font-bold" style={{ color: '#1A1A1A' }}>{verseModal.reference}</h3>
              </div>
              <p className="text-base leading-relaxed italic" style={{ color: 'rgba(26,26,26,0.8)' }}>
                "{verseModal.text || 'Verse text not available.'}"
              </p>
            </div>
          </div>
        )}

        {/* Friday Mode */}
        {isFriday && (
          <div className="mb-6 rounded-xl p-5" style={{
            backgroundColor: hasWeeklyGoals && weeklyGoalsMet ? 'rgba(22,163,74,0.08)' : 'rgba(184,149,106,0.08)',
            border: `1px solid ${hasWeeklyGoals && weeklyGoalsMet ? 'rgba(22,163,74,0.3)' : 'rgba(184,149,106,0.3)'}`,
          }}>
            <div className="flex items-start gap-3">
              <Sun className="w-6 h-6 flex-shrink-0 mt-0.5" style={{ color: hasWeeklyGoals && weeklyGoalsMet ? '#16a34a' : '#B8956A' }} />
              <div>
                {hasWeeklyGoals && weeklyGoalsMet ? (
                  <>
                    <p className="font-semibold" style={{ color: '#16a34a' }}>You've earned your Friday.</p>
                    <p className="text-sm mt-1" style={{ color: 'rgba(26,26,26,0.7)' }}>Enjoy your family and recharge. Anything you accomplish today puts you ahead for next week.</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold" style={{ color: '#B8956A' }}>Friday Push — you're almost there!</p>
                    <p className="text-sm mt-1" style={{ color: 'rgba(26,26,26,0.7)' }}>
                      {hasWeeklyGoals
                        ? 'Keep going — here\'s what remains to hit your weekly goals:'
                        : 'No weekly goals set yet. Ask your admin to set goals so you can track your Friday progress.'}
                    </p>
                    {hasWeeklyGoals && goals.filter(g => g.period === 'weekly').map(g => {
                      const actual = rep.metrics.weekly[g.metric] || 0;
                      const remaining = Math.max(0, g.target_value - actual);
                      if (remaining <= 0) return null;
                      return (
                        <p key={g.id} className="text-xs mt-1" style={{ color: 'rgba(26,26,26,0.6)' }}>
                          • {METRIC_CONFIG[g.metric]?.label || g.metric}: {actual} / {g.target_value} ({remaining} to go)
                        </p>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Daily Goals */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-5 h-5" style={{ color: '#B8956A' }} />
            <h2 className="text-lg font-semibold" style={{ color: '#1A1A1A' }}>Daily Goals</h2>
            <span className="text-xs" style={{ color: 'rgba(26,26,26,0.4)' }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(METRIC_CONFIG).map(([key, cfg]) => {
              const goal = goals.find(g => g.metric === key && g.period === 'daily');
              const actual = dailyMetrics[key] || 0;
              return (
                <MetricCard
                  key={key}
                  label={cfg.label}
                  value={actual}
                  target={goal?.target_value}
                  format={cfg.format}
                  icon={cfg.icon}
                />
              );
            })}
          </div>
        </div>

        {/* KPI Dashboard */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" style={{ color: '#B8956A' }} />
              <h2 className="text-lg font-semibold" style={{ color: '#1A1A1A' }}>KPI Dashboard</h2>
            </div>
            <div className="flex gap-1">
              {['weekly', 'monthly', 'quarterly', 'yearly'].map(p => (
                <button
                  key={p}
                  onClick={() => setKpiPeriod(p)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition"
                  style={{
                    backgroundColor: kpiPeriod === p ? '#B8956A' : 'transparent',
                    color: kpiPeriod === p ? '#1A1A1A' : 'rgba(26,26,26,0.5)',
                    border: `1px solid ${kpiPeriod === p ? '#B8956A' : 'rgba(184,149,106,0.2)'}`,
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {KPI_CONFIG.map(kpi => (
              <Card key={kpi.key} style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.15)' }}>
                <CardContent className="pt-3 pb-3">
                  <p className="text-xs font-medium mb-1" style={{ color: 'rgba(26,26,26,0.5)' }}>{kpi.label}</p>
                  <p className="text-xl font-bold" style={{ color: '#1A1A1A' }}>{kpi.format(kpiMetrics[kpi.key] || 0)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Pipeline + Health Score */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <PipelineFunnel data={rep.metrics.weekly.pipeline} title="Pipeline Health (This Week)" />
          <Card style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.2)' }}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2" style={{ color: '#1A1A1A' }}>
                <Sparkles className="w-5 h-5" style={{ color: '#B8956A' }} /> Sales Health Score
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <HealthScoreGauge
                score={healthScore?.health_score || 0}
                summary={healthScore?.summary}
                loading={aiLoading}
              />
            </CardContent>
          </Card>
        </div>

        {/* AI Coaching */}
        {coaching && !aiLoading && (
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            <Card style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(22,163,74,0.2)' }}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2" style={{ color: '#16a34a' }}>
                  <Award className="w-4 h-4" /> Strengths
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {(coaching.strengths || []).map((s, i) => (
                    <li key={i} className="text-sm flex items-start gap-2" style={{ color: 'rgba(26,26,26,0.8)' }}>
                      <span style={{ color: '#16a34a' }}>✓</span> {s}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(245,158,11,0.2)' }}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2" style={{ color: '#f59e0b' }}>
                  <TrendingUp className="w-4 h-4" /> Areas for Improvement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {(coaching.areas_for_improvement || []).map((s, i) => (
                    <li key={i} className="text-sm flex items-start gap-2" style={{ color: 'rgba(26,26,26,0.8)' }}>
                      <span style={{ color: '#f59e0b' }}>→</span> {s}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.2)' }}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2" style={{ color: '#B8956A' }}>
                  <Target className="w-4 h-4" /> Recommended Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {(coaching.recommended_actions || []).map((s, i) => (
                    <li key={i} className="text-sm flex items-start gap-2" style={{ color: 'rgba(26,26,26,0.8)' }}>
                      <span style={{ color: '#B8956A' }}>{i + 1}.</span> {s}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(59,130,246,0.2)' }}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2" style={{ color: '#3B82F6' }}>
                  <TrendingUp className="w-4 h-4" /> Growth Trends
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {(coaching.growth_trends || []).map((s, i) => (
                    <li key={i} className="text-sm flex items-start gap-2" style={{ color: 'rgba(26,26,26,0.8)' }}>
                      <span style={{ color: '#3B82F6' }}>↗</span> {s}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}

        {aiLoading && (
          <div className="flex items-center justify-center py-8 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#B8956A' }} />
            <span className="text-sm" style={{ color: 'rgba(26,26,26,0.5)' }}>Generating AI coaching insights...</span>
          </div>
        )}
      </div>
    </div>
  );
}
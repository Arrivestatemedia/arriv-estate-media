import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DollarSign, Users, TrendingUp, Phone, Mail, Calendar, Target, Plus, Trash2, Sparkles, Award, Loader2, RefreshCw, ArrowUpDown, MapPin } from "lucide-react";
import PipelineFunnel from "@/components/performance/PipelineFunnel";

const METRIC_OPTIONS = [
  { value: 'calls', label: 'Calls' },
  { value: 'emails', label: 'Emails' },
  { value: 'texts', label: 'Texts' },
  { value: 'meaningful_conversations', label: 'Conversations' },
  { value: 'appointments', label: 'Appointments' },
  { value: 'deals_closed', label: 'Deals Closed' },
  { value: 'revenue', label: 'Revenue ($)' },
  { value: 'commission', label: 'Commission ($)' },
  { value: 'new_contacts', label: 'New Contacts' },
  { value: 'follow_ups', label: 'Follow-ups' },
];

const RANKING_OPTIONS = [
  { key: 'calls_completed', label: 'Most Calls', period: 'weekly' },
  { key: 'meaningful_conversations', label: 'Most Conversations', period: 'weekly' },
  { key: 'revenue_generated', label: 'Highest Revenue', period: 'monthly' },
  { key: 'appointments_scheduled', label: 'Most Meetings', period: 'weekly' },
  { key: 'new_contacts_claimed', label: 'Most New Contacts', period: 'weekly' },
  { key: 'deals_closed', label: 'Most Deals Closed', period: 'monthly' },
];

export default function OwnerDashboard() {
  const [perfData, setPerfData] = useState(null);
  const [goals, setGoals] = useState([]);
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showBannerModal, setShowBannerModal] = useState(false);
  const [newGoal, setNewGoal] = useState({ metric: 'calls', period: 'daily', target_value: 60 });
  const [newBanner, setNewBanner] = useState({ message: '', verse_reference: '', verse_text: '' });
  const [rankingKey, setRankingKey] = useState('calls_completed');
  const [rankingPeriod, setRankingPeriod] = useState('weekly');
  const [bannerMode, setBannerMode] = useState('manual');
  const [bannerSource, setBannerSource] = useState('bible');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [perfRes, goalsRes, bannersRes, settingsRes] = await Promise.all([
        base44.functions.invoke('computeSalesPerformance', {}),
        base44.entities.SalesGoal.list(),
        base44.entities.CultureBanner.list(),
        base44.entities.AppSetting.list(),
      ]);
      setPerfData(perfRes.data);
      setGoals(goalsRes || []);
      setBanners(bannersRes || []);
      const settings = settingsRes || [];
      setBannerMode(settings.find(s => s.key === 'culture_banner_mode')?.value || 'manual');
      setBannerSource(settings.find(s => s.key === 'culture_banner_source')?.value || 'bible');
    } catch (e) {
      console.error('Owner dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreateGoal = async () => {
    try {
      await base44.entities.SalesGoal.create({
        ...newGoal,
        target_value: Number(newGoal.target_value),
        is_active: true,
        created_by: localStorage.getItem('sales_member_email') || 'admin',
      });
      setShowGoalModal(false);
      setNewGoal({ metric: 'calls', period: 'daily', target_value: 60 });
      loadData();
    } catch (e) { alert('Failed to create goal: ' + e.message); }
  };

  const handleDeleteGoal = async (id) => {
    try {
      await base44.entities.SalesGoal.delete(id);
      loadData();
    } catch (e) { alert('Failed to delete goal: ' + e.message); }
  };

  const handleCreateBanner = async () => {
    if (!newBanner.message.trim()) return;
    try {
      await base44.entities.CultureBanner.create({
        message: newBanner.message.trim(),
        verse_reference: newBanner.verse_reference.trim(),
        verse_text: newBanner.verse_text.trim(),
        is_active: true,
        display_order: banners.length,
        created_by: localStorage.getItem('sales_member_email') || 'admin',
      });
      setShowBannerModal(false);
      setNewBanner({ message: '', verse_reference: '', verse_text: '' });
      loadData();
    } catch (e) { alert('Failed to create banner: ' + e.message); }
  };

  const handleDeleteBanner = async (id) => {
    try {
      await base44.entities.CultureBanner.delete(id);
      loadData();
    } catch (e) { alert('Failed to delete banner: ' + e.message); }
  };

  const upsertSetting = async (key, value) => {
    try {
      const existing = await base44.entities.AppSetting.filter({ key });
      if (existing && existing.length > 0) {
        await base44.entities.AppSetting.update(existing[0].id, { value });
      } else {
        await base44.entities.AppSetting.create({ key, value });
      }
    } catch (e) { console.error('Setting save error:', e); }
  };

  const handleToggleBannerMode = async (checked) => {
    const newMode = checked ? 'automated' : 'manual';
    setBannerMode(newMode);
    await upsertSetting('culture_banner_mode', newMode);
  };

  const handleSetBannerSource = async (value) => {
    setBannerSource(value);
    await upsertSetting('culture_banner_source', value);
  };

  if (loading || !perfData) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFBF5' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#B8956A' }} />
      </div>
    );
  }

  const company = perfData.company || {};
  const reps = (perfData.reps || []).filter(r => r.role !== 'admin');
  const monthly = company.monthly || {};
  const weekly = company.weekly || {};
  const daily = company.daily || {};

  // Revenue by market
  const marketRevenue = {};
  reps.forEach(r => {
    const market = r.market || 'Unassigned';
    marketRevenue[market] = (marketRevenue[market] || 0) + (r.metrics?.monthly?.revenue_generated || 0);
  });

  // Rankings
  const rankingConfig = RANKING_OPTIONS.find(r => r.key === rankingKey) || RANKING_OPTIONS[0];
  const rankedReps = [...reps].sort((a, b) =>
    (b.metrics?.[rankingConfig.period]?.[rankingKey] || 0) - (a.metrics?.[rankingConfig.period]?.[rankingKey] || 0)
  );

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: '#FFFBF5' }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>
              <span style={{ fontStyle: 'italic' }}>Arriv</span>{' '}
              <span style={{ fontStyle: 'italic', fontWeight: 'bold', color: '#3B82F6' }}>One</span>
            </h1>
            <p className="text-sm mt-1" style={{ color: 'rgba(26,26,26,0.6)' }}>Owner Dashboard — Company Performance</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>

        {/* Company Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <Card style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.2)' }}>
            <CardContent className="pt-4">
              <DollarSign className="w-5 h-5 mb-2" style={{ color: '#B8956A' }} />
              <p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>Total Revenue (MTD)</p>
              <p className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>${(monthly.revenue_generated || 0).toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.2)' }}>
            <CardContent className="pt-4">
              <Users className="w-5 h-5 mb-2" style={{ color: '#B8956A' }} />
              <p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>Total Leads (WTD)</p>
              <p className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>{weekly.pipeline?.leads || 0}</p>
            </CardContent>
          </Card>
          <Card style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.2)' }}>
            <CardContent className="pt-4">
              <Target className="w-5 h-5 mb-2" style={{ color: '#B8956A' }} />
              <p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>Total Clients (MTD)</p>
              <p className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>{monthly.deals_closed || 0}</p>
            </CardContent>
          </Card>
          <Card style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.2)' }}>
            <CardContent className="pt-4">
              <TrendingUp className="w-5 h-5 mb-2" style={{ color: '#B8956A' }} />
              <p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>Avg Revenue / Client</p>
              <p className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>${Math.round(monthly.average_deal_size || 0).toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        {/* Revenue by Market */}
        <Card className="mb-6" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.2)' }}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2" style={{ color: '#1A1A1A' }}>
              <MapPin className="w-5 h-5" style={{ color: '#B8956A' }} /> Revenue by Market (MTD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(marketRevenue).length === 0 ? (
              <p className="text-sm" style={{ color: 'rgba(26,26,26,0.4)' }}>No market data available.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(marketRevenue).map(([market, rev]) => {
                  const maxRev = Math.max(...Object.values(marketRevenue), 1);
                  return (
                    <div key={market}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium" style={{ color: '#1A1A1A' }}>{market}</span>
                        <span className="text-sm font-bold" style={{ color: '#B8956A' }}>${rev.toLocaleString()}</span>
                      </div>
                      <div className="h-3 rounded-full" style={{ backgroundColor: 'rgba(184,149,106,0.1)' }}>
                        <div className="h-3 rounded-full" style={{ width: `${(rev / maxRev) * 100}%`, backgroundColor: '#B8956A' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Daily Team Activity */}
        <Card className="mb-6" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.2)' }}>
          <CardHeader>
            <CardTitle className="text-lg" style={{ color: '#1A1A1A' }}>Daily Team Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2"><Phone className="w-4 h-4" style={{ color: '#B8956A' }} /><div><p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>Calls</p><p className="font-bold" style={{ color: '#1A1A1A' }}>{daily.calls_completed || 0}</p></div></div>
              <div className="flex items-center gap-2"><Mail className="w-4 h-4" style={{ color: '#B8956A' }} /><div><p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>Emails</p><p className="font-bold" style={{ color: '#1A1A1A' }}>{daily.emails_sent || 0}</p></div></div>
              <div className="flex items-center gap-2"><Calendar className="w-4 h-4" style={{ color: '#B8956A' }} /><div><p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>Appointments</p><p className="font-bold" style={{ color: '#1A1A1A' }}>{daily.appointments_scheduled || 0}</p></div></div>
              <div className="flex items-center gap-2"><Users className="w-4 h-4" style={{ color: '#B8956A' }} /><div><p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>Conversations</p><p className="font-bold" style={{ color: '#1A1A1A' }}>{daily.meaningful_conversations || 0}</p></div></div>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline + Rankings */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <PipelineFunnel data={weekly.pipeline} title="Company Pipeline (WTD)" />
          <Card style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.2)' }}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2" style={{ color: '#1A1A1A' }}>
                  <Award className="w-5 h-5" style={{ color: '#B8956A' }} /> Team Rankings
                </CardTitle>
                <Select value={rankingKey} onValueChange={setRankingKey}>
                  <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RANKING_OPTIONS.map(r => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {rankedReps.length === 0 ? (
                <p className="text-sm" style={{ color: 'rgba(26,26,26,0.4)' }}>No active reps.</p>
              ) : (
                <div className="space-y-2">
                  {rankedReps.map((rep, idx) => {
                    const val = rep.metrics?.[rankingConfig.period]?.[rankingKey] || 0;
                    const isMoney = rankingKey === 'revenue_generated' || rankingKey === 'commission_earned';
                    return (
                      <div key={rep.rep_id} className="flex items-center justify-between p-2 rounded-lg" style={{ backgroundColor: idx === 0 ? 'rgba(184,149,106,0.1)' : 'transparent' }}>
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: idx === 0 ? '#B8956A' : 'rgba(184,149,106,0.15)', color: idx === 0 ? '#1A1A1A' : '#B8956A' }}>{idx + 1}</span>
                          <Link to={createPageUrl("EmployeeProfile") + `?rep_id=${rep.rep_id}`} className="text-sm font-medium hover:underline" style={{ color: '#1A1A1A' }}>{rep.rep_name}</Link>
                        </div>
                        <span className="text-sm font-bold" style={{ color: '#B8956A' }}>{isMoney ? `$${val.toLocaleString()}` : val}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Goals Management */}
        <Card className="mb-6" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.2)' }}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2" style={{ color: '#1A1A1A' }}>
                <Target className="w-5 h-5" style={{ color: '#B8956A' }} /> Goals
              </CardTitle>
              <Dialog open={showGoalModal} onOpenChange={setShowGoalModal}>
                <DialogTrigger asChild><Button size="sm" className="gap-2" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}><Plus className="w-4 h-4" /> New Goal</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Create Goal</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Metric</Label><Select value={newGoal.metric} onValueChange={v => setNewGoal({ ...newGoal, metric: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{METRIC_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label>Period</Label><Select value={newGoal.period} onValueChange={v => setNewGoal({ ...newGoal, period: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label>Target Value</Label><Input type="number" value={newGoal.target_value} onChange={e => setNewGoal({ ...newGoal, target_value: e.target.value })} /></div>
                    <Button onClick={handleCreateGoal} className="w-full" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}>Create Goal</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {goals.length === 0 ? (
              <p className="text-sm" style={{ color: 'rgba(26,26,26,0.4)' }}>No goals yet. Create one to start tracking team progress.</p>
            ) : (
              <div className="space-y-2">
                {goals.map(g => (
                  <div key={g.id} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.05)' }}>
                    <div>
                      <span className="text-sm font-medium capitalize" style={{ color: '#1A1A1A' }}>{g.metric.replace(/_/g, ' ')}</span>
                      <span className="text-xs ml-2" style={{ color: 'rgba(26,26,26,0.4)' }}>{g.period}</span>
                      {g.sales_member_id && <span className="text-xs ml-2" style={{ color: '#B8956A' }}>· per rep</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold" style={{ color: '#B8956A' }}>{g.target_value}</span>
                      <button onClick={() => handleDeleteGoal(g.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Culture Banner Management */}
        <Card style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.2)' }}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2" style={{ color: '#1A1A1A' }}>
                <Sparkles className="w-5 h-5" style={{ color: '#B8956A' }} /> Culture Banners
              </CardTitle>
              <Dialog open={showBannerModal} onOpenChange={setShowBannerModal}>
                <DialogTrigger asChild><Button size="sm" variant="outline" className="gap-2"><Plus className="w-4 h-4" /> Add Message</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Culture Message</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Message</Label>
                      <Textarea value={newBanner.message} onChange={e => setNewBanner({ ...newBanner, message: e.target.value })} rows={2} placeholder="e.g. Relationships first. Results follow." />
                    </div>
                    <div>
                      <Label>Bible Verse Reference</Label>
                      <Input value={newBanner.verse_reference} onChange={e => setNewBanner({ ...newBanner, verse_reference: e.target.value })} placeholder="e.g. Acts 28:19" />
                    </div>
                    <div>
                      <Label>Full Verse Text</Label>
                      <Textarea value={newBanner.verse_text} onChange={e => setNewBanner({ ...newBanner, verse_text: e.target.value })} rows={3} placeholder="e.g. I have done this and have not been disobedient to the heavenly vision." />
                    </div>
                    <Button onClick={handleCreateBanner} className="w-full" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}>Add</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {/* Automation Toggle */}
            <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.05)', border: '1px solid rgba(184,149,106,0.15)' }}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium" style={{ color: '#1A1A1A' }}>AI Automation</p>
                  <p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>
                    {bannerMode === 'automated' ? 'AI generates a daily quote & verse automatically' : 'Manual — you create each banner'}
                  </p>
                </div>
                <Switch checked={bannerMode === 'automated'} onCheckedChange={handleToggleBannerMode} />
              </div>
              {bannerMode === 'automated' && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>Source:</span>
                  <Select value={bannerSource} onValueChange={handleSetBannerSource}>
                    <SelectTrigger className="w-40 h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bible">Bible Verses</SelectItem>
                      <SelectItem value="secular">Secular (No Religion)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {bannerMode === 'manual' && banners.filter(b => !b.auto_generated).length === 0 ? (
              <p className="text-sm" style={{ color: 'rgba(26,26,26,0.4)' }}>No culture messages yet.</p>
            ) : (
              <div className="space-y-2">
                {banners.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.05)' }}>
                    <div>
                      <span className="text-sm" style={{ color: '#1A1A1A' }}>{b.message}</span>
                      {b.verse_reference && <span className="text-xs ml-2" style={{ color: '#B8956A' }}>· {b.verse_reference}</span>}
                      {b.auto_generated && <span className="text-xs ml-2 px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#3B82F6' }}>AI</span>}
                    </div>
                    <button onClick={() => handleDeleteBanner(b.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
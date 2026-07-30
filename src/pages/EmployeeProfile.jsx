import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Phone, Mail, Calendar, DollarSign, Wallet, Users, Target, Award, TrendingUp, Flame, Plus, Loader2, ArrowLeft, Sparkles } from "lucide-react";
import HealthScoreGauge from "@/components/performance/HealthScoreGauge";

export default function EmployeeProfile() {
  const [repId, setRepId] = useState(null);
  const [perfData, setPerfData] = useState(null);
  const [goals, setGoals] = useState([]);
  const [notes, setNotes] = useState([]);
  const [training, setTraining] = useState([]);
  const [loading, setLoading] = useState(true);
  const [healthScore, setHealthScore] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [newNote, setNewNote] = useState({ content: '', note_type: 'general', is_recognition: false, award_title: '' });
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paramId = urlParams.get('rep_id');
    const localId = localStorage.getItem('sales_member_id');
    const id = paramId || localId;
    if (!id) { window.location.replace('/SalesLogin'); return; }
    setRepId(id);
    setIsAdmin(localStorage.getItem('sales_member_role') === 'admin');
  }, []);

  const loadData = useCallback(async () => {
    if (!repId) return;
    setLoading(true);
    try {
      const [perfRes, goalsRes, notesRes] = await Promise.all([
        base44.functions.invoke('computeSalesPerformance', { sales_member_id: repId }),
        base44.entities.SalesGoal.filter({ sales_member_id: repId, is_active: true }),
        base44.entities.ManagerNote.filter({ sales_member_id: repId }, '-created_date', 50),
      ]);
      setPerfData(perfRes.data);
      setGoals(goalsRes || []);
      setNotes(notesRes || []);
      // Try to fetch training completions
      try {
        const rep = perfRes.data?.reps?.[0];
        if (rep?.rep_email) {
          const completions = await base44.entities.TrainingCompletion.list('-completed_at', 20);
          setTraining(completions || []);
        }
      } catch (e) { setTraining([]); }
    } catch (e) {
      console.error('Profile load error:', e);
    } finally {
      setLoading(false);
    }
  }, [repId]);

  useEffect(() => { loadData(); }, [loadData]);

  // AI coaching for profile
  useEffect(() => {
    if (!perfData?.reps?.[0]?.metrics) return;
    const rep = perfData.reps[0];
    const m = rep.metrics;
    setAiLoading(true);
    base44.integrations.Core.InvokeLLM({
      prompt: `Analyze this sales rep's career performance and generate a professional growth summary.

REP: ${rep.rep_name}
Hire date: ${rep.hire_date || 'Unknown'}
Lifetime: ${m.lifetime.calls_completed} calls, ${m.lifetime.emails_sent} emails, ${m.lifetime.appointments_scheduled} appointments, ${m.lifetime.deals_closed} deals, $${m.lifetime.revenue_generated} revenue, $${m.lifetime.commission_earned} commission
This year: ${m.yearly.calls_completed} calls, ${m.yearly.deals_closed} deals, $${m.yearly.revenue_generated} revenue
Call streak: ${m.daily.call_streak} days

Generate JSON with:
- strengths: array of 2-3 specific professional strengths
- growth_opportunities: array of 2-3 specific areas for professional growth
- career_summary: 2-3 sentence professional summary of their trajectory`,
      response_json_schema: {
        type: 'object',
        properties: {
          strengths: { type: 'array', items: { type: 'string' } },
          growth_opportunities: { type: 'array', items: { type: 'string' } },
          career_summary: { type: 'string' },
        },
        required: ['strengths', 'growth_opportunities', 'career_summary'],
      },
    }).then(result => {
      setHealthScore(typeof result === 'string' ? JSON.parse(result) : result);
    }).catch(() => {}).finally(() => setAiLoading(false));
  }, [perfData]);

  const handleAddNote = async () => {
    if (!newNote.content.trim()) return;
    try {
      await base44.entities.ManagerNote.create({
        sales_member_id: repId,
        author_id: localStorage.getItem('sales_member_id') || '',
        author_name: localStorage.getItem('sales_member_name') || 'Admin',
        ...newNote,
      });
      setShowNoteModal(false);
      setNewNote({ content: '', note_type: 'general', is_recognition: false, award_title: '' });
      loadData();
    } catch (e) { alert('Failed to add note: ' + e.message); }
  };

  if (loading || !perfData) {
    return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFBF5' }}><Loader2 className="w-8 h-8 animate-spin" style={{ color: '#B8956A' }} /></div>;
  }

  const rep = perfData.reps[0];
  if (!rep) {
    return <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#FFFBF5' }}><Card><CardContent className="pt-6 text-center">Employee not found.</CardContent></Card></div>;
  }

  const lt = rep.metrics.lifetime;
  const yr = rep.metrics.yearly;
  const recognitions = notes.filter(n => n.is_recognition || n.note_type === 'recognition');
  const coachingNotes = notes.filter(n => n.note_type === 'coaching' || n.note_type === 'review');

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: '#FFFBF5' }}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => window.history.back()} className="gap-1" style={{ color: 'rgba(26,26,26,0.6)' }}>
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        </div>

        {/* Profile Header */}
        <Card className="mb-6" style={{ backgroundColor: '#1A1A1A', border: 'none' }}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              {rep.profile_picture_url ? (
                <img src={rep.profile_picture_url} alt={rep.rep_name} className="w-16 h-16 rounded-full object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}>
                  {rep.rep_name?.charAt(0) || '?'}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold" style={{ color: '#FFFBF5' }}>{rep.rep_name}</h1>
                <p className="text-sm" style={{ color: 'rgba(255,251,245,0.6)' }}>{rep.title || 'Sales Growth Advisor'}</p>
                <p className="text-xs mt-1" style={{ color: '#B8956A' }}>
                  {rep.hire_date ? `Hired ${new Date(rep.hire_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}` : 'Hire date not set'}
                  {rep.market && ` · ${rep.market}`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Health Score + Career Summary */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <Card style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.2)' }}>
            <CardHeader><CardTitle className="text-base flex items-center gap-2" style={{ color: '#1A1A1A' }}><Sparkles className="w-4 h-4" style={{ color: '#B8956A' }} /> Sales Health Score</CardTitle></CardHeader>
            <CardContent className="flex justify-center">
              <HealthScoreGauge score={healthScore?.health_score || 0} summary={healthScore?.career_summary} loading={aiLoading} />
            </CardContent>
          </Card>
          <Card style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.2)' }}>
            <CardHeader><CardTitle className="text-base flex items-center gap-2" style={{ color: '#1A1A1A' }}><TrendingUp className="w-4 h-4" style={{ color: '#B8956A' }} /> AI Growth Insights</CardTitle></CardHeader>
            <CardContent>
              {aiLoading ? (
                <div className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" style={{ color: '#B8956A' }} /><span className="text-sm" style={{ color: 'rgba(26,26,26,0.5)' }}>Analyzing...</span></div>
              ) : (
                <div className="space-y-3">
                  <div><p className="text-xs font-semibold uppercase mb-1" style={{ color: '#16a34a' }}>Strengths</p>{(healthScore?.strengths || []).map((s, i) => <p key={i} className="text-sm" style={{ color: 'rgba(26,26,26,0.8)' }}>✓ {s}</p>)}</div>
                  <div><p className="text-xs font-semibold uppercase mb-1" style={{ color: '#f59e0b' }}>Growth Opportunities</p>{(healthScore?.growth_opportunities || []).map((s, i) => <p key={i} className="text-sm" style={{ color: 'rgba(26,26,26,0.8)' }}>→ {s}</p>)}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Lifetime Stats */}
        <Card className="mb-6" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.2)' }}>
          <CardHeader><CardTitle className="text-lg" style={{ color: '#1A1A1A' }}>Lifetime Performance</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2"><DollarSign className="w-5 h-5" style={{ color: '#B8956A' }} /><div><p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>Revenue Generated</p><p className="font-bold" style={{ color: '#1A1A1A' }}>${lt.revenue_generated.toLocaleString()}</p></div></div>
              <div className="flex items-center gap-2"><Wallet className="w-5 h-5" style={{ color: '#B8956A' }} /><div><p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>Commission Earned</p><p className="font-bold" style={{ color: '#1A1A1A' }}>${lt.commission_earned.toLocaleString()}</p></div></div>
              <div className="flex items-center gap-2"><Target className="w-5 h-5" style={{ color: '#B8956A' }} /><div><p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>Clients Closed</p><p className="font-bold" style={{ color: '#1A1A1A' }}>{lt.deals_closed}</p></div></div>
              <div className="flex items-center gap-2"><Phone className="w-5 h-5" style={{ color: '#B8956A' }} /><div><p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>Calls Made</p><p className="font-bold" style={{ color: '#1A1A1A' }}>{lt.calls_total}</p></div></div>
              <div className="flex items-center gap-2"><Mail className="w-5 h-5" style={{ color: '#B8956A' }} /><div><p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>Emails Sent</p><p className="font-bold" style={{ color: '#1A1A1A' }}>{lt.emails_sent}</p></div></div>
              <div className="flex items-center gap-2"><Calendar className="w-5 h-5" style={{ color: '#B8956A' }} /><div><p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>Appointments</p><p className="font-bold" style={{ color: '#1A1A1A' }}>{lt.appointments_scheduled}</p></div></div>
              <div className="flex items-center gap-2"><Users className="w-5 h-5" style={{ color: '#B8956A' }} /><div><p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>New Contacts</p><p className="font-bold" style={{ color: '#1A1A1A' }}>{lt.new_contacts_claimed}</p></div></div>
              <div className="flex items-center gap-2"><Flame className="w-5 h-5" style={{ color: '#B8956A' }} /><div><p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>Call Streak</p><p className="font-bold" style={{ color: '#1A1A1A' }}>{lt.call_streak} days</p></div></div>
            </div>
          </CardContent>
        </Card>

        {/* Current Goals */}
        <Card className="mb-6" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.2)' }}>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2" style={{ color: '#1A1A1A' }}><Target className="w-5 h-5" style={{ color: '#B8956A' }} /> Current Goals</CardTitle></CardHeader>
          <CardContent>
            {goals.length === 0 ? (
              <p className="text-sm" style={{ color: 'rgba(26,26,26,0.4)' }}>No individual goals assigned. Team goals apply.</p>
            ) : (
              <div className="space-y-2">
                {goals.map(g => {
                  const actual = rep.metrics[g.period]?.[g.metric] || 0;
                  const pct = g.target_value > 0 ? Math.min(100, Math.round((actual / g.target_value) * 100)) : 0;
                  return (
                    <div key={g.id} className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.05)' }}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium capitalize" style={{ color: '#1A1A1A' }}>{g.metric.replace(/_/g, ' ')} <span className="text-xs" style={{ color: 'rgba(26,26,26,0.4)' }}>({g.period})</span></span>
                        <span className="text-sm font-bold" style={{ color: '#B8956A' }}>{actual} / {g.target_value}</span>
                      </div>
                      <div className="h-2 rounded-full" style={{ backgroundColor: 'rgba(184,149,106,0.1)' }}>
                        <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#16a34a' : '#B8956A' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recognition & Awards */}
        <Card className="mb-6" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.2)' }}>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2" style={{ color: '#1A1A1A' }}><Award className="w-5 h-5" style={{ color: '#B8956A' }} /> Recognition & Awards</CardTitle></CardHeader>
          <CardContent>
            {recognitions.length === 0 ? (
              <p className="text-sm" style={{ color: 'rgba(26,26,26,0.4)' }}>No recognition yet.</p>
            ) : (
              <div className="space-y-2">
                {recognitions.map(n => (
                  <div key={n.id} className="p-3 rounded-lg flex items-start gap-2" style={{ backgroundColor: 'rgba(22,163,74,0.05)' }}>
                    <Award className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#16a34a' }} />
                    <div>
                      {n.award_title && <p className="text-sm font-semibold" style={{ color: '#16a34a' }}>{n.award_title}</p>}
                      <p className="text-sm" style={{ color: 'rgba(26,26,26,0.7)' }}>{n.content}</p>
                      <p className="text-xs mt-1" style={{ color: 'rgba(26,26,26,0.4)' }}>— {n.author_name}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Manager Notes */}
        <Card className="mb-6" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.2)' }}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg" style={{ color: '#1A1A1A' }}>Manager Notes</CardTitle>
              {isAdmin && (
                <Dialog open={showNoteModal} onOpenChange={setShowNoteModal}>
                  <DialogTrigger asChild><Button size="sm" className="gap-2" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}><Plus className="w-4 h-4" /> Add Note</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Add Manager Note</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium">Type</label>
                        <select value={newNote.note_type} onChange={e => setNewNote({ ...newNote, note_type: e.target.value, is_recognition: e.target.value === 'recognition' })} className="w-full mt-1 p-2 rounded-lg border">
                          <option value="general">General</option>
                          <option value="coaching">Coaching</option>
                          <option value="review">Performance Review</option>
                          <option value="recognition">Recognition / Award</option>
                        </select>
                      </div>
                      {newNote.is_recognition && <input placeholder="Award title (e.g. Top Closer)" value={newNote.award_title} onChange={e => setNewNote({ ...newNote, award_title: e.target.value })} className="w-full p-2 rounded-lg border" />}
                      <Textarea value={newNote.content} onChange={e => setNewNote({ ...newNote, content: e.target.value })} rows={3} placeholder="Note content..." />
                      <Button onClick={handleAddNote} className="w-full" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}>Save Note</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {coachingNotes.length === 0 ? (
              <p className="text-sm" style={{ color: 'rgba(26,26,26,0.4)' }}>No manager notes yet.</p>
            ) : (
              <div className="space-y-2">
                {coachingNotes.map(n => (
                  <div key={n.id} className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.05)' }}>
                    <p className="text-sm" style={{ color: 'rgba(26,26,26,0.8)' }}>{n.content}</p>
                    <p className="text-xs mt-1" style={{ color: 'rgba(26,26,26,0.4)' }}>— {n.author_name} · {new Date(n.created_date).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Training Modules */}
        <Card style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.2)' }}>
          <CardHeader><CardTitle className="text-lg" style={{ color: '#1A1A1A' }}>Training Completed</CardTitle></CardHeader>
          <CardContent>
            {training.length === 0 ? (
              <p className="text-sm" style={{ color: 'rgba(26,26,26,0.4)' }}>No training completions recorded.</p>
            ) : (
              <div className="space-y-2">
                {training.map(t => (
                  <div key={t.id} className="flex items-center justify-between p-2 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.05)' }}>
                    <span className="text-sm" style={{ color: '#1A1A1A' }}>{t.module_id || 'Module'}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: t.passed ? '#16a34a' : '#ef4444' }}>{t.passed ? '✓ Passed' : '✗ Failed'}</span>
                      {t.score != null && <span className="text-xs font-bold" style={{ color: '#B8956A' }}>{Math.round(t.score)}%</span>}
                    </div>
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
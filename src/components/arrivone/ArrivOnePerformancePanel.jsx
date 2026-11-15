import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Check, CheckCircle2, Clock, Loader2, PhoneCall, Sparkles, Users } from 'lucide-react';
import { arrivOne } from '@/lib/arrivOneClient';

const Stat = ({ label, value, icon: Icon }) => (
  <div className="rounded-xl border border-[#1A1A1A]/10 bg-white p-3">
    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[#1A1A1A]/45">
      <Icon className="h-3.5 w-3.5 text-[#B8956A]" /> {label}
    </div>
    <p className="mt-1 font-serif text-2xl text-[#1A1A1A]">{value}</p>
  </div>
);

/** Sales quality: attempts vs conversations, per-rep activity and the review queue. */
export default function ArrivOnePerformancePanel() {
  const [metrics, setMetrics] = useState(null);
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState({});
  const [saving, setSaving] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [m, q] = await Promise.all([arrivOne.metrics(), arrivOne.reviewQueue()]);
      setMetrics(m);
      setQueue(q);
    } catch (err) {
      setError(err.message || 'Performance data could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const correct = async (analysis) => {
    const draft = editing[analysis.id];
    if (!draft) return;
    setSaving(analysis.id);
    try {
      await arrivOne.correctAnalysis({
        analysis_id: analysis.id,
        summary: draft,
        note: 'Rep corrected the generated summary',
      });
      toast.success('Summary updated');
      setEditing((prev) => ({ ...prev, [analysis.id]: '' }));
      await load();
    } catch (err) {
      toast.error(err.message || 'That correction could not be saved.');
    } finally {
      setSaving('');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-[#1A1A1A]/60">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading call activity…
        </CardContent>
      </Card>
    );
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  const totals = metrics?.totals || {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Attempts" value={totals.attempts || 0} icon={PhoneCall} />
        <Stat label="Conversations" value={totals.meaningful_conversations || 0} icon={CheckCircle2} />
        <Stat label="Unique prospects" value={totals.unique_prospects || 0} icon={Users} />
        <Stat label="Talk minutes" value={totals.total_minutes || 0} icon={Clock} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="No answer" value={totals.no_answer || 0} icon={Clock} />
        <Stat label="Cellphone dial-out" value={totals.cell_ivr_attempts || 0} icon={PhoneCall} />
        <Stat label="In-app dialer" value={totals.in_app_attempts || 0} icon={PhoneCall} />
        <Stat label="Follow-ups overdue" value={totals.follow_ups_overdue || 0} icon={Clock} />
      </div>

      {metrics?.note && <p className="text-[11px] text-[#1A1A1A]/45">{metrics.note}</p>}

      {(metrics?.by_rep || []).length > 0 && (
        <Card className="border-[#B8956A]/20">
          <CardHeader>
            <CardTitle className="text-base text-[#1A1A1A]">By Media Partner</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[#1A1A1A]/45">
                  <th className="py-1">Rep</th>
                  <th className="py-1">Attempts</th>
                  <th className="py-1">Conversations</th>
                  <th className="py-1">No answer</th>
                  <th className="py-1">Minutes</th>
                  <th className="py-1">Method</th>
                </tr>
              </thead>
              <tbody>
                {metrics.by_rep.map((row) => (
                  <tr key={row.rep} className="border-t border-[#1A1A1A]/5 text-[#1A1A1A]/75">
                    <td className="py-2">{row.rep}</td>
                    <td className="py-2">{row.attempts}</td>
                    <td className="py-2">{row.conversations}</td>
                    <td className="py-2">{row.no_answer}</td>
                    <td className="py-2">{row.minutes}</td>
                    <td className="py-2 text-[11px] text-[#1A1A1A]/50">
                      {row.cell_ivr} cell · {row.in_app} app
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {(metrics?.top_objections || []).length > 0 && (
        <Card className="border-[#B8956A]/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-[#1A1A1A]">
              <Sparkles className="h-4 w-4 text-[#B8956A]" /> Recurring objections
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {metrics.top_objections.map((item) => (
              <Badge key={item.objection} variant="outline" className="text-[11px]">
                {item.objection} · {item.count}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="border-[#B8956A]/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-[#1A1A1A]">
            <Check className="h-4 w-4 text-[#B8956A]" /> Call summaries needing review
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(queue?.unreviewed || []).length === 0 && (
            <p className="text-sm text-[#1A1A1A]/55">No unreviewed summaries right now.</p>
          )}
          {(queue?.unreviewed || []).map((analysis) => (
            <div key={analysis.id} className="rounded-xl border border-[#1A1A1A]/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-[#1A1A1A]">
                  {analysis.prospect_name || 'Prospect'} · {analysis.rep_name || 'Rep'}
                </p>
                <Badge variant="outline" className="text-[10px]">
                  {analysis.source === 'recording' ? 'Consented recording' : 'Rep note'}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-[#1A1A1A]/70">{analysis.summary}</p>
              {analysis.suggested_outcome && (
                <p className="mt-1 text-xs text-[#1A1A1A]/50">Suggested outcome: {analysis.suggested_outcome}</p>
              )}
              <Textarea
                value={editing[analysis.id] ?? analysis.summary ?? ''}
                onChange={(event) => setEditing((prev) => ({ ...prev, [analysis.id]: event.target.value }))}
                rows={2}
                className="mt-2 text-sm"
              />
              <Button
                size="sm"
                className="mt-2 bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
                onClick={() => correct(analysis)}
                disabled={saving === analysis.id || !editing[analysis.id]}
              >
                {saving === analysis.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save correction
              </Button>
            </div>
          ))}

          {(queue?.overdue_follow_ups || []).length > 0 && (
            <div className="rounded-xl bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-900">Overdue AI follow-ups</p>
              <ul className="mt-1 space-y-1 text-xs text-amber-900/80">
                {queue.overdue_follow_ups.map((task) => (
                  <li key={task.id}>
                    {task.contact_name || 'Contact'} — due {String(task.activity_date || '').slice(0, 10)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
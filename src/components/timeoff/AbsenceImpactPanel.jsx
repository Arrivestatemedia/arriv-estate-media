import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Phone, CalendarDays, Mail, Briefcase, Users, Sparkles, Loader2, ChevronDown, ChevronUp } from "lucide-react";

export default function AbsenceImpactPanel({ salesMemberId, startDate, endDate, compact }) {
  const [impact, setImpact] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [expanded, setExpanded] = useState(!compact);
  const [showAi, setShowAi] = useState(false);

  const loadImpact = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageTimeOff", { action: "get_pto_impact", sales_member_id: salesMemberId, start_date: startDate, end_date: endDate });
      setImpact(res.data || res);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const loadAi = async () => {
    setAiLoading(true);
    try {
      const res = await base44.functions.invoke("manageTimeOff", { action: "get_ai_absence_recommendations", sales_member_id: salesMemberId, start_date: startDate, end_date: endDate });
      setRecommendations((res.data || res).recommendations);
      setShowAi(true);
    } catch (err) { console.error(err); }
    setAiLoading(false);
  };

  useEffect(() => {
    if (expanded && !impact) loadImpact();
  }, [expanded]);

  if (!expanded) {
    return (
      <button onClick={() => setExpanded(true)} className="text-xs text-[#2563EB] hover:underline flex items-center gap-1">
        <ChevronDown className="w-3 h-3" /> View operational impact
      </button>
    );
  }

  const s = impact?.summary;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900">Operational Impact</h4>
        {compact && (
          <button onClick={() => setExpanded(false)} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
            <ChevronUp className="w-3 h-3" /> Hide
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Analyzing scheduled work...</div>
      ) : impact ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <ImpactStat icon={CalendarDays} label="Follow-ups" value={s?.follow_up_count || 0} color="#2563EB" />
            <ImpactStat icon={Phone} label="Calls" value={s?.call_count || 0} color="#059669" />
            <ImpactStat icon={Users} label="Meetings" value={s?.meeting_count || 0} color="#7C3AED" />
            <ImpactStat icon={Mail} label="Emails" value={s?.email_count || 0} color="#D97706" />
            <ImpactStat icon={Briefcase} label="Open Deals" value={s?.open_deal_count || 0} color="#DC2626" />
            <ImpactStat icon={Users} label="Others Off" value={s?.others_off_count || 0} color="#6B7280" />
          </div>

          {s?.others_off_count > 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2 border border-amber-200">
              {s.others_off_count} other team member(s) also off during this period — coverage may be limited.
            </div>
          )}

          {!showAi ? (
            <Button size="sm" variant="outline" onClick={loadAi} disabled={aiLoading} className="text-xs h-8">
              {aiLoading ? <><Loader2 className="w-3 h-3 animate-spin" /> Analyzing...</> : <><Sparkles className="w-3 h-3" /> Get AI Recommendations</>}
            </Button>
          ) : (
            <div className="space-y-2">
              {recommendations?.summary && <p className="text-xs text-slate-600 italic">{recommendations.summary}</p>}
              {recommendations?.reschedule?.length > 0 && <AiSection title="Reschedule" items={recommendations.reschedule} color="text-blue-600" />}
              {recommendations?.delegate?.length > 0 && <AiSection title="Delegate" items={recommendations.delegate} color="text-purple-600" />}
              {recommendations?.coverage?.length > 0 && <AiSection title="Coverage Needed" items={recommendations.coverage} color="text-amber-600" />}
              {recommendations?.high_priority?.length > 0 && <AiSection title="High Priority" items={recommendations.high_priority} color="text-red-600" />}
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-slate-400">Unable to load impact data.</p>
      )}
    </div>
  );
}

function ImpactStat({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-200">
      <Icon className="w-3.5 h-3.5" style={{ color }} />
      <div>
        <p className="text-lg font-bold text-slate-900 leading-none">{value}</p>
        <p className="text-[10px] text-slate-400">{label}</p>
      </div>
    </div>
  );
}

function AiSection({ title, items, color }) {
  return (
    <div>
      <p className={`text-xs font-semibold ${color} mb-1`}>{title}</p>
      <ul className="space-y-1">
        {items.map((item, i) => <li key={i} className="text-xs text-slate-600 flex gap-1.5"><span className="text-slate-300">•</span>{item}</li>)}
      </ul>
    </div>
  );
}
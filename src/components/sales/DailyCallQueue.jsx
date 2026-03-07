import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Clock, Sparkles, ChevronDown, ChevronUp, Loader2, CheckCircle2, RefreshCw, Calendar, Brain } from "lucide-react";
import { format, formatDistanceToNow, addDays, isAfter, startOfDay } from "date-fns";

const REALTOR_WINDOWS = [
  { label: "8:00–9:00 AM", hour: 8 },
  { label: "12:00–1:00 PM", hour: 12 },
  { label: "5:00–7:00 PM", hour: 17 },
  { label: "9:00–10:00 AM", hour: 9 },
  { label: "1:00–2:00 PM", hour: 13 },
];

function getBestTime(contact) {
  const notes = contact.activities.map(a => (a.notes || "").toLowerCase()).join(" ");
  if (notes.includes("morning") || notes.includes("9am") || notes.includes("8am") || notes.includes("early")) return "8:00–9:00 AM";
  if (notes.includes("lunch") || notes.includes("noon") || notes.includes("12pm") || notes.includes("midday")) return "12:00–1:00 PM";
  if (notes.includes("evening") || notes.includes("5pm") || notes.includes("6pm") || notes.includes("after showing") || notes.includes("after 4") || notes.includes("after 5")) return "5:00–7:00 PM";
  if (notes.includes("afternoon") || notes.includes("2pm") || notes.includes("3pm")) return "1:00–2:00 PM";
  const today = new Date().getDay();
  if (today === 0 || today === 6 || today === 5) return "Mon–Wed 8:00–9:00 AM";
  return "5:00–7:00 PM";
}

function getPriorityLabel(urgency) {
  if (urgency === "high") return { label: "High", color: "#ef4444", bg: "rgba(239,68,68,0.1)" };
  if (urgency === "medium") return { label: "Medium", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" };
  if (urgency === "low") return { label: "Low", color: "#6b7280", bg: "rgba(107,114,128,0.1)" };
  return { label: "Paused", color: "#9ca3af", bg: "rgba(156,163,175,0.08)" };
}

// Build a condensed "learned patterns" summary from past QueueInsights for this rep
function buildLearnedContext(insights) {
  if (!insights || insights.length === 0) return "";

  const byOutcome = {};
  insights.forEach(i => {
    if (!byOutcome[i.outcome]) byOutcome[i.outcome] = [];
    byOutcome[i.outcome].push(i);
  });

  const lines = [];
  lines.push(`LEARNED PATTERNS FROM ${insights.length} PAST OUTCOMES:`);

  if (byOutcome.warm_waiting?.length) {
    lines.push(`- ${byOutcome.warm_waiting.length} contacts said "I'll reach out when ready" — these needed avg 3+ weeks of space before re-engaging.`);
  }
  if (byOutcome.interested?.length) {
    lines.push(`- ${byOutcome.interested.length} contacts converted to warm leads — these typically had 2-3 prior touchpoints with pricing/listing mentions.`);
  }
  if (byOutcome.not_interested?.length) {
    lines.push(`- ${byOutcome.not_interested.length} contacts went cold — avoid calling too frequently after a firm "not now".`);
  }
  if (byOutcome.no_answer?.length) {
    lines.push(`- ${byOutcome.no_answer.length} no-answer patterns — after 3+ no answers, switch to text/email cadence.`);
  }
  if (byOutcome.left_voicemail?.length) {
    lines.push(`- ${byOutcome.left_voicemail.length} voicemails left — voicemails rarely convert; use sparingly.`);
  }
  if (byOutcome.call_later?.length) {
    lines.push(`- ${byOutcome.call_later.length} "call back later" requests — these typically close within 1-2 follow-ups.`);
  }

  // Surface any pattern_tags
  const allTags = insights.flatMap(i => i.pattern_tags || []);
  const tagCounts = {};
  allTags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topTags.length > 0) {
    lines.push(`- Recurring themes: ${topTags.map(([t, c]) => `${t} (${c}x)`).join(", ")}`);
  }

  return lines.join("\n");
}

// AI analysis — now receives learned context from past outcomes
async function analyzeContact(contact, learnedContext) {
  const historyText = contact.activities
    .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
    .slice(0, 10)
    .map(a => `${format(new Date(a.activity_date), "MMM d, yyyy")} [${a.activity_type}]: ${a.notes}`)
    .join("\n");

  const today = format(new Date(), "MMM d, yyyy");

  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `You are an AI sales intelligence assistant for ARRIV, a real estate media company. Analyze this contact's full interaction history and determine when the rep should next reach out.

Today's date: ${today}
Contact: ${contact.name}${contact.company ? ` (${contact.company})` : ""}

Full interaction history (newest first):
${historyText || "No prior contact"}

${learnedContext ? `\n${learnedContext}\n\nUse the learned patterns above to inform your timing recommendations. For example, if past warm-waiting contacts needed 3 weeks, apply that here.` : ""}

Based on the notes and learned patterns, determine:
1. The appropriate next contact date (be smart — if they said "call me in a few weeks", "I'll reach out when ready", or gave any warm/positive signal, give them space. If cold/no answer, re-contact sooner. If asked not to be called, pause 60+ days.)
2. Urgency level: "high" (overdue or hot lead), "medium" (due soon, warm), "low" (cool, not urgent), "skip" (not appropriate to call now — they'll reach out)
3. A brief reason explaining your recommendation (1 sentence, specific to their notes)
4. A suggested call opener tailored to their specific context

Respond ONLY with valid JSON:
{
  "next_contact_date": "YYYY-MM-DD",
  "urgency": "high" | "medium" | "low" | "skip",
  "reason": "string",
  "suggested_opener": "string",
  "pattern_tags": ["tag1", "tag2"]
}`,
    response_json_schema: {
      type: "object",
      properties: {
        next_contact_date: { type: "string" },
        urgency: { type: "string" },
        reason: { type: "string" },
        suggested_opener: { type: "string" },
        pattern_tags: { type: "array", items: { type: "string" } }
      }
    }
  });

  return res;
}

function LeadCard({ contact, rank, repName, salesMemberId, aiAnalysis, onOutcomeLogged }) {
  const [expanded, setExpanded] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [script, setScript] = useState(aiAnalysis?.suggested_opener || null);
  const [loggingOutcome, setLoggingOutcome] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [saved, setSaved] = useState(false);

  const priority = getPriorityLabel(aiAnalysis?.urgency || "medium");
  const bestTime = getBestTime(contact);
  const lastActivity = contact.past[0];
  const nextContactDate = aiAnalysis?.next_contact_date ? new Date(aiAnalysis.next_contact_date) : null;

  const generateScript = async () => {
    setGeneratingScript(true);
    setScript(null);
    try {
      const historySnippet = contact.past.slice(0, 4).map(a =>
        `${format(new Date(a.activity_date), "MMM d")}: ${a.activity_type} — ${a.notes.slice(0, 120)}`
      ).join("\n");

      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `You are the ARRIV AI Sales Coach. Generate a personalized call opener.

Rep name: ${repName || "Brad"}
Contact: ${contact.name}${contact.company ? `, ${contact.company}` : ""}
AI insight: ${aiAnalysis?.reason || "follow up"}
Urgency: ${aiAnalysis?.urgency || "medium"}
Best call time: ${bestTime}

Recent activity history:
${historySnippet || "No prior contact logged"}

Output ONLY:
1. **Opener** (exact first thing to say — 2-3 sentences, natural, not salesy)
2. **If no answer** — voicemail (1-2 sentences) + follow-up text (1 sentence)
3. **If they answer** — 2-3 possible conversation paths and how to handle each

Keep it short, direct, ARRIV-branded. Never offer discounts. If they want to book, say "I'll connect you with our owner Brad."`,
      });

      setScript(typeof res === "string" ? res : res?.text || String(res));
    } catch {
      setScript("Failed to generate script. Try again.");
    } finally {
      setGeneratingScript(false);
    }
  };

  const logOutcome = async () => {
    if (!outcome || !outcomeNotes) return;
    setLoggingOutcome(true);

    const salesMemberEmail = localStorage.getItem('sales_member_email');
    const sid = salesMemberId || localStorage.getItem('sales_member_id');

    let nextFollowUp = null;
    let nextNotes = "";
    const now = new Date();

    if (outcome === "no_answer") {
      nextFollowUp = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      nextNotes = `Follow-up text after missed call to ${contact.name}`;
    } else if (outcome === "call_later") {
      nextFollowUp = addDays(now, 1);
      nextNotes = `Follow-up call to ${contact.name} — asked to call back`;
    } else if (outcome === "interested") {
      nextFollowUp = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      nextNotes = `WARM LEAD — ${contact.name} showed interest. Notify Brad for handoff.`;
    } else if (outcome === "not_interested") {
      nextFollowUp = addDays(now, 30);
      nextNotes = `30-day pause. ${contact.name} not interested at this time.`;
    } else if (outcome === "warm_waiting") {
      nextFollowUp = addDays(now, 21);
      nextNotes = `Warm lead — ${contact.name} will reach out when ready. Check back in 3 weeks.`;
    } else if (outcome === "left_voicemail") {
      nextFollowUp = addDays(now, 3);
      nextNotes = `Left voicemail for ${contact.name}. Follow up in 3 days.`;
    }

    try {
      // Log the call activity
      await base44.entities.ActivityLog.create({
        activity_type: "call",
        contact_name: contact.name,
        contact_email: contact.email,
        company_name: contact.company,
        activity_date: new Date().toISOString(),
        notes: `[Queue Call] Outcome: ${outcome.replace(/_/g, " ")} — ${outcomeNotes}`,
        sales_member_id: sid,
        sales_member_email: salesMemberEmail,
      });

      // Schedule next step
      if (nextFollowUp) {
        await base44.entities.ActivityLog.create({
          activity_type: outcome === "no_answer" ? "task" : "call",
          contact_name: contact.name,
          contact_email: contact.email,
          company_name: contact.company,
          activity_date: nextFollowUp.toISOString(),
          notes: nextNotes,
          sales_member_id: sid,
          sales_member_email: salesMemberEmail,
        });
      }

      // 🧠 SAVE INSIGHT — this is what makes the system grow smarter over time
      await base44.entities.QueueInsight.create({
        sales_member_id: sid,
        contact_key: contact.key,
        contact_name: contact.name,
        outcome,
        outcome_notes: outcomeNotes,
        ai_recommendation: aiAnalysis?.reason || "",
        next_contact_date: nextFollowUp ? format(nextFollowUp, "yyyy-MM-dd") : null,
        pattern_tags: aiAnalysis?.pattern_tags || [],
        logged_at: new Date().toISOString(),
      });

      setSaved(true);
      setLoggingOutcome(false);
      setOutcome("");
      setOutcomeNotes("");
      if (onOutcomeLogged) onOutcomeLogged();
    } catch {
      setLoggingOutcome(false);
    }
  };

  return (
    <Card style={{ borderColor: rank === 1 ? '#B8956A' : 'rgba(184,149,106,0.2)', borderWidth: rank === 1 ? '2px' : '1px' }}>
      <CardContent className="pt-4 pb-4">
        <button className="w-full text-left" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ backgroundColor: priority.bg, color: priority.color }}>
                {rank}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold" style={{ color: '#1A1A1A' }}>{contact.name}</p>
                  {contact.company && <span className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>{contact.company}</span>}
                  <Badge style={{ backgroundColor: priority.bg, color: priority.color, border: 'none', fontSize: '11px' }}>
                    {priority.label} Priority
                  </Badge>
                  {saved && <Badge style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981', border: 'none', fontSize: '11px' }}>✓ Logged</Badge>}
                </div>
                <div className="flex flex-wrap gap-3 mt-1 text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Best time: {bestTime}</span>
                  {lastActivity && <span>Last touch: {formatDistanceToNow(new Date(lastActivity.activity_date), { addSuffix: true })}</span>}
                  {nextContactDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Suggested: {format(nextContactDate, "MMM d")}
                    </span>
                  )}
                </div>
                {aiAnalysis?.reason && (
                  <p className="text-xs mt-1 italic flex items-start gap-1" style={{ color: 'rgba(26,26,26,0.55)' }}>
                    <Brain className="w-3 h-3 shrink-0 mt-0.5" style={{ color: '#B8956A' }} />
                    {aiAnalysis.reason}
                  </p>
                )}
              </div>
            </div>
            {expanded ? <ChevronUp className="w-4 h-4 mt-1 shrink-0 opacity-40" /> : <ChevronDown className="w-4 h-4 mt-1 shrink-0 opacity-40" />}
          </div>
        </button>

        {expanded && (
          <div className="mt-4 pt-4 border-t space-y-4" style={{ borderColor: 'rgba(184,149,106,0.15)' }}>

            {contact.past.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'rgba(26,26,26,0.4)' }}>Recent History</p>
                <div className="space-y-1">
                  {contact.past.slice(0, 4).map(a => (
                    <div key={a.id} className="text-xs p-2 rounded-lg" style={{ backgroundColor: 'rgba(0,0,0,0.03)' }}>
                      <span className="font-medium capitalize">{a.activity_type}</span>
                      <span className="mx-1" style={{ color: 'rgba(26,26,26,0.4)' }}>·</span>
                      <span style={{ color: 'rgba(26,26,26,0.5)' }}>{format(new Date(a.activity_date), "MMM d")}</span>
                      <span className="mx-1" style={{ color: 'rgba(26,26,26,0.4)' }}>·</span>
                      <span style={{ color: '#1A1A1A' }}>{a.notes.slice(0, 100)}{a.notes.length > 100 ? "..." : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              {!script ? (
                <Button size="sm" onClick={generateScript} disabled={generatingScript} className="w-full gap-2" style={{ backgroundColor: '#1A1A1A', color: '#fff' }}>
                  {generatingScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generatingScript ? "Generating opener..." : "Generate opener"}
                </Button>
              ) : (
                <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: 'rgba(184,149,106,0.08)', border: '1px solid rgba(184,149,106,0.25)' }}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#B8956A' }}>ARRIV Coach</p>
                    <button onClick={generateScript} className="text-xs flex items-center gap-1" style={{ color: 'rgba(26,26,26,0.4)' }}>
                      <RefreshCw className="w-3 h-3" /> Regenerate
                    </button>
                  </div>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: '#1A1A1A' }}>{script}</div>
                </div>
              )}
            </div>

            {!saved ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.4)' }}>Log Outcome</p>
                <Select value={outcome} onValueChange={setOutcome}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="What happened?" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_answer">No answer (schedule text)</SelectItem>
                    <SelectItem value="call_later">Busy — call back tomorrow</SelectItem>
                    <SelectItem value="interested">Interested — notify Brad</SelectItem>
                    <SelectItem value="warm_waiting">Warm — they'll reach out when ready (3 weeks)</SelectItem>
                    <SelectItem value="not_interested">Not interested — pause 30 days</SelectItem>
                    <SelectItem value="left_voicemail">Left voicemail (follow up in 3 days)</SelectItem>
                  </SelectContent>
                </Select>
                {outcome && (
                  <>
                    <Textarea
                      placeholder="Quick notes..."
                      value={outcomeNotes}
                      onChange={e => setOutcomeNotes(e.target.value)}
                      rows={2}
                      className="text-sm"
                    />
                    <Button size="sm" onClick={logOutcome} disabled={loggingOutcome || !outcomeNotes} className="w-full" style={{ backgroundColor: '#B8956A', color: '#fff' }}>
                      {loggingOutcome ? "Logging..." : "Log & Schedule Next Step"}
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm" style={{ color: '#10b981' }}>
                <CheckCircle2 className="w-4 h-4" />
                Outcome logged — AI will learn from this for next time
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DailyCallQueue({ salesMemberId, salesMemberEmail, repName }) {
  const [contacts, setContacts] = useState([]);
  const [aiAnalyses, setAiAnalyses] = useState({});
  const [learnedContext, setLearnedContext] = useState("");
  const [insightCount, setInsightCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadQueue();
  }, [salesMemberId, salesMemberEmail, refreshKey]);

  const loadQueue = async () => {
    setLoading(true);
    setAiAnalyses({});

    try {
      const sid = salesMemberId || localStorage.getItem('sales_member_id');
      const sem = salesMemberEmail || localStorage.getItem('sales_member_email');

      // Load activity logs AND past QueueInsights in parallel
      const [all, pastInsights] = await Promise.all([
        base44.entities.ActivityLog.list('-activity_date', 500),
        sid ? base44.entities.QueueInsight.filter({ sales_member_id: sid }, '-logged_at', 200) : Promise.resolve([])
      ]);

      // Build learned context from accumulated insights
      const context = buildLearnedContext(pastInsights);
      setLearnedContext(context);
      setInsightCount(pastInsights.length);

      const mine = all.filter(a =>
        a.sales_member_id === sid ||
        a.sales_member_email === sem ||
        a.created_by === sem
      );

      const contactMap = {};
      mine.forEach(a => {
        const key = a.contact_email || a.contact_name;
        if (!key) return;
        if (!contactMap[key]) {
          contactMap[key] = { key, name: a.contact_name || '', email: a.contact_email || '', company: a.company_name || '', activities: [], past: [], upcoming: [] };
        }
        contactMap[key].activities.push(a);
        if (new Date(a.activity_date) > new Date()) {
          contactMap[key].upcoming.push(a);
        } else {
          contactMap[key].past.push(a);
        }
        if (!contactMap[key].name && a.contact_name) contactMap[key].name = a.contact_name;
        if (!contactMap[key].company && a.company_name) contactMap[key].company = a.company_name;
      });

      const filtered = Object.values(contactMap).filter(c => {
        const name = c.name?.trim();
        if (!name) return false;
        if (/^\+?\d[\d\s\-().]+$/.test(name)) return false;
        if (/^\d+$/.test(name)) return false;
        return c.past.length > 0;
      });

      setContacts(filtered);
      setLoading(false);

      // Run AI analysis on all contacts in parallel, passing learned context
      setAnalyzing(true);
      const analyses = {};
      await Promise.all(
        filtered.map(async (contact) => {
          try {
            const result = await analyzeContact(contact, context);
            analyses[contact.key] = result;
          } catch (e) {
            console.error(`Failed to analyze ${contact.name}`, e);
          }
        })
      );
      setAiAnalyses(analyses);
      setAnalyzing(false);

    } catch (e) {
      console.error(e);
      setLoading(false);
      setAnalyzing(false);
    }
  };

  const today = startOfDay(new Date());

  const dueContacts = contacts
    .filter(c => {
      const analysis = aiAnalyses[c.key];
      if (!analysis) return false;
      if (analysis.urgency === "skip") return false;
      const nextDate = analysis.next_contact_date ? startOfDay(new Date(analysis.next_contact_date)) : null;
      return !nextDate || !isAfter(nextDate, today);
    })
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return (order[aiAnalyses[a.key]?.urgency] ?? 3) - (order[aiAnalyses[b.key]?.urgency] ?? 3);
    });

  const upcomingContacts = contacts
    .filter(c => {
      const analysis = aiAnalyses[c.key];
      if (!analysis || analysis.urgency === "skip") return false;
      const nextDate = analysis.next_contact_date ? startOfDay(new Date(analysis.next_contact_date)) : null;
      return nextDate && isAfter(nextDate, today);
    })
    .sort((a, b) => new Date(aiAnalyses[a.key]?.next_contact_date) - new Date(aiAnalyses[b.key]?.next_contact_date))
    .slice(0, 5);

  const todayLabel = format(new Date(), "EEEE, MMMM d");
  const sid = salesMemberId || localStorage.getItem('sales_member_id');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#B8956A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (analyzing && Object.keys(aiAnalyses).length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: '#1A1A1A' }}>Smart Call Queue</h2>
          <p className="text-sm" style={{ color: 'rgba(26,26,26,0.5)' }}>{todayLabel}</p>
        </div>
        <div className="p-6 rounded-xl text-center" style={{ backgroundColor: 'rgba(184,149,106,0.08)', border: '1px solid rgba(184,149,106,0.2)' }}>
          <Brain className="w-8 h-8 mx-auto mb-3 animate-pulse" style={{ color: '#B8956A' }} />
          <p className="font-medium" style={{ color: '#1A1A1A' }}>AI is analyzing your contacts...</p>
          <p className="text-sm mt-1" style={{ color: 'rgba(26,26,26,0.5)' }}>
            Reading notes, sentiment, timing
            {insightCount > 0 ? `, and ${insightCount} learned patterns from your history.` : "."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: '#1A1A1A' }}>Smart Call Queue</h2>
          <p className="text-sm" style={{ color: 'rgba(26,26,26,0.5)' }}>
            {todayLabel} · {dueContacts.length} due today
            {analyzing && <span className="ml-2 text-xs" style={{ color: '#B8956A' }}>· AI analyzing...</span>}
          </p>
          {insightCount > 0 && (
            <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'rgba(26,26,26,0.4)' }}>
              <Brain className="w-3 h-3" style={{ color: '#B8956A' }} />
              Learning from {insightCount} past outcomes
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setRefreshKey(k => k + 1)} className="gap-2" style={{ borderColor: 'rgba(184,149,106,0.4)', color: 'rgba(26,26,26,0.6)' }}>
          <RefreshCw className="w-3 h-3" />
          Refresh
        </Button>
      </div>

      {dueContacts.length === 0 ? (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <Phone className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium" style={{ color: 'rgba(26,26,26,0.5)' }}>No contacts due today</p>
            <p className="text-sm mt-1" style={{ color: 'rgba(26,26,26,0.4)' }}>The AI has determined all contacts are best reached on future dates.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="p-3 rounded-xl text-sm" style={{ backgroundColor: 'rgba(184,149,106,0.08)', border: '1px solid rgba(184,149,106,0.2)' }}>
            <p style={{ color: 'rgba(26,26,26,0.6)' }}>
              <span className="font-semibold" style={{ color: '#1A1A1A' }}>Start with:</span>{" "}
              <span className="font-semibold" style={{ color: '#B8956A' }}>{dueContacts[0]?.name}</span>
              {dueContacts[0] && `. Best time: ${getBestTime(dueContacts[0])}.`}
            </p>
          </div>
          {dueContacts.map((contact, idx) => (
            <LeadCard
              key={contact.key}
              contact={contact}
              rank={idx + 1}
              repName={repName}
              salesMemberId={sid}
              aiAnalysis={aiAnalyses[contact.key]}
              onOutcomeLogged={() => setRefreshKey(k => k + 1)}
            />
          ))}
        </div>
      )}

      {upcomingContacts.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'rgba(26,26,26,0.4)' }}>Coming Up</p>
          <div className="space-y-2">
            {upcomingContacts.map(contact => {
              const analysis = aiAnalyses[contact.key];
              const nextDate = analysis?.next_contact_date ? new Date(analysis.next_contact_date) : null;
              const priority = getPriorityLabel(analysis?.urgency || "low");
              return (
                <div key={contact.key} className="flex items-center justify-between px-3 py-2.5 rounded-lg" style={{ backgroundColor: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: priority.color }} />
                    <span className="font-medium text-sm truncate" style={{ color: '#1A1A1A' }}>{contact.name}</span>
                    {contact.company && <span className="text-xs truncate" style={{ color: 'rgba(26,26,26,0.4)' }}>{contact.company}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {nextDate && <span className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>{format(nextDate, "MMM d")}</span>}
                    <Badge style={{ backgroundColor: priority.bg, color: priority.color, border: 'none', fontSize: '10px' }}>{priority.label}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
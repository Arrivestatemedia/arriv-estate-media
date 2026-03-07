import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Clock, Sparkles, ChevronDown, ChevronUp, Loader2, CheckCircle2, RefreshCw, Calendar, Brain, Pencil } from "lucide-react";
import { format, formatDistanceToNow, addDays, isAfter, startOfDay, parseISO } from "date-fns";

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

function buildLearnedContext(insights) {
  if (!insights || insights.length === 0) return "";
  const byOutcome = {};
  insights.forEach(i => {
    if (!byOutcome[i.outcome]) byOutcome[i.outcome] = [];
    byOutcome[i.outcome].push(i);
  });
  const lines = [`LEARNED PATTERNS FROM ${insights.length} PAST OUTCOMES:`];
  if (byOutcome.warm_waiting?.length) lines.push(`- ${byOutcome.warm_waiting.length} contacts said "I'll reach out when ready" — needed avg 3+ weeks of space.`);
  if (byOutcome.interested?.length) lines.push(`- ${byOutcome.interested.length} contacts converted to warm leads after 2-3 touchpoints with pricing/listing mentions.`);
  if (byOutcome.not_interested?.length) lines.push(`- ${byOutcome.not_interested.length} contacts went cold — avoid frequent follow-ups after a firm "not now".`);
  if (byOutcome.no_answer?.length) lines.push(`- ${byOutcome.no_answer.length} no-answer patterns — after 3+ no answers, switch to text/email cadence.`);
  if (byOutcome.left_voicemail?.length) lines.push(`- ${byOutcome.left_voicemail.length} voicemails left — voicemails rarely convert; use sparingly.`);
  if (byOutcome.call_later?.length) lines.push(`- ${byOutcome.call_later.length} "call back later" — typically close within 1-2 follow-ups.`);
  const allTags = insights.flatMap(i => i.pattern_tags || []);
  const tagCounts = {};
  allTags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topTags.length > 0) lines.push(`- Recurring themes: ${topTags.map(([t, c]) => `${t} (${c}x)`).join(", ")}`);
  return lines.join("\n");
}

// AI analysis — used ONLY when no scheduled follow-up exists yet
// Searches the web for the contact and uses all available intel to set a precise, permanent date
async function analyzeContact(contact, learnedContext) {
  const historyText = contact.activities
    .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
    .slice(0, 15)
    .map(a => `${format(new Date(a.activity_date), "MMM d, yyyy")} [${a.activity_type}]: ${a.notes}`)
    .join("\n");

  const today = format(new Date(), "MMM d, yyyy");
  const dayOfWeek = new Date().getDay();
  const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dayOfWeek];

  // Search web for contact intel in parallel with nothing else blocking
  const searchQuery = [
    contact.name,
    contact.company,
    "realtor",
    "real estate"
  ].filter(Boolean).join(" ");

  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `You are an elite AI sales intelligence agent for ARRIV, a real estate photography & media company. Your task is to determine ONE precise follow-up date and time for this realtor contact. This decision is PERMANENT — it will be saved and the rep will follow it. Be extremely deliberate.

=== TODAY ===
Date: ${today} (${dayName})

=== CONTACT ===
Name: ${contact.name}
Company/Brokerage: ${contact.company || "Unknown"}
Email: ${contact.email || "Unknown"}

=== FULL INTERACTION HISTORY (newest first) ===
${historyText || "No prior contact logged"}

${learnedContext ? `\n=== THIS REP'S LEARNED PATTERNS FROM PAST OUTCOMES ===\n${learnedContext}\n` : ""}

=== REALTOR BEHAVIORAL SCIENCE (apply rigorously) ===
BEST DAYS TO REACH REALTORS (ranked):
1. Tuesday & Wednesday — mid-week, no Monday catch-up rush, not pre-weekend
2. Thursday — still effective, slightly lower response than Tue/Wed
3. Monday after 10am — avoid early morning catch-up chaos
4. Avoid: Friday afternoons (mentally checked out), Sat/Sun (family/showing time unless notes say otherwise)

BEST TIME WINDOWS (ranked by response rate):
1. 8:00–9:00 AM — before their first showing, fresh start, high answer rate
2. 12:00–1:00 PM — lunch gap between showings, often available
3. 5:00–7:00 PM — post-showing wind-down, reflective, good for warm conversations
4. 9:30–10:30 AM — secondary morning window if 8am fails

CADENCE RULES (follow strictly):
- Warm/interested → 2-3 business days, morning slot (urgency: high)
- Said "call me in a few weeks" → exactly 3 weeks out, Tuesday at 8am (urgency: medium)
- "I'll reach out when ready" or "I'll call you" → 28 days out, Wednesday 8am (urgency: skip — don't push)
- No answer 1-2x → 5 business days out, try DIFFERENT time than last attempt (urgency: medium)
- No answer 3+ times → 10 days out, switch to text/email approach (urgency: low)
- Left voicemail → 3-4 business days out, different time window (urgency: medium)
- Busy/call later → next business day, 8am (urgency: high)
- Not interested/firm no → 45 days out (urgency: low)
- Asked not to call → 90 days out (urgency: low)
- No history → next Tuesday or Wednesday at 8:30am (urgency: medium)

WHAT REALTORS RESPOND BEST TO:
- Openers that reference something specific about their listings or market
- Brevity — they're always between showings; 90 seconds max
- Value-first framing: "We've been helping agents in [their area] get listings sold faster with professional media"
- Social proof: mention specific results (e.g. "helped an agent in their zip code sell in 3 days")
- Never: pressure, discounts, long pitches, calling on Fridays after 2pm

=== YOUR TASK ===
1. Analyze ALL the history above. Extract every signal: sentiment, timing preferences, urgency markers, objections, warmth level.
2. Search the web for: "${searchQuery}" — find their brokerage, active listings, recent sales, social presence, specialty. Use this to make the opener hyper-specific.
3. Choose EXACTLY one date and time using the cadence rules above. Do NOT pick today unless they're a hot lead who specifically asked for a call. Output in ISO format.
4. Write a suggested opener (2-3 sentences) that is personalized using their specific brokerage, market, or anything you found online — NOT generic.

Respond ONLY with valid JSON:
{
  "follow_up_date_time": "YYYY-MM-DDTHH:mm:ss",
  "urgency": "high" | "medium" | "low" | "skip",
  "reason": "Exactly why this date/time — reference the specific note or signal that drove this decision",
  "suggested_opener": "Hyper-personalized opener using their brokerage/listings/market intel",
  "contact_intel": "1-2 sentences on what you found online about this realtor (brokerage, specialty, market area)",
  "pattern_tags": ["tag1", "tag2"]
}`,
    add_context_from_internet: true,
    response_json_schema: {
      type: "object",
      properties: {
        follow_up_date_time: { type: "string" },
        urgency: { type: "string" },
        reason: { type: "string" },
        suggested_opener: { type: "string" },
        contact_intel: { type: "string" },
        pattern_tags: { type: "array", items: { type: "string" } }
      }
    }
  });

  return res;
}

// Save the AI's decision as a permanent ActivityLog record
async function saveScheduledFollowUp(contact, analysis, sid, sem) {
  const followUpDate = analysis.follow_up_date_time
    ? new Date(analysis.follow_up_date_time)
    : addDays(new Date(), 7);

  const record = await base44.entities.ActivityLog.create({
    activity_type: "call",
    contact_name: contact.name,
    contact_email: contact.email,
    company_name: contact.company,
    activity_date: followUpDate.toISOString(),
    notes: `[AI Scheduled] ${analysis.reason || "Follow-up call"} | Opener: ${analysis.suggested_opener || ""}`,
    sales_member_id: sid,
    sales_member_email: sem,
  });

  return record;
}

function LeadCard({ contact, rank, repName, salesMemberId, scheduledFollowUp, urgency, reason, suggestedOpener, contactIntel, patternTags, onOutcomeLogged }) {
  const [expanded, setExpanded] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [script, setScript] = useState(suggestedOpener || null);
  const [loggingOutcome, setLoggingOutcome] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [saved, setSaved] = useState(false);
  // Edit follow-up date
  const [editingDate, setEditingDate] = useState(false);
  const [editDateValue, setEditDateValue] = useState(
    scheduledFollowUp ? format(new Date(scheduledFollowUp.activity_date), "yyyy-MM-dd'T'HH:mm") : ""
  );
  const [savingDate, setSavingDate] = useState(false);

  const priority = getPriorityLabel(urgency || "medium");
  const bestTime = getBestTime(contact);
  const lastActivity = contact.past[0];
  const followUpDate = scheduledFollowUp ? new Date(scheduledFollowUp.activity_date) : null;

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
AI insight: ${reason || "follow up"}
Urgency: ${urgency || "medium"}
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

  const saveEditedDate = async () => {
    if (!scheduledFollowUp || !editDateValue) return;
    setSavingDate(true);
    try {
      await base44.entities.ActivityLog.update(scheduledFollowUp.id, {
        activity_date: new Date(editDateValue).toISOString()
      });
      setEditingDate(false);
      if (onOutcomeLogged) onOutcomeLogged();
    } catch {
      // ignore
    } finally {
      setSavingDate(false);
    }
  };

  const logOutcome = async () => {
    if (!outcome || !outcomeNotes) return;
    setLoggingOutcome(true);

    const salesMemberEmail = localStorage.getItem('sales_member_email');
    const sid = salesMemberId || localStorage.getItem('sales_member_id');
    const sem = salesMemberEmail;

    let nextFollowUpDate = null;
    let nextNotes = "";
    const now = new Date();

    if (outcome === "no_answer") {
      nextFollowUpDate = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      nextNotes = `Follow-up text after missed call to ${contact.name}`;
    } else if (outcome === "call_later") {
      nextFollowUpDate = addDays(now, 1);
      nextFollowUpDate.setHours(8, 30, 0);
      nextNotes = `Follow-up call to ${contact.name} — asked to call back`;
    } else if (outcome === "interested") {
      nextFollowUpDate = addDays(now, 2);
      nextFollowUpDate.setHours(8, 0, 0);
      nextNotes = `WARM LEAD — ${contact.name} showed interest. Notify Brad for handoff.`;
    } else if (outcome === "not_interested") {
      nextFollowUpDate = addDays(now, 30);
      nextFollowUpDate.setHours(9, 0, 0);
      nextNotes = `30-day pause. ${contact.name} not interested at this time.`;
    } else if (outcome === "warm_waiting") {
      nextFollowUpDate = addDays(now, 21);
      nextFollowUpDate.setHours(8, 0, 0);
      nextNotes = `Warm lead — ${contact.name} will reach out when ready. Check back in 3 weeks.`;
    } else if (outcome === "left_voicemail") {
      nextFollowUpDate = addDays(now, 3);
      nextFollowUpDate.setHours(17, 0, 0);
      nextNotes = `Left voicemail for ${contact.name}. Follow up in 3 days.`;
    }

    try {
      // Log the completed call
      await base44.entities.ActivityLog.create({
        activity_type: "call",
        contact_name: contact.name,
        contact_email: contact.email,
        company_name: contact.company,
        activity_date: new Date().toISOString(),
        notes: `[Queue Call] Outcome: ${outcome.replace(/_/g, " ")} — ${outcomeNotes}`,
        sales_member_id: sid,
        sales_member_email: sem,
      });

      // If there was a scheduled follow-up, delete it — we'll replace it with the new one
      if (scheduledFollowUp) {
        await base44.entities.ActivityLog.delete(scheduledFollowUp.id).catch(() => {});
      }

      // Create the new permanent follow-up
      if (nextFollowUpDate) {
        await base44.entities.ActivityLog.create({
          activity_type: "call",
          contact_name: contact.name,
          contact_email: contact.email,
          company_name: contact.company,
          activity_date: nextFollowUpDate.toISOString(),
          notes: nextNotes,
          sales_member_id: sid,
          sales_member_email: sem,
        });
      }

      // Save insight so the AI learns
      await base44.entities.QueueInsight.create({
        sales_member_id: sid,
        contact_key: contact.key,
        contact_name: contact.name,
        outcome,
        outcome_notes: outcomeNotes,
        ai_recommendation: reason || "",
        next_contact_date: nextFollowUpDate ? format(nextFollowUpDate, "yyyy-MM-dd") : null,
        pattern_tags: patternTags || [],
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
                  {followUpDate && (
                    <span className="flex items-center gap-1 font-medium" style={{ color: '#B8956A' }}>
                      <Calendar className="w-3 h-3" />
                      Scheduled: {format(followUpDate, "MMM d 'at' h:mm a")}
                    </span>
                  )}
                </div>
                {reason && (
                  <p className="text-xs mt-1 italic flex items-start gap-1" style={{ color: 'rgba(26,26,26,0.55)' }}>
                    <Brain className="w-3 h-3 shrink-0 mt-0.5" style={{ color: '#B8956A' }} />
                    {reason}
                  </p>
                )}
                {contactIntel && (
                  <p className="text-xs mt-0.5 flex items-start gap-1" style={{ color: 'rgba(26,26,26,0.45)' }}>
                    🔍 {contactIntel}
                  </p>
                )}
              </div>
            </div>
            {expanded ? <ChevronUp className="w-4 h-4 mt-1 shrink-0 opacity-40" /> : <ChevronDown className="w-4 h-4 mt-1 shrink-0 opacity-40" />}
          </div>
        </button>

        {expanded && (
          <div className="mt-4 pt-4 border-t space-y-4" style={{ borderColor: 'rgba(184,149,106,0.15)' }}>

            {/* Editable follow-up date */}
            {scheduledFollowUp && (
              <div className="rounded-lg p-3" style={{ backgroundColor: 'rgba(184,149,106,0.06)', border: '1px solid rgba(184,149,106,0.2)' }}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#B8956A' }}>Scheduled Follow-up</p>
                  {!editingDate && (
                    <button onClick={() => setEditingDate(true)} className="flex items-center gap-1 text-xs" style={{ color: 'rgba(26,26,26,0.4)' }}>
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                  )}
                </div>
                {editingDate ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      type="datetime-local"
                      value={editDateValue}
                      onChange={e => setEditDateValue(e.target.value)}
                      className="text-xs h-8"
                    />
                    <Button size="sm" onClick={saveEditedDate} disabled={savingDate} style={{ backgroundColor: '#B8956A', color: '#fff' }}>
                      {savingDate ? "Saving..." : "Save"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingDate(false)}>Cancel</Button>
                  </div>
                ) : (
                  <p className="text-sm font-medium" style={{ color: '#1A1A1A' }}>
                    {format(new Date(scheduledFollowUp.activity_date), "EEEE, MMMM d 'at' h:mm a")}
                  </p>
                )}
              </div>
            )}

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
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="What happened on this call?" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_answer">No answer (text in 3 hours)</SelectItem>
                    <SelectItem value="call_later">Busy — call back tomorrow 8:30am</SelectItem>
                    <SelectItem value="interested">Interested — notify Brad</SelectItem>
                    <SelectItem value="warm_waiting">Warm — they'll reach out when ready (3 weeks)</SelectItem>
                    <SelectItem value="not_interested">Not interested — pause 30 days</SelectItem>
                    <SelectItem value="left_voicemail">Left voicemail (follow up in 3 days at 5pm)</SelectItem>
                  </SelectContent>
                </Select>
                {outcome && (
                  <>
                    <Textarea
                      placeholder="Quick notes on what was said..."
                      value={outcomeNotes}
                      onChange={e => setOutcomeNotes(e.target.value)}
                      rows={2}
                      className="text-sm"
                    />
                    <Button size="sm" onClick={logOutcome} disabled={loggingOutcome || !outcomeNotes} className="w-full" style={{ backgroundColor: '#B8956A', color: '#fff' }}>
                      {loggingOutcome ? "Saving..." : "Log & Schedule Next Follow-up"}
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm" style={{ color: '#10b981' }}>
                <CheckCircle2 className="w-4 h-4" />
                Outcome logged — next follow-up scheduled and saved
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
  // scheduledMap: contactKey -> ActivityLog record (the saved follow-up)
  const [scheduledMap, setScheduledMap] = useState({});
  // metaMap: contactKey -> { urgency, reason, suggestedOpener, patternTags } — only for display
  const [metaMap, setMetaMap] = useState({});
  const [insightCount, setInsightCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const sid = salesMemberId || localStorage.getItem('sales_member_id');
  const sem = salesMemberEmail || localStorage.getItem('sales_member_email');

  useEffect(() => {
    loadQueue();
  }, [salesMemberId, salesMemberEmail, refreshKey]);

  const loadQueue = async () => {
    setLoading(true);

    try {
      const [all, pastInsights] = await Promise.all([
        base44.entities.ActivityLog.list('-activity_date', 500),
        sid ? base44.entities.QueueInsight.filter({ sales_member_id: sid }, '-logged_at', 200) : Promise.resolve([])
      ]);

      setInsightCount(pastInsights.length);
      const learnedContext = buildLearnedContext(pastInsights);

      const mine = all.filter(a =>
        a.sales_member_id === sid ||
        a.sales_member_email === sem ||
        a.created_by === sem
      );

      const now = new Date();
      const startOfToday = startOfDay(now);

      // Separate future scheduled items from past activities
      const futureActivities = mine.filter(a => new Date(a.activity_date) >= startOfToday);
      const pastActivities = mine.filter(a => new Date(a.activity_date) < startOfToday);

      // Build contact map from ALL activities
      const contactMap = {};
      mine.forEach(a => {
        const key = a.contact_email || a.contact_name;
        if (!key) return;
        if (!contactMap[key]) {
          contactMap[key] = { key, name: a.contact_name || '', email: a.contact_email || '', company: a.company_name || '', activities: [], past: [], upcoming: [] };
        }
        contactMap[key].activities.push(a);
        if (new Date(a.activity_date) >= startOfToday) {
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

      // Build scheduledMap: for each contact, find their earliest future ActivityLog that is AI-scheduled
      // An AI-scheduled follow-up has notes starting with "[AI Scheduled]" or "[Queue Call]" follow-ups
      const newScheduledMap = {};
      filtered.forEach(contact => {
        // Find the earliest upcoming scheduled call for this contact
        const upcoming = contact.upcoming
          .filter(a => a.activity_type === "call" || a.activity_type === "task")
          .sort((a, b) => new Date(a.activity_date) - new Date(b.activity_date));
        if (upcoming.length > 0) {
          newScheduledMap[contact.key] = upcoming[0];
        }
      });
      setScheduledMap(newScheduledMap);

      setLoading(false);

      // For contacts that have NO scheduled follow-up yet, run AI to create one
      const needsScheduling = filtered.filter(c => !newScheduledMap[c.key]);

      if (needsScheduling.length > 0) {
        setScheduling(true);
        const newMeta = { ...metaMap };

        await Promise.all(
          needsScheduling.map(async (contact) => {
            try {
              const analysis = await analyzeContact(contact, learnedContext);
              // Save as permanent ActivityLog record
              const savedRecord = await saveScheduledFollowUp(contact, analysis, sid, sem);
              newScheduledMap[contact.key] = savedRecord;
              newMeta[contact.key] = {
                urgency: analysis.urgency,
                reason: analysis.reason,
                suggestedOpener: analysis.suggested_opener,
                contactIntel: analysis.contact_intel || "",
                patternTags: analysis.pattern_tags || []
              };
            } catch (e) {
              console.error(`Failed to schedule ${contact.name}`, e);
            }
          })
        );

        setScheduledMap({ ...newScheduledMap });
        setMetaMap(newMeta);
        setScheduling(false);
      }

    } catch (e) {
      console.error(e);
      setLoading(false);
      setScheduling(false);
    }
  };

  const today = startOfDay(new Date());

  // Contacts due today or overdue: their scheduled follow-up is today or in the past
  const dueContacts = contacts
    .filter(c => {
      const scheduled = scheduledMap[c.key];
      if (!scheduled) return false;
      const meta = metaMap[c.key];
      if (meta?.urgency === "skip") return false;
      return !isAfter(startOfDay(new Date(scheduled.activity_date)), today);
    })
    .sort((a, b) => {
      const urgencyOrder = { high: 0, medium: 1, low: 2 };
      const ua = urgencyOrder[metaMap[a.key]?.urgency] ?? 1;
      const ub = urgencyOrder[metaMap[b.key]?.urgency] ?? 1;
      if (ua !== ub) return ua - ub;
      // Secondary sort: most overdue first
      return new Date(scheduledMap[a.key]?.activity_date) - new Date(scheduledMap[b.key]?.activity_date);
    });

  // Upcoming contacts: scheduled in the future
  const upcomingContacts = contacts
    .filter(c => {
      const scheduled = scheduledMap[c.key];
      if (!scheduled) return false;
      const meta = metaMap[c.key];
      if (meta?.urgency === "skip") return false;
      return isAfter(startOfDay(new Date(scheduled.activity_date)), today);
    })
    .sort((a, b) => new Date(scheduledMap[a.key]?.activity_date) - new Date(scheduledMap[b.key]?.activity_date))
    .slice(0, 5);

  const todayLabel = format(new Date(), "EEEE, MMMM d");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#B8956A] border-t-transparent rounded-full animate-spin" />
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
            {scheduling && <span className="ml-2 text-xs" style={{ color: '#B8956A' }}>· AI scheduling new contacts...</span>}
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
            <p className="text-sm mt-1" style={{ color: 'rgba(26,26,26,0.4)' }}>
              All follow-ups are scheduled for future dates. Check "Coming Up" below.
            </p>
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
          {dueContacts.map((contact, idx) => {
            const meta = metaMap[contact.key] || {};
            return (
              <LeadCard
                key={contact.key}
                contact={contact}
                rank={idx + 1}
                repName={repName}
                salesMemberId={sid}
                scheduledFollowUp={scheduledMap[contact.key]}
                urgency={meta.urgency}
                reason={meta.reason}
                suggestedOpener={meta.suggestedOpener}
                contactIntel={meta.contactIntel}
                patternTags={meta.patternTags}
                onOutcomeLogged={() => setRefreshKey(k => k + 1)}
              />
            );
          })}
        </div>
      )}

      {upcomingContacts.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'rgba(26,26,26,0.4)' }}>Coming Up</p>
          <div className="space-y-2">
            {upcomingContacts.map(contact => {
              const scheduled = scheduledMap[contact.key];
              const meta = metaMap[contact.key] || {};
              const priority = getPriorityLabel(meta.urgency || "low");
              return (
                <div key={contact.key} className="flex items-center justify-between px-3 py-2.5 rounded-lg" style={{ backgroundColor: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: priority.color }} />
                    <span className="font-medium text-sm truncate" style={{ color: '#1A1A1A' }}>{contact.name}</span>
                    {contact.company && <span className="text-xs truncate" style={{ color: 'rgba(26,26,26,0.4)' }}>{contact.company}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {scheduled && (
                      <span className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>
                        {format(new Date(scheduled.activity_date), "MMM d 'at' h:mm a")}
                      </span>
                    )}
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
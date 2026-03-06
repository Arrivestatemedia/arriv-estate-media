import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Clock, Sparkles, ChevronDown, ChevronUp, Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";

function scoreContact(contact) {
  let score = 0;
  const notes = contact.activities.map(a => (a.notes || "").toLowerCase()).join(" ");
  const lastActivity = contact.past[0];
  const daysSinceContact = lastActivity
    ? differenceInDays(new Date(), new Date(lastActivity.activity_date))
    : 999;

  // Positive signals
  if (contact.past.length > 1) score += 30; // previous conversations
  if (notes.includes("interest") || notes.includes("interested") || notes.includes("want") || notes.includes("yes")) score += 25;
  if (notes.includes("pric") || notes.includes("book") || notes.includes("how much") || notes.includes("cost")) score += 25;
  if (notes.includes("listing") || notes.includes("upcoming") || notes.includes("next week")) score += 20;
  if (notes.includes("box") || notes.includes("package") || notes.includes("intro")) score += 15;
  if (notes.includes("referral") || notes.includes("referred") || notes.includes("previous client")) score += 10;
  if (contact.upcoming.length > 0) score += 20; // has a scheduled follow-up due

  // Negative signals
  if (daysSinceContact === 0 || daysSinceContact === 1) score -= 15; // touched yesterday
  if (notes.includes("not interested") || notes.includes("no thanks") || notes.includes("remove")) score -= 25;
  if (daysSinceContact > 60 && !notes.includes("interest")) score -= 30;

  // Boost for overdue follow-ups
  const overdueFollowup = contact.upcoming.find(a => new Date(a.activity_date) < new Date());
  if (overdueFollowup) score += 35;

  return score;
}

function getPriorityLabel(score) {
  if (score >= 50) return { label: "High", color: "#ef4444", bg: "rgba(239,68,68,0.1)" };
  if (score >= 20) return { label: "Medium", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" };
  if (score >= 0) return { label: "Low", color: "#6b7280", bg: "rgba(107,114,128,0.1)" };
  return { label: "Paused", color: "#9ca3af", bg: "rgba(156,163,175,0.08)" };
}

function getBestTime(contact) {
  const notes = contact.activities.map(a => (a.notes || "").toLowerCase()).join(" ");
  if (notes.includes("morning") || notes.includes("9am") || notes.includes("early")) return "9:00–11:00 AM";
  if (notes.includes("afternoon") || notes.includes("2pm") || notes.includes("3pm")) return "2:00–4:00 PM";
  if (notes.includes("evening") || notes.includes("5pm") || notes.includes("after 4")) return "5:00–6:00 PM";
  return "4:00–5:00 PM"; // default best time for agents
}

function getWhyReason(contact) {
  const notes = contact.activities.map(a => (a.notes || "").toLowerCase()).join(" ");
  const reasons = [];
  if (contact.past.length > 1) reasons.push("previous conversations");
  if (notes.includes("box") || notes.includes("package")) reasons.push("intro box sent");
  if (notes.includes("pric") || notes.includes("book")) reasons.push("pricing/booking interest shown");
  if (notes.includes("listing") || notes.includes("upcoming")) reasons.push("active/upcoming listing");
  if (notes.includes("interest")) reasons.push("showed interest");
  const overdueFollowup = contact.upcoming.find(a => new Date(a.activity_date) < new Date());
  if (overdueFollowup) reasons.push("overdue follow-up");
  return reasons.length > 0 ? reasons.join(", ") : "in your pipeline";
}

function LeadCard({ contact, rank, repName }) {
  const [expanded, setExpanded] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [script, setScript] = useState(null);
  const [loggingOutcome, setLoggingOutcome] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [saved, setSaved] = useState(false);

  const score = scoreContact(contact);
  const priority = getPriorityLabel(score);
  const bestTime = getBestTime(contact);
  const whyReason = getWhyReason(contact);
  const lastActivity = contact.past[0];

  const generateScript = async () => {
    setGeneratingScript(true);
    setScript(null);
    try {
      const historySnippet = contact.past.slice(0, 3).map(a =>
        `${format(new Date(a.activity_date), "MMM d")}: ${a.activity_type} — ${a.notes.slice(0, 100)}`
      ).join("\n");

      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `You are the ARRIV AI Sales Coach. Generate a specific, personalized call opener for this rep.

Rep name: ${repName || "Brad"}
Contact: ${contact.name}${contact.company ? `, ${contact.company}` : ""}
Why calling: ${whyReason}
Priority score: ${score} (${priority.label})
Best call time: ${bestTime}

Recent activity history:
${historySnippet || "No prior contact logged"}

Output ONLY:
1. **Opener** (the exact first thing to say — 2-3 sentences max, natural, not salesy)
2. **If no answer** — voicemail (1-2 sentences) + follow-up text (1 sentence)
3. **If they answer** — 2-3 possible conversation paths and how to handle each

Keep it short, direct, and ARRIV-branded. Never offer discounts. If they ask to book, say "I'll connect you with our owner Brad."`,
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

    const salesMemberId = localStorage.getItem('sales_member_id');
    const salesMemberEmail = localStorage.getItem('sales_member_email');

    // Determine next follow-up based on outcome
    let nextFollowUp = null;
    let nextNotes = "";
    const now = new Date();

    if (outcome === "no_answer") {
      nextFollowUp = new Date(now.getTime() + 3 * 60 * 60 * 1000); // +3 hours for text
      nextNotes = `Follow-up text after missed call to ${contact.name}`;
    } else if (outcome === "call_later") {
      nextFollowUp = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +1 day
      nextNotes = `Follow-up call to ${contact.name} — asked to call back`;
    } else if (outcome === "interested") {
      nextFollowUp = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2 hours — notify Brad
      nextNotes = `WARM LEAD — ${contact.name} showed interest. Notify Brad for handoff.`;
    } else if (outcome === "not_interested") {
      nextFollowUp = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days pause
      nextNotes = `30-day pause. ${contact.name} not interested at this time.`;
    }

    try {
      // Log the call outcome
      await base44.entities.ActivityLog.create({
        activity_type: "call",
        contact_name: contact.name,
        contact_email: contact.email,
        company_name: contact.company,
        activity_date: new Date().toISOString(),
        notes: `[Queue Call] Outcome: ${outcome.replace(/_/g, " ")} — ${outcomeNotes}`,
        sales_member_id: salesMemberId,
        sales_member_email: salesMemberEmail,
      });

      // Schedule auto next-step
      if (nextFollowUp) {
        await base44.entities.ActivityLog.create({
          activity_type: outcome === "no_answer" ? "task" : "call",
          contact_name: contact.name,
          contact_email: contact.email,
          company_name: contact.company,
          activity_date: nextFollowUp.toISOString(),
          notes: nextNotes,
          sales_member_id: salesMemberId,
          sales_member_email: salesMemberEmail,
        });
      }

      setSaved(true);
      setLoggingOutcome(false);
      setOutcome("");
      setOutcomeNotes("");
    } catch {
      setLoggingOutcome(false);
    }
  };

  return (
    <Card style={{ borderColor: rank === 1 ? '#B8956A' : 'rgba(184,149,106,0.2)', borderWidth: rank === 1 ? '2px' : '1px' }}>
      <CardContent className="pt-4 pb-4">
        {/* Header */}
        <button className="w-full text-left" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                style={{ backgroundColor: priority.bg, color: priority.color }}
              >
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
                </div>
                <p className="text-xs mt-1 italic" style={{ color: 'rgba(26,26,26,0.55)' }}>Why: {whyReason}</p>
              </div>
            </div>
            {expanded ? <ChevronUp className="w-4 h-4 mt-1 shrink-0 opacity-40" /> : <ChevronDown className="w-4 h-4 mt-1 shrink-0 opacity-40" />}
          </div>
        </button>

        {/* Expanded */}
        {expanded && (
          <div className="mt-4 pt-4 border-t space-y-4" style={{ borderColor: 'rgba(184,149,106,0.15)' }}>

            {/* Recent history */}
            {contact.past.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'rgba(26,26,26,0.4)' }}>Recent History</p>
                <div className="space-y-1">
                  {contact.past.slice(0, 3).map(a => (
                    <div key={a.id} className="text-xs p-2 rounded-lg" style={{ backgroundColor: 'rgba(0,0,0,0.03)' }}>
                      <span className="font-medium capitalize">{a.activity_type}</span>
                      <span className="mx-1" style={{ color: 'rgba(26,26,26,0.4)' }}>·</span>
                      <span style={{ color: 'rgba(26,26,26,0.5)' }}>{format(new Date(a.activity_date), "MMM d")}</span>
                      <span className="mx-1" style={{ color: 'rgba(26,26,26,0.4)' }}>·</span>
                      <span style={{ color: '#1A1A1A' }}>{a.notes.slice(0, 80)}{a.notes.length > 80 ? "..." : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Script generator */}
            <div>
              {!script && (
                <Button
                  size="sm"
                  onClick={generateScript}
                  disabled={generatingScript}
                  className="w-full gap-2"
                  style={{ backgroundColor: '#1A1A1A', color: '#fff' }}
                >
                  {generatingScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generatingScript ? "Generating opener..." : "Generate opener"}
                </Button>
              )}
              {script && (
                <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: 'rgba(184,149,106,0.08)', border: '1px solid rgba(184,149,106,0.25)' }}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#B8956A' }}>ARRIV Coach</p>
                    <button onClick={generateScript} className="text-xs flex items-center gap-1" style={{ color: 'rgba(26,26,26,0.4)' }}>
                      <RefreshCw className="w-3 h-3" /> Regenerate
                    </button>
                  </div>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: '#1A1A1A' }}>
                    {script}
                  </div>
                </div>
              )}
            </div>

            {/* Log outcome */}
            {!saved ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.4)' }}>Log Outcome</p>
                <Select value={outcome} onValueChange={setOutcome}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="What happened?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_answer">No answer (schedule text)</SelectItem>
                    <SelectItem value="call_later">Busy — call back tomorrow</SelectItem>
                    <SelectItem value="interested">Interested — notify Brad</SelectItem>
                    <SelectItem value="not_interested">Not interested — pause 30 days</SelectItem>
                    <SelectItem value="left_voicemail">Left voicemail</SelectItem>
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
                    <Button
                      size="sm"
                      onClick={logOutcome}
                      disabled={loggingOutcome || !outcomeNotes}
                      className="w-full"
                      style={{ backgroundColor: '#B8956A', color: '#fff' }}
                    >
                      {loggingOutcome ? "Logging..." : "Log & Schedule Next Step"}
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm" style={{ color: '#10b981' }}>
                <CheckCircle2 className="w-4 h-4" />
                Outcome logged — next step scheduled automatically
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
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadQueue();
  }, [salesMemberId, salesMemberEmail, refreshKey]);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const all = await base44.entities.ActivityLog.list('-activity_date', 500);
      const mine = all.filter(a =>
        a.sales_member_id === salesMemberId ||
        a.sales_member_email === salesMemberEmail ||
        a.created_by === salesMemberEmail
      );

      // Group by contact
      const contactMap = {};
      mine.forEach(a => {
        const key = a.contact_email || a.contact_name;
        if (!key) return;
        if (!contactMap[key]) {
          contactMap[key] = {
            key,
            name: a.contact_name || '',
            email: a.contact_email || '',
            company: a.company_name || '',
            activities: [],
            past: [],
            upcoming: [],
          };
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

      const scored = Object.values(contactMap)
        .filter(c => {
          const name = c.name?.trim();
          if (!name) return false;
          if (/^\+?\d[\d\s\-().]+$/.test(name)) return false;
          if (/^\d+$/.test(name)) return false;
          return true;
        })
        .map(c => ({ ...c, score: scoreContact(c) }))
        .filter(c => c.score > -25) // exclude explicitly paused
        .sort((a, b) => b.score - a.score);

      setContacts(scored);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#B8956A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const today = format(new Date(), "EEEE, MMMM d");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: '#1A1A1A' }}>Daily Call Queue</h2>
          <p className="text-sm" style={{ color: 'rgba(26,26,26,0.5)' }}>{today} · {contacts.length} leads prioritized</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setRefreshKey(k => k + 1)}
          className="gap-2"
          style={{ borderColor: 'rgba(184,149,106,0.4)', color: 'rgba(26,26,26,0.6)' }}
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </Button>
      </div>

      {contacts.length === 0 ? (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <Phone className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium" style={{ color: 'rgba(26,26,26,0.5)' }}>No leads to call today</p>
            <p className="text-sm mt-1" style={{ color: 'rgba(26,26,26,0.4)' }}>Log activities to build your call queue.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="p-3 rounded-xl text-sm" style={{ backgroundColor: 'rgba(184,149,106,0.08)', border: '1px solid rgba(184,149,106,0.2)' }}>
            <p style={{ color: 'rgba(26,26,26,0.6)' }}>
              <span className="font-semibold" style={{ color: '#1A1A1A' }}>Today's priority:</span>{" "}
              Start with <span className="font-semibold" style={{ color: '#B8956A' }}>{contacts[0]?.name}</span>.
              {contacts[0] && ` Best time: ${getBestTime(contacts[0])}.`}
            </p>
          </div>
          {contacts.map((contact, idx) => (
            <LeadCard key={contact.key} contact={contact} rank={idx + 1} repName={repName} />
          ))}
        </div>
      )}
    </div>
  );
}
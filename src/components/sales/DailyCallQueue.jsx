import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Clock, Sparkles, ChevronDown, ChevronUp, Loader2, CheckCircle2, RefreshCw, Calendar, Brain, Pencil, Trash2 } from "lucide-react";
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
    .map(a => {
      const pics = a.picture_urls?.length ? ` [has ${a.picture_urls.length} attached image(s)]` : "";
      return `${format(new Date(a.activity_date), "MMM d, yyyy")} [${a.activity_type}]: ${a.notes}${pics}`;
    })
    .join("\n");

  // Collect all picture URLs from recent activities so the AI can actually read them
  const allPictureUrls = contact.activities
    .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
    .slice(0, 15)
    .flatMap(a => a.picture_urls || [])
    .slice(0, 6); // cap at 6 images to avoid overloading

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
    prompt: `You are a sharp sales intelligence agent for ARRIV, a real estate photography company. Decide ONE follow-up date for this realtor. This gets saved permanently — be deliberate.

TODAY: ${today} (${dayName})

CONTACT: ${contact.name} | ${contact.company || "Unknown brokerage"}

FULL HISTORY (newest first):
${historyText || "No prior contact"}

${learnedContext ? `LEARNED PATTERNS:\n${learnedContext}\n` : ""}

=== CRITICAL RULES — READ CAREFULLY ===

RESPECT THEIR STATED PREFERENCE ABOVE ALL ELSE:
- If they said "I'll reach out when ready", "I'll call you", "I'll get back to you", or anything indicating THEY will initiate → set 45 days out. Do NOT reach out sooner. Urgency: skip (show in "coming up" only, don't surface as due today)
- If they have listings currently active on the market and we haven't shot them yet → this IS urgent. Override to high urgency, 1-2 business days.
- If they said "call me in X weeks/days" → respect that exact timeframe to the day.
- "Not interested" or firm no → 45 days. Urgency: low.
- "Busy, call me later/tomorrow" → next business day 8am. Urgency: high.
- Warm/showed interest → 2-3 business days, morning. Urgency: high.
- No answer 1-2x → 4 business days, different time than last. Urgency: medium.
- No answer 3+ times → 14 days, switch to text. Urgency: low.
- Left voicemail → 4 business days, different time. Urgency: medium.
- No history at all → next Tuesday or Wednesday 8:30am. Urgency: medium.

BEST DAYS: Tuesday > Wednesday > Thursday > Monday after 10am. Avoid Friday PM and weekends.
BEST TIMES: 8–9am > 12–1pm > 5–7pm > 9:30–10:30am.

CHANNEL SELECTION — pick the best outreach method based on history:
- Default: call
- Switch to TEXT if: they've responded positively to texts in history, they said "text me", 3+ no-answer calls in a row, or they seem to prefer async communication
- Switch to EMAIL if: they're a heavy email communicator based on history, they asked to be emailed, or it's a formal/complex follow-up that needs written detail
- If unsure: call is safest for first contact; text is great for warm leads who aren't picking up; email for detailed proposals
- Note: "no_answer 3+ times" → switch to text as primary

SEARCH: Look up "${searchQuery}" — find active listings, brokerage, market area. If they have an active listing we haven't shot, flag urgency: high.

${allPictureUrls.length > 0 ? `\nATTACHED IMAGES: There are ${allPictureUrls.length} image(s) attached from past activities (e.g. screenshots of conversations, texts, emails). READ THEM. They may contain context about what was discussed, agreements made, or what the contact said — treat this as primary evidence when deciding timing and channel.` : ""}

OUTPUT valid JSON only:
{
  "follow_up_date_time": "YYYY-MM-DDTHH:mm:ss",
  "urgency": "high" | "medium" | "low" | "skip",
  "channel": "call" | "text" | "email",
  "channel_reason": "One sentence on why this channel was chosen",
  "reason": "Short, plain-English reason referencing the specific signal",
  "suggested_opener": "A casual, natural 1-2 sentence opener — sounds like a real person talking, not a script",
  "contact_intel": "1-2 sentences on what you found about this realtor online",
  "pattern_tags": ["tag1", "tag2"]
}`,
    add_context_from_internet: true,
    file_urls: allPictureUrls.length > 0 ? allPictureUrls : undefined,
    response_json_schema: {
      type: "object",
      properties: {
        follow_up_date_time: { type: "string" },
        urgency: { type: "string" },
        channel: { type: "string" },
        channel_reason: { type: "string" },
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
    contact_phone: contact.phone || "",
    company_name: contact.company,
    activity_date: followUpDate.toISOString(),
    notes: `[AI Scheduled] ${analysis.reason || "Follow-up call"} | Opener: ${analysis.suggested_opener || ""}`,
    sales_member_id: sid,
    sales_member_email: sem,
  });

  return record;
}

const channelConfig = {
  call: { label: "Call", icon: "📞", color: "#B8956A" },
  text: { label: "Text", icon: "💬", color: "#3B82F6" },
  email: { label: "Email", icon: "✉️", color: "#8B5CF6" },
};

function LeadCard({ contact, rank, repName, salesMemberId, scheduledFollowUp, urgency, channel, channelReason, reason, suggestedOpener, contactIntel, patternTags, onOutcomeLogged }) {
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
  const [deletingFollowUp, setDeletingFollowUp] = useState(false);

  const priority = getPriorityLabel(urgency || "medium");
  const bestTime = getBestTime(contact);
  const lastActivity = contact.past[0];
  const followUpDate = scheduledFollowUp ? new Date(scheduledFollowUp.activity_date) : null;

  const generateScript = async () => {
    setGeneratingScript(true);
    setScript(null);
    try {
      const historySnippet = contact.past.slice(0, 4).map(a => {
        const pics = a.picture_urls?.length ? ` [+${a.picture_urls.length} image(s)]` : "";
        return `${format(new Date(a.activity_date), "MMM d")}: ${a.activity_type} — ${a.notes.slice(0, 120)}${pics}`;
      }).join("\n");

      const scriptPictureUrls = contact.past
        .slice(0, 6)
        .flatMap(a => a.picture_urls || [])
        .slice(0, 6);

      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `You're helping a sales rep at ARRIV (real estate photography company) prep for a call with ${contact.name}${contact.company ? ` from ${contact.company}` : ""}. Write a COMPLETE CALL MAP — every branch of the conversation covered. This should sound like a real person who knows them, not a salesperson reading off a sheet.

What we know:
- Rep: ${repName || "the rep"}
- Contact intel: ${contactIntel || "not available"}
- Why calling now: ${reason || "routine follow-up"}
- Urgency: ${urgency || "medium"}
- History: ${historySnippet || "no prior contact"}

TONE RULES (critical):
- Write like a human talks, not how a textbook describes sales
- Short sentences. Contractions. Natural pauses built in.
- No buzzwords like "leverage", "synergy", "value proposition"
- The opener should NOT start with "Hi, this is [name] from ARRIV" — they can see the number
- Use what you know about them specifically — generic lines get hung up on
- Confident but relaxed — like calling a colleague you've met before

PERSUASION PRINCIPLES (weave in naturally, don't label them):
- Say something unexpected first to break the auto-reject mode
- Reference something specific about their market or listings
- One genuine stat if it fits: listings with pro media sell 32% faster, 5-11% more
- Ask one question that makes them curious rather than defensive
- If they push back, acknowledge it genuinely before responding — don't steamroll
- Mirror their language if they say something interesting

FORMAT — cover EVERY section:

📞 **Opening** (1-2 sentences, casual, specific to this person — not a generic intro)

🔀 **If they're open / interested:**
[Keep it under 60 seconds — the key points to hit, in plain language. Guide toward booking.]

🔀 **If they object — "I already have a photographer":**
[Exact response — acknowledge, don't argue, plant a seed]

🔀 **If they object — "Not interested right now":**
[Exact response — graceful, leaves door open]

🔀 **If they object — "Send me an email":**
[Exact response — agree, but lock in a brief follow-up call too]

🔀 **If they object — "Too expensive":**
[Exact response — value-first, never discount. Redirect pricing to Brad.]

🔀 **If they're cold / one-word answers / not engaging:**
[Short, graceful exit that leaves the door open]

🔀 **If they're busy / bad time:**
[Exact response — respect their time, lock in a specific callback time]

📵 **If no answer — voicemail** (15 sec max when spoken aloud):
[Word-for-word voicemail]

📱 **Follow-up text** (send immediately after voicemail):
[Short, casual text to send right after]

🏁 **Closing / ready to move forward:**
[Exact lines — hand off to Brad naturally: "Our owner Brad will walk you through the rest."]

${scriptPictureUrls.length > 0 ? `NOTE: There are attached images from past activities — screenshots of conversations, texts, or notes. READ THEM to understand the full context of what was discussed before writing this guide.` : ""}`,
        add_context_from_internet: true,
        file_urls: scriptPictureUrls.length > 0 ? scriptPictureUrls : undefined,
      });
      setScript(typeof res === "string" ? res : res?.text || String(res));
    } catch {
      setScript("Failed to generate script. Try again.");
    } finally {
      setGeneratingScript(false);
    }
  };

  const deleteFollowUp = async () => {
    if (!scheduledFollowUp) return;
    setDeletingFollowUp(true);
    await base44.entities.ActivityLog.delete(scheduledFollowUp.id).catch(() => {});
    setDeletingFollowUp(false);
    if (onOutcomeLogged) onOutcomeLogged();
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
        contact_phone: contact.phone || "",
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
          contact_phone: contact.phone || "",
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

      // Auto-generate call map for the newly scheduled follow-up AND save it to the notes
      let generatedCallMap = "";
      try {
        const historySnippet = contact.past.slice(0, 4).map(a => {
          const pics = a.picture_urls?.length ? ` [+${a.picture_urls.length} image(s)]` : "";
          return `${format(new Date(a.activity_date), "MMM d")}: ${a.activity_type} — ${a.notes.slice(0, 120)}${pics}`;
        }).join("\n");

        const scriptPictureUrls = contact.past
          .slice(0, 6)
          .flatMap(a => a.picture_urls || [])
          .slice(0, 6);

        const callMapRes = await base44.integrations.Core.InvokeLLM({
          prompt: `You're helping a sales rep at ARRIV (real estate photography company) prep for a call with ${contact.name}${contact.company ? ` from ${contact.company}` : ""}. Write a COMPLETE CALL MAP — every branch of the conversation covered. This should sound like a real person who knows them, not a salesperson reading off a sheet.

      What we know:
      - Rep: ${repName || "the rep"}
      - Contact intel: ${contactIntel || "not available"}
      - Why calling now: ${reason || "routine follow-up"}
      - Urgency: ${urgency || "medium"}
      - History: ${historySnippet || "no prior contact"}

      TONE RULES (critical):
      - Write like a human talks, not how a textbook describes sales
      - Short sentences. Contractions. Natural pauses built in.
      - No buzzwords like "leverage", "synergy", "value proposition"
      - The opener should NOT start with "Hi, this is [name] from ARRIV" — they can see the number
      - Use what you know about them specifically — generic lines get hung up on
      - Confident but relaxed — like calling a colleague you've met before

      PERSUASION PRINCIPLES (weave in naturally, don't label them):
      - Say something unexpected first to break the auto-reject mode
      - Reference something specific about their market or listings
      - One genuine stat if it fits: listings with pro media sell 32% faster, 5-11% more
      - Ask one question that makes them curious rather than defensive
      - If they push back, acknowledge it genuinely before responding — don't steamroll
      - Mirror their language if they say something interesting

      FORMAT — cover EVERY section:

      📞 **Opening** (1-2 sentences, casual, specific to this person — not a generic intro)

      🔀 **If they're open / interested:**
      [Keep it under 60 seconds — the key points to hit, in plain language. Guide toward booking.]

      🔀 **If they object — "I already have a photographer":**
      [Exact response — acknowledge, don't argue, plant a seed]

      🔀 **If they object — "Not interested right now":**
      [Exact response — graceful, leaves door open]

      🔀 **If they object — "Send me an email":**
      [Exact response — agree, but lock in a brief follow-up call too]

      🔀 **If they object — "Too expensive":**
      [Exact response — value-first, never discount. Redirect pricing to Brad.]

      🔀 **If they're cold / one-word answers / not engaging:**
      [Short, graceful exit that leaves the door open]

      🔀 **If they're busy / bad time:**
      [Exact response — respect their time, lock in a specific callback time]

      📵 **If no answer — voicemail** (15 sec max when spoken aloud):
      [Word-for-word voicemail]

      📱 **Follow-up text** (send immediately after voicemail):
      [Short, casual text to send right after]

      🏁 **Closing / ready to move forward:**
      [Exact lines — hand off to Brad naturally: "Our owner Brad will walk you through the rest."]

      ${scriptPictureUrls.length > 0 ? `NOTE: There are attached images from past activities — screenshots of conversations, texts, or notes. READ THEM to understand the full context of what was discussed before writing this guide.` : ""}`,
          add_context_from_internet: true,
          file_urls: scriptPictureUrls.length > 0 ? scriptPictureUrls : undefined,
        });

        generatedCallMap = typeof callMapRes === "string" ? callMapRes : callMapRes?.text || String(callMapRes);
        setScript(generatedCallMap);

        // Update the scheduled follow-up record to include the full call map
        if (nextFollowUpDate) {
          await base44.entities.ActivityLog.update(savedRecord.id, { 
            notes: `${nextNotes}\n\n--- CALL MAP ---\n${generatedCallMap}` 
          });
        }
      } catch (e) {
        console.error('Call map generation failed:', e);
        // If auto-generation fails, just continue without it
      }

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
                {contact.phone && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.dispatchEvent(new CustomEvent('openDialer', { detail: { phone: contact.phone } }));
                    }}
                    className="flex items-center gap-1 text-xs font-medium mt-0.5 hover:opacity-70 transition-opacity"
                    style={{ color: '#B8956A' }}
                  >
                    <Phone className="w-3 h-3" />
                    {contact.phone}
                  </button>
                )}
                <div className="flex flex-wrap gap-3 mt-1 text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Best time: {bestTime}</span>
                  {lastActivity && <span>Last touch: {formatDistanceToNow(new Date(lastActivity.activity_date), { addSuffix: true })}</span>}
                  {followUpDate && (
                    <span className="flex items-center gap-1 font-medium" style={{ color: '#B8956A' }}>
                      <Calendar className="w-3 h-3" />
                      Scheduled: {format(followUpDate, "MMM d 'at' h:mm a")}
                    </span>
                  )}
                  {channel && channel !== "call" && (
                    <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${channelConfig[channel]?.color}18`, color: channelConfig[channel]?.color }}>
                      {channelConfig[channel]?.icon} via {channelConfig[channel]?.label}
                    </span>
                  )}
                </div>
                {reason && (
                  <p className="text-xs mt-1 italic flex items-start gap-1" style={{ color: 'rgba(26,26,26,0.55)' }}>
                    <Brain className="w-3 h-3 shrink-0 mt-0.5" style={{ color: '#B8956A' }} />
                    {reason}
                  </p>
                )}
                {channelReason && (
                  <p className="text-xs mt-0.5 flex items-start gap-1" style={{ color: channelConfig[channel]?.color || 'rgba(26,26,26,0.45)' }}>
                    {channelConfig[channel]?.icon} {channelReason}
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
                    <div className="flex items-center gap-3">
                      <button onClick={() => setEditingDate(true)} className="flex items-center gap-1 text-xs" style={{ color: 'rgba(26,26,26,0.4)' }}>
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                      <button onClick={deleteFollowUp} disabled={deletingFollowUp} className="flex items-center gap-1 text-xs" style={{ color: '#ef4444' }}>
                        <Trash2 className="w-3 h-3" /> {deletingFollowUp ? "Deleting..." : "Delete"}
                      </button>
                    </div>
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
                  {generatingScript ? "Generating call map..." : "Generate call map"}
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
          contactMap[key] = { key, name: a.contact_name || '', email: a.contact_email || '', company: a.company_name || '', phone: '', activities: [], past: [], upcoming: [] };
        }
        contactMap[key].activities.push(a);
        if (new Date(a.activity_date) >= startOfToday) {
          contactMap[key].upcoming.push(a);
        } else {
          contactMap[key].past.push(a);
        }
        if (!contactMap[key].name && a.contact_name) contactMap[key].name = a.contact_name;
        if (!contactMap[key].company && a.company_name) contactMap[key].company = a.company_name;
        if (!contactMap[key].phone && a.contact_phone) contactMap[key].phone = a.contact_phone;
      });

      const filtered = Object.values(contactMap).filter(c => {
        const name = c.name?.trim();
        if (!name) return false;
        if (/^\+?\d[\d\s\-().]+$/.test(name)) return false;
        if (/^\d+$/.test(name)) return false;
        return c.past.length > 0;
      });

      setContacts(filtered);

      // Build scheduledMap: for each contact, keep ONLY the earliest upcoming scheduled call.
      // Delete any duplicates (extra AI-scheduled records) automatically.
      const newScheduledMap = {};
      const deletePromises = [];
      filtered.forEach(contact => {
        const upcoming = contact.upcoming
          .filter(a => a.activity_type === "call" || a.activity_type === "task")
          .sort((a, b) => new Date(a.activity_date) - new Date(b.activity_date));
        if (upcoming.length > 0) {
          newScheduledMap[contact.key] = upcoming[0];
          // Delete any extras silently
          upcoming.slice(1).forEach(dupe => {
            deletePromises.push(base44.entities.ActivityLog.delete(dupe.id).catch(() => {}));
          });
        }
      });
      if (deletePromises.length > 0) Promise.all(deletePromises);
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
                channel: analysis.channel || "call",
                channelReason: analysis.channel_reason || "",
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
                channel={meta.channel || "call"}
                channelReason={meta.channelReason || ""}
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
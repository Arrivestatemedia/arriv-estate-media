import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Clock, Sparkles, ChevronDown, ChevronUp, Loader2, CheckCircle2, RefreshCw, Calendar, Brain, Pencil, Trash2, MapPin } from "lucide-react";
import { format, formatDistanceToNow, addDays, isAfter, startOfDay, parseISO } from "date-fns";
import ReactMarkdown from "react-markdown";
import ViewCallMapModal from "./ViewCallMapModal";

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
    prompt: `You are a sharp sales intelligence agent for ARRIV, a real estate photography company. Your ONLY job: read the contact's history, understand EXACTLY what they said, and schedule the next call at the RIGHT time. Do NOT overestimate timeline.

TODAY: ${today} (${dayName})
CONTACT: ${contact.name} | ${contact.company || "Unknown brokerage"}

=== READ THIS HISTORY VERY CAREFULLY ===
FULL HISTORY (newest first):
${historyText || "No prior contact"}

${learnedContext ? `\nLEARNED PATTERNS FROM PAST OUTCOMES:\n${learnedContext}\n` : ""}

=== IF ATTACHED IMAGES EXIST, READ THEM FIRST ===
${allPictureUrls.length > 0 ? `IMAGES ATTACHED: ${allPictureUrls.length} screenshot(s) from conversations. READ EACH ONE. Look for:
- Exact words they used ("call me back at...", "next week", "I'm interested", "not now")
- Dates/times they mentioned
- Their tone (warm, cold, hesitant, excited)
- Any commitments they made
IMAGES ARE PRIMARY EVIDENCE. Use them to override unclear notes.` : ""}

=== DECISION RULES (apply in order) ===

1. DID THEY GIVE A SPECIFIC CALLBACK TIME? ("call me back at 2pm", "tomorrow morning", "next Monday")
   → Schedule EXACTLY then (or next business day if weekend). Urgency: high.

2. DID THEY SAY "CALL ME BACK IN X DAYS/WEEKS"? ("call me back in 2 weeks", "in a month")
   → Schedule EXACTLY that many days from now. Urgency: medium.

3. DID THEY SAY THEY'LL CALL YOU? ("I'll get back to you", "I'll reach out", "I'll call you when ready")
   → Set 45 days out. Urgency: skip. DO NOT surface as due today.

4. ARE THEY A WARM LEAD? (said "interested", "sounds good", "send me info", asked questions)
   → Schedule 2-3 business days, morning 8-9am. Urgency: high.

5. DID THEY SAY "NOT INTERESTED"? (firm no, rejection)
   → Schedule 45 days out. Urgency: low.

6. NO ANSWER (they didn't pick up, voicemail only)
   → Schedule 4 business days, different time than last attempt. Urgency: medium.

7. THEY SAID THEY'RE BUSY/BAD TIME NOW
   → Next business day 8:30am. Urgency: high.

8. FIRST CONTACT (no history)
   → Schedule TODAY (if it's before 5pm) at the next available window, or TOMORROW at 8:30am. Never push a brand new contact out more than 1 day. Urgency: high.

BEST TIMES: 8–9am > 12–1pm > 5–7pm. AVOID weekends & Friday evenings.

CHANNEL: Default=call. Switch to TEXT only if they explicitly said "text me" or have responded positively to texts. EMAIL only if they asked or are heavy email communicator.

MARKET INTEL: Look up "${searchQuery}" — check for active listings. If they have one and we haven't shot it, override urgency to HIGH and schedule 1-2 business days.

OUTPUT valid JSON only:
{
  "follow_up_date_time": "YYYY-MM-DDTHH:mm:ss",
  "urgency": "high" | "medium" | "low" | "skip",
  "channel": "call" | "text" | "email",
  "channel_reason": "One sentence on why this channel was chosen",
  "reason": "Specific quote or context from history explaining the timing",
  "suggested_opener": "A casual, natural 1-2 sentence opener",
  "contact_intel": "1-2 sentences on what you found about this realtor",
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
async function saveScheduledFollowUp(contact, analysis, sid, sem, existingScheduledMap) {
  let followUpDate = analysis.follow_up_date_time
    ? new Date(analysis.follow_up_date_time)
    : addDays(new Date(), 7);

  // Determine best time preference from contact history
  const bestTimeStr = getBestTime(contact);
  const isEveningPreferred = bestTimeStr.includes("5:00") || bestTimeStr.includes("7:00") || bestTimeStr.includes("PM");
  const isMorningPreferred = bestTimeStr.includes("8:00") || bestTimeStr.includes("9:00") || bestTimeStr.includes("Mon–Wed");
  const isNoonPreferred = bestTimeStr.includes("12:00") || bestTimeStr.includes("1:00 PM");
  const isAfternoonPreferred = bestTimeStr.includes("1:00") || bestTimeStr.includes("2:00");

  // Bradley-specific availability windows (ONLY for Brad Burke)
    if (sem === 'bradley@arrivestatemedia.com' || sem?.toLowerCase().includes('bradley') || sem?.toLowerCase().includes('brad')) {
      // Adjust to next available time in Bradley's windows: 7:55am-8:10am, 10:15am-10:38am, 2:15pm+
      // Reorder windows based on contact's best time preference
      const allWindows = [
        { start: 7.9167, end: 8.167 },   // 7:55am - 8:10am
        { start: 10.25, end: 10.633 },   // 10:15am - 10:38am
        { start: 14.25, end: 24 }        // 2:15pm - midnight
      ];
      // If evening preferred, try 2:15pm+ first
      const windows = isEveningPreferred
        ? [allWindows[2], allWindows[0], allWindows[1]]
        : isNoonPreferred || isAfternoonPreferred
          ? [allWindows[1], allWindows[2], allWindows[0]]
          : allWindows;

    let adjusted = new Date(followUpDate);
    let found = false;

    // Try current day first, then next days
    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      adjusted = new Date(followUpDate);
      adjusted.setDate(adjusted.getDate() + dayOffset);
      adjusted.setHours(0, 0, 0, 0);

      for (const window of windows) {
        // Start at the beginning of the window
        let testTime = new Date(adjusted);
        testTime.setHours(Math.floor(window.start), Math.round((window.start % 1) * 60), 0, 0);

        // Try to find an available 5-minute slot within the window
        const windowEndMinutes = Math.floor((window.end % 1) * 60);
        const windowEndHours = Math.floor(window.end);
        const maxMinutes = (windowEndHours * 60 + windowEndMinutes);
        
        while (testTime.getHours() * 60 + testTime.getMinutes() < maxMinutes) {
          if (testTime > new Date()) {
            // Check if this time is already scheduled
            const conflict = existingScheduledMap && Object.values(existingScheduledMap).some(scheduled => {
              const scheduledTime = new Date(scheduled.activity_date);
              const timeDiff = Math.abs(testTime - scheduledTime) / (1000 * 60); // diff in minutes
              return timeDiff < 5; // if within 5 minutes, it's a conflict
            });

            if (!conflict) {
              followUpDate = testTime;
              found = true;
              break;
            }
          }
          // Move to next 5-minute slot
          testTime.setMinutes(testTime.getMinutes() + 5);
        }
        if (found) break;
      }
      if (found) break;
    }
  } else {
    // For all other reps: smart scheduling aligned with contact's best time preference
    const allOptimalWindows = [
      { start: 9, end: 11 },      // Morning window
      { start: 13, end: 15 },     // Early afternoon
      { start: 17, end: 19 }      // Evening (5-7pm)
    ];
    // Reorder based on contact's best time
    const optimalWindows = isEveningPreferred
      ? [allOptimalWindows[2], allOptimalWindows[0], allOptimalWindows[1]]
      : isNoonPreferred || isAfternoonPreferred
        ? [allOptimalWindows[1], allOptimalWindows[2], allOptimalWindows[0]]
        : allOptimalWindows;

    let adjusted = new Date(followUpDate);
    let found = false;

    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      adjusted = new Date(followUpDate);
      adjusted.setDate(adjusted.getDate() + dayOffset);
      adjusted.setHours(0, 0, 0, 0);

      // Prefer first window (9-11am)
      for (const window of optimalWindows) {
        const testTime = new Date(adjusted);
        testTime.setHours(window.start, 0, 0, 0);

        if (testTime > new Date()) {
          followUpDate = testTime;
          found = true;
          break;
        }
      }
      if (found) break;
    }
  }

  let initialNotes = `[AI Scheduled] ${analysis.reason || "Follow-up call"} | Opener: ${analysis.suggested_opener || ""}`;
  
  // Generate formatted call map immediately
  try {
    const historySnippet = contact.activities.slice(0, 4).map(a => {
      const pics = a.picture_urls?.length ? ` [+${a.picture_urls.length} image(s)]` : "";
      return `${format(new Date(a.activity_date), "MMM d")}: ${a.activity_type} — ${a.notes.slice(0, 120)}${pics}`;
    }).join("\n");

    const scriptPictureUrls = contact.activities
      .slice(0, 6)
      .flatMap(a => a.picture_urls || [])
      .slice(0, 6);

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `CALL MAP for ${contact.name} at ${contact.company || "Unknown brokerage"}

CRITICAL — ARRIV IS A REAL ESTATE PHOTOGRAPHY & VIDEO COMPANY. NOTHING ELSE.
- We shoot photos and video for real estate listings. That's it.
- We do NOT offer: websites, marketing platforms, advertising campaigns, CRM tools, lead gen, or anything other than photo/video.
- NEVER use placeholders like "[Your Name]" or "[Your Company]". Use "ARRIV" as company.
- Scripts must be casual and human, not corporate. Reference specific details from history.
- Key stat: "homes with pro media sell 32% faster and for 5-11% more"
- Brad handles pricing questions and closings.

History: ${historySnippet || "no prior contact"}

Output JSON with ALL 10 sections. Every field required and must be filled with full content.

${scriptPictureUrls.length > 0 ? `Read attached images for full context.\n` : ""}`,
      add_context_from_internet: true,
      file_urls: scriptPictureUrls.length > 0 ? scriptPictureUrls : undefined,
      response_json_schema: {
        type: "object",
        properties: {
          opening: { type: "string", description: "2 sentences, casual, specific. NOT 'Hi this is X from ARRIV'" },
          if_interested: { type: "string", description: "Full 60-second pitch, key points, guide to booking" },
          if_has_photographer: { type: "string", description: "Acknowledge, don't argue, plant seed for future" },
          if_not_interested: { type: "string", description: "Graceful response, leaves door open, mention follow-up" },
          if_send_email: { type: "string", description: "Agree to email but GET COMMITMENT for a call too" },
          if_too_expensive: { type: "string", description: "Value frame, never discount, redirect to Brad for pricing" },
          if_cold_unengaged: { type: "string", description: "Short graceful exit that doesn't burn the bridge" },
          if_busy_bad_time: { type: "string", description: "Acknowledge, lock in specific callback time, end on good note" },
          if_no_answer_voicemail: { type: "string", description: "15 seconds max, word-for-word, conversational" },
          follow_up_text: { type: "string", description: "Send right after voicemail if no answer — short, casual, natural" }
        },
        required: ["opening", "if_interested", "if_has_photographer", "if_not_interested", "if_send_email", "if_too_expensive", "if_cold_unengaged", "if_busy_bad_time", "if_no_answer_voicemail", "follow_up_text"]
      }
    });
    
    const callMapData = typeof res === "string" ? JSON.parse(res) : res;
    const formatted = `📞 **Opening**\n${callMapData.opening}\n\n🔀 **If they're interested**\n${callMapData.if_interested}\n\n🔀 **If they say "I already have a photographer"**\n${callMapData.if_has_photographer}\n\n🔀 **If they say "Not interested right now"**\n${callMapData.if_not_interested}\n\n🔀 **If they say "Send me an email"**\n${callMapData.if_send_email}\n\n🔀 **If they say "Too expensive"**\n${callMapData.if_too_expensive}\n\n🔀 **If they're cold / one-word answers**\n${callMapData.if_cold_unengaged}\n\n🔀 **If they're busy / bad time**\n${callMapData.if_busy_bad_time}\n\n📵 **If no answer — voicemail**\n${callMapData.if_no_answer_voicemail}\n\n📱 **Follow-up text**\n${callMapData.follow_up_text}`;
    initialNotes += `\n\n--- CALL MAP ---\n${formatted}`;
  } catch (error) {
    console.error('[saveScheduledFollowUp] Failed to generate call map:', error);
  }

  const record = await base44.entities.ActivityLog.create({
    activity_type: "call",
    contact_name: contact.name,
    contact_email: contact.email,
    contact_phone: contact.phone || "",
    company_name: contact.company,
    activity_date: followUpDate.toISOString(),
    notes: initialNotes,
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
      
      // Include pattern tags and metadata for long-term learning
      const patternTagsText = patternTags && patternTags.length > 0 
        ? `\n\nRecurring patterns: ${patternTags.join(", ")}`
        : "";

      const res = await base44.integrations.Core.InvokeLLM({
       prompt: `CALL MAP for ${contact.name} at ${contact.company || "Unknown brokerage"}

CRITICAL — ARRIV IS A REAL ESTATE PHOTOGRAPHY & VIDEO COMPANY. NOTHING ELSE.
- We shoot photos and video for real estate listings. That's it.
- We do NOT offer: websites, marketing platforms, advertising campaigns, CRM tools, lead gen, or anything other than photo/video.
- NEVER use placeholders like "[Your Name]" or "[Your Company]". Use "ARRIV" as company.
- Scripts must be casual and human, not corporate. Reference specific details from history.
- Key stat: "homes with pro media sell 32% faster and for 5-11% more"
- Brad handles pricing questions and closings.

Rep: ${repName || "the rep"} | Contact Intel: ${contactIntel || "N/A"} | Why: ${reason || "routine follow-up"}${patternTagsText}
History: ${historySnippet || "no prior contact"}

Output JSON with ALL 10 sections. Every field required and must be filled with full content.

${scriptPictureUrls.length > 0 ? `Read attached images for full context.\n` : ""}`,
        add_context_from_internet: true,
        file_urls: scriptPictureUrls.length > 0 ? scriptPictureUrls : undefined,
        response_json_schema: {
          type: "object",
          properties: {
            opening: { type: "string", description: "2 sentences, casual, specific. NOT 'Hi this is X from ARRIV'" },
            if_interested: { type: "string", description: "Full 60-second pitch, key points, guide to booking" },
            if_has_photographer: { type: "string", description: "Acknowledge, don't argue, plant seed for future" },
            if_not_interested: { type: "string", description: "Graceful response, leaves door open, mention follow-up" },
            if_send_email: { type: "string", description: "Agree to email but GET COMMITMENT for a call too" },
            if_too_expensive: { type: "string", description: "Value frame, never discount, redirect to Brad for pricing" },
            if_cold_unengaged: { type: "string", description: "Short graceful exit that doesn't burn the bridge" },
            if_busy_bad_time: { type: "string", description: "Acknowledge, lock in specific callback time, end on good note" },
            if_no_answer_voicemail: { type: "string", description: "15 seconds max, word-for-word, conversational" },
            follow_up_text: { type: "string", description: "Send right after voicemail if no answer — short, casual, natural" }
          },
          required: ["opening", "if_interested", "if_has_photographer", "if_not_interested", "if_send_email", "if_too_expensive", "if_cold_unengaged", "if_busy_bad_time", "if_no_answer_voicemail", "follow_up_text"]
        }
      });
      const callMapData = typeof res === "string" ? JSON.parse(res) : res;
      const formatted = `📞 **Opening**\n${callMapData.opening}\n\n🔀 **If they're interested**\n${callMapData.if_interested}\n\n🔀 **If they say "I already have a photographer"**\n${callMapData.if_has_photographer}\n\n🔀 **If they say "Not interested right now"**\n${callMapData.if_not_interested}\n\n🔀 **If they say "Send me an email"**\n${callMapData.if_send_email}\n\n🔀 **If they say "Too expensive"**\n${callMapData.if_too_expensive}\n\n🔀 **If they're cold / one-word answers**\n${callMapData.if_cold_unengaged}\n\n🔀 **If they're busy / bad time**\n${callMapData.if_busy_bad_time}\n\n📵 **If no answer — voicemail**\n${callMapData.if_no_answer_voicemail}\n\n📱 **Follow-up text**\n${callMapData.follow_up_text}`;
      setScript(formatted);
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

      // Create the new permanent follow-up WITH auto-generated call map stored
       if (nextFollowUpDate) {
          let generatedCallMap = "";

          // Generate call map via backend function with full historical context
          try {
            const meta = metaMap[contact.key] || {};
            const recentHistory = contact.activities
              .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
              .slice(0, 15)
              .map(a => `${format(new Date(a.activity_date), "MMM d, yyyy")}: [${a.activity_type}] ${a.notes?.slice(0, 150)}`)
              .join("\n");

            const callMapRes = await base44.functions.invoke('regenerateCallMap', {
              contactName: contact.name,
              contactEmail: contact.email,
              companyName: contact.company,
              contactPhone: contact.phone,
              activityHistory: recentHistory,
              patternTags: meta.patternTags || [],
              reason: meta.reason || "",
              contactIntel: meta.contactIntel || "",
            });

            const callMapData = callMapRes?.data?.call_map;
            if (callMapData && typeof callMapData === 'string' && callMapData.trim().length > 0) {
              generatedCallMap = callMapData;
              console.log('[DailyCallQueue logOutcome] Call map generated, length:', generatedCallMap.length);
            } else {
              console.warn('[DailyCallQueue logOutcome] Invalid call map response:', callMapRes?.data);
            }
          } catch (error) {
            console.error('[DailyCallQueue logOutcome] Call map generation error:', error);
          }

          await base44.entities.ActivityLog.create({
            activity_type: "call",
            contact_name: contact.name,
            contact_email: contact.email,
            contact_phone: contact.phone || "",
            company_name: contact.company,
            activity_date: nextFollowUpDate.toISOString(),
            notes: generatedCallMap ? `${nextNotes}\n\n--- CALL MAP ---\n${generatedCallMap}` : nextNotes,
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
                   <div className="flex items-center gap-2 mt-1 flex-wrap">
                     <Input
                       type="datetime-local"
                       value={editDateValue}
                       onChange={e => setEditDateValue(e.target.value)}
                       className="text-xs h-10 flex-1 min-w-[200px]"
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
                <>
                   <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: 'rgba(184,149,106,0.08)', border: '1px solid rgba(184,149,106,0.25)' }}>
                     <div className="flex items-center justify-between">
                       <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#B8956A' }}>ARRIV Coach</p>
                       <button onClick={generateScript} className="text-xs flex items-center gap-1" style={{ color: 'rgba(26,26,26,0.4)' }}>
                         <RefreshCw className="w-3 h-3" /> Regenerate
                       </button>
                     </div>
                     <ReactMarkdown 
                       className="text-sm prose prose-sm prose-slate max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                       components={{
                         h1: ({ children }) => <h1 className="text-base font-semibold my-2" style={{ color: '#1A1A1A' }}>{children}</h1>,
                         h2: ({ children }) => <h2 className="text-sm font-semibold my-1.5" style={{ color: '#1A1A1A' }}>{children}</h2>,
                         h3: ({ children }) => <h3 className="text-xs font-semibold my-1" style={{ color: '#1A1A1A' }}>{children}</h3>,
                         p: ({ children }) => <p className="text-sm my-1 leading-relaxed" style={{ color: '#1A1A1A' }}>{children}</p>,
                         strong: ({ children }) => <strong className="font-semibold" style={{ color: '#1A1A1A' }}>{children}</strong>,
                         em: ({ children }) => <em className="italic" style={{ color: '#1A1A1A' }}>{children}</em>,
                         ul: ({ children }) => <ul className="list-disc list-inside my-1 ml-2 text-sm" style={{ color: '#1A1A1A' }}>{children}</ul>,
                         ol: ({ children }) => <ol className="list-decimal list-inside my-1 ml-2 text-sm" style={{ color: '#1A1A1A' }}>{children}</ol>,
                         li: ({ children }) => <li className="my-0.5" style={{ color: '#1A1A1A' }}>{children}</li>,
                         blockquote: ({ children }) => <blockquote className="border-l-2 border-[#B8956A] pl-3 my-1 italic" style={{ color: '#1A1A1A' }}>{children}</blockquote>,
                       }}
                     >
                       {script}
                     </ReactMarkdown>
                   </div>
                  {scheduledFollowUp && /--- CALL MAP ---/i.test(scheduledFollowUp.notes || '') && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="w-full gap-2"
                      onClick={() => {
                        // Pass the scheduled follow-up to a modal for viewing
                        window.dispatchEvent(new CustomEvent('openCallMapModal', { detail: { activity: scheduledFollowUp } }));
                      }}
                      style={{ borderColor: '#B8956A', color: '#B8956A' }}
                    >
                      📋 View Full Call Map
                    </Button>
                  )}
                </>
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
  const [viewMapOpenKey, setViewMapOpenKey] = useState(null);

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
              const savedRecord = await saveScheduledFollowUp(contact, analysis, sid, sem, newScheduledMap);
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

      // Generate call maps for all scheduled activities that don't have one yet
      const needsCallMap = filtered.filter(c => {
        const scheduled = newScheduledMap[c.key];
        if (!scheduled) return false;
        const notes = scheduled.notes || '';
        const hasCallMap = /--- CALL MAP ---/i.test(notes);
        return !hasCallMap;
      });

      if (needsCallMap.length > 0) {
        console.log(`[DailyCallQueue loadQueue] Generating call maps for ${needsCallMap.length} contacts...`);
        await Promise.all(
          needsCallMap.map(async (contact) => {
            try {
              const scheduled = newScheduledMap[contact.key];
              console.log(`[DailyCallQueue loadQueue] Generating call map for ${contact.name}`);
              const historySnippet = contact.past
                .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
                .slice(0, 15)
                .map(a => `${format(new Date(a.activity_date), "MMM d, yyyy")}: [${a.activity_type}] ${a.notes?.slice(0, 150)}`)
                .join("\n");
              
              const callMapRes = await base44.functions.invoke('regenerateCallMap', {
                contactName: contact.name,
                contactEmail: contact.email,
                companyName: contact.company,
                contactPhone: contact.phone,
                activityHistory: historySnippet || null,
              });

              const callMap = callMapRes?.data?.call_map;
              if (callMap && typeof callMap === 'string' && callMap.trim().length > 0) {
                console.log(`[DailyCallQueue loadQueue] Updating ActivityLog ${scheduled.id} with call_map, length: ${callMap.length}`);
                const updatedNotes = `${scheduled.notes || ''}\n\n--- CALL MAP ---\n${callMap}`;
                await base44.entities.ActivityLog.update(scheduled.id, {
                  notes: updatedNotes
                });
                // Directly update local state with the updated notes
                newScheduledMap[contact.key] = { ...scheduled, notes: updatedNotes };
                console.log(`[DailyCallQueue loadQueue] Updated local state with call_map for ${contact.name}`);
              } else {
                console.warn(`[DailyCallQueue loadQueue] Invalid/missing call_map for ${contact.name}:`, callMapRes?.data);
              }
            } catch (e) {
              console.error(`[DailyCallQueue loadQueue] Failed to generate call map for ${contact.name}:`, e);
            }
          })
        );
        // Force a complete state update to trigger re-renders
         console.log('[DailyCallQueue loadQueue] Call map generation complete. Final scheduled:', Object.keys(newScheduledMap).map(k => ({ contact: k, hasCallMap: !!newScheduledMap[k].call_map })));
         setScheduledMap({ ...newScheduledMap });
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
            {upcomingContacts.map(contact => (
              <UpcomingCard
                key={contact.key}
                contact={contact}
                scheduled={scheduledMap[contact.key]}
                meta={metaMap[contact.key] || {}}
                onDeleted={() => setRefreshKey(k => k + 1)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
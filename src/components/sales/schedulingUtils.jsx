import { base44 } from "@/api/base44Client";
import { format, addDays } from "date-fns";

export function getBestTime(contact) {
  const notes = (contact.activities || []).map(a => (a.notes || "").toLowerCase()).join(" ");
  if (notes.includes("morning") || notes.includes("9am") || notes.includes("8am") || notes.includes("early")) return "8:00–9:00 AM";
  if (notes.includes("lunch") || notes.includes("noon") || notes.includes("12pm") || notes.includes("midday")) return "12:00–1:00 PM";
  if (notes.includes("evening") || notes.includes("5pm") || notes.includes("6pm") || notes.includes("after showing") || notes.includes("after 4") || notes.includes("after 5")) return "5:00–7:00 PM";
  if (notes.includes("afternoon") || notes.includes("2pm") || notes.includes("3pm")) return "1:00–2:00 PM";
  const today = new Date().getDay();
  if (today === 0 || today === 6 || today === 5) return "Mon–Wed 8:00–9:00 AM";
  return "5:00–7:00 PM";
}

export function buildLearnedContext(insights) {
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

export async function analyzeContact(contact, learnedContext) {
  // Filter out HubSpot sync logs — they are not real interactions and confuse the AI
  const realActivities = (contact.activities || [])
    .filter(a => !/^Contact (created|updated):/i.test((a.notes || '').trim()))
    .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date));

  const historyText = realActivities
    .slice(0, 15)
    .map(a => {
      const pics = a.picture_urls?.length ? ` [has ${a.picture_urls.length} attached image(s)]` : "";
      return `${format(new Date(a.activity_date), "MMM d, yyyy")} [${a.activity_type}]: ${a.notes}${pics}`;
    })
    .join("\n");

  const allPictureUrls = realActivities
    .slice(0, 15)
    .flatMap(a => a.picture_urls || [])
    .slice(0, 6);

  const today = format(new Date(), "MMM d, yyyy");
  const dayOfWeek = new Date().getDay();
  const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dayOfWeek];

  const searchQuery = [contact.name, contact.company, "realtor", "real estate"].filter(Boolean).join(" ");

  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `You are a sharp sales intelligence agent for ARRIV, a real estate photography company. Your ONLY job: read the contact's history, understand EXACTLY what they said, and schedule the next call at the RIGHT time.

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

⚠️ CRITICAL SCHEDULING RULES:
Read every note and attachment carefully before deciding. Use the most specific timing signals you find.
⚠️ BRAD'S AVAILABLE CALL WINDOWS — YOU MUST ONLY SCHEDULE WITHIN THESE TIMES, NO EXCEPTIONS:
  - Window A: 7:55 AM – 8:15 AM  → use 8:00 AM
  - Window B: 10:15 AM – 10:38 AM → use 10:15 AM
  - Window C: After 2:15 PM → use 2:30 PM (or later, up to 7pm)
NEVER schedule at 8:30am, 9am, 12pm, or any time outside these three windows. If a realtor prefers "morning" — pick Window A or B. If "afternoon/evening" — pick Window C.

1. DID THEY GIVE A SPECIFIC CALLBACK TIME? ("call me back at 2pm today", "tomorrow morning", "next Monday", "in 2 weeks")
   → Schedule EXACTLY then. Urgency: high.

2. ⚠️ DID THEY SAY THEY'LL REACH OUT TO YOU WHEN READY? ("I'll reach out when ready", "I'll contact you when I have listings", "I'll call you when I need it", "will reach out", "will contact you", "she'll reach out", "she will contact", "will get back to me", "she said she would reach out")
   → THIS RULE OVERRIDES EVERYTHING ELSE, even if they sounded warm or have listings. Schedule 30–45 days out. Urgency: skip. DO NOT treat "has listings coming up" as a warm lead if they also said THEY will contact YOU.

3. ARE THEY A WARM LEAD? (said "interested", "sounds good", "send me info", asked pricing questions — AND did NOT say they'll reach out to you)
   → Schedule 2–4 days out at best contact window. Urgency: high.

4. DID THEY SAY "NOT INTERESTED"? (firm no, rejection)
   → Schedule 30–45 days out. Urgency: low.

5. NO ANSWER / LEFT VOICEMAIL
   → Schedule 3–5 days out at a DIFFERENT time window than last attempt. Urgency: medium.

6. THEY SAID THEY'RE BUSY/BAD TIME (but no specific callback time given)
   → Schedule 3–5 days out at best contact window. Urgency: medium.

7. GENERAL CONVERSATION / TOUCHPOINT (no specific signal)
   → Schedule 3–5 days out. Urgency: medium.

8. CONTACT CREATED or FIRST CONTACT (only activity is a "Contact created:" or "FIRST CONTACT:" note — brand new, never called)
   → Schedule TODAY (same business day) if before 5pm, otherwise NEXT business day morning. Use 8–9am, 12–1pm, or 5–7pm based on realtor research. Urgency: HIGH. DO NOT schedule more than 1 business day out. DO NOT use 7 days.

9. HAS SOME HISTORY BUT NO CLEAR SIGNAL
   → Schedule 3–5 days out at best contact window. Urgency: medium.

⚠️ CRITICAL: follow_up_date_time MUST use one of Brad's 3 windows:
  - 08:00 (Window A: 7:55–8:15am)
  - 10:15 (Window B: 10:15–10:38am)
  - 14:30 (Window C: after 2:15pm)
NEVER output a time like 08:30, 09:00, 12:00, 17:00, etc. Only 08:00, 10:15, or 14:30 (or later in Window C if contact prefers evening — up to 19:00).
AVOID weekends & Friday evenings.

CHANNEL: Default=call. Switch to TEXT only if they explicitly said "text me". EMAIL only if they asked.

BOX / INTRO PACKAGE SENT: If any note mentions "box sent", "intro package sent", "package sent", "sent a box", "sent an intro", or any close variation — this means a physical introduction package was mailed to this realtor. The opening script MUST reference this: "Hi [Name], my name is Brad Burke, a local real estate media provider — do you have a moment? I recently sent over a small introduction package and just wanted to introduce myself personally." Then after they respond: "Glad it made it. I provide full-service real estate media — photography, video, and drone — and I just wanted to put a voice behind the name. [Reference their specific listing if found via research.] I would love to help you get it to the closing table by adding a 2–3 minute MLS-ready video that you can just drop into the listing." If they say they don't need it: "Totally understand. If you ever need backup coverage or something with a quick turnaround, I'd be happy to be a resource."

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

export async function saveScheduledFollowUp(contact, analysis, sid, sem, existingScheduledMap) {
  // If AI provided a date/time, use it directly (AI already chose the best time)
  // Only apply time-window logic if AI didn't provide a specific time
  let followUpDate = null;
  let useAITimeDirectly = false;

  // Brad's available call windows: 8:00am, 10:15am, or 2:30pm
  const snapToAvailableWindow = (date) => {
    const h = date.getHours();
    const m = date.getMinutes();
    const totalMins = h * 60 + m;
    // Window A: 7:55–8:15 → 8:00
    // Window B: 10:15–10:38 → 10:15
    // Window C: after 14:15 → 14:30
    if (totalMins <= 8 * 60 + 30) { date.setHours(8, 0, 0, 0); }
    else if (totalMins <= 11 * 60) { date.setHours(10, 15, 0, 0); }
    else { date.setHours(14, 30, 0, 0); }
    return date;
  };

  // HARD OVERRIDE: If contact has no real past interactions (excluding Contact created/updated logs
  // and future AI-scheduled tasks), treat as new and force same/next business day.
  const pastRealInteractions = (contact.activities || []).filter(a => {
    const notes = (a.notes || '').trim();
    const actDate = new Date(a.activity_date);
    const isPast = actDate <= new Date();
    const isSystemLog = /^Contact (created|updated):/i.test(notes);
    const isAIScheduled = /^\[AI Scheduled\]/i.test(notes);
    return isPast && !isSystemLog && !isAIScheduled;
  });

  // Also treat as new if all real interactions are notes/references saying they've never been called
  const neverSpokenPhrases = /never spoken|never called|never talked|never contacted|haven't spoken|haven't called|has not been called|not yet called|first contact|no prior contact/i;
  const allActivitiesAreNeverSpoken = pastRealInteractions.length > 0 &&
    pastRealInteractions.every(a => neverSpokenPhrases.test(a.notes || ''));

  const isNewContact = pastRealInteractions.length === 0 || allActivitiesAreNeverSpoken;

  if (isNewContact) {
    const now = new Date();
    const d = new Date(now);
    const isBusinessDay = d.getDay() >= 1 && d.getDay() <= 5;
    const nowMins = now.getHours() * 60 + now.getMinutes();
    // Try to fit into today's remaining windows
    if (isBusinessDay && nowMins < 7 * 60 + 55) {
      d.setHours(8, 0, 0, 0);
    } else if (isBusinessDay && nowMins < 10 * 60 + 15) {
      d.setHours(10, 15, 0, 0);
    } else if (isBusinessDay && nowMins < 14 * 60 + 15) {
      d.setHours(14, 30, 0, 0);
    } else {
      // Push to next business day Window A
      d.setDate(d.getDate() + 1);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      d.setHours(8, 0, 0, 0);
    }
    followUpDate = d;
    useAITimeDirectly = true;
  } else if (analysis.follow_up_date_time) {
    const aiDate = new Date(analysis.follow_up_date_time);
    const aiHour = aiDate.getHours();
    if (aiHour >= 7 && aiHour <= 19) {
      followUpDate = snapToAvailableWindow(aiDate);
      useAITimeDirectly = true;
    }
  }

  if (!followUpDate) {
    // Default to next business day at 8:00am (Window A)
    const d = new Date();
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    followUpDate = d;
  }

  // Only apply time-window logic if AI didn't provide a specific time
  if (!useAITimeDirectly) {
    // Check if this is a brand-new contact (only has a "Contact created:" or "FIRST CONTACT:" note)
    const allNotes = (contact.activities || []).map(a => (a.notes || "").trim());
    const isNewContactOnly = allNotes.length > 0 && allNotes.every(n => /^(Contact created:|Contact updated:|FIRST CONTACT:)/i.test(n));

    // For new contacts, ALWAYS force same/next business day — no exceptions
    if (isNewContactOnly) {
      const now = new Date();
      followUpDate = new Date(now);
      const isBusinessDay = followUpDate.getDay() >= 1 && followUpDate.getDay() <= 5;
      const isBeforeEnd = followUpDate.getHours() < 17;
      if (!isBusinessDay || !isBeforeEnd) {
        followUpDate.setDate(followUpDate.getDate() + 1);
        while (followUpDate.getDay() === 0 || followUpDate.getDay() === 6) {
          followUpDate.setDate(followUpDate.getDate() + 1);
        }
      }
      // Default to 8:00am (Window A)
      followUpDate.setHours(8, 0, 0, 0);
      // If the time is already past today, use next available window or next business day
      if (followUpDate <= now) {
        const nowMins = now.getHours() * 60 + now.getMinutes();
        if (isBusinessDay && nowMins < 10 * 60) {
          followUpDate.setHours(10, 15, 0, 0); // Window B
        } else if (isBusinessDay && nowMins < 14 * 60 + 15) {
          followUpDate.setHours(14, 30, 0, 0); // Window C
        } else {
          followUpDate.setDate(followUpDate.getDate() + 1);
          while (followUpDate.getDay() === 0 || followUpDate.getDay() === 6) {
            followUpDate.setDate(followUpDate.getDate() + 1);
          }
          followUpDate.setHours(8, 0, 0, 0);
        }
      }
    }

    // Safety: don't schedule in the past
    if (followUpDate < new Date()) {
      followUpDate = addDays(new Date(), 1);
      while (followUpDate.getDay() === 0 || followUpDate.getDay() === 6) {
        followUpDate.setDate(followUpDate.getDate() + 1);
      }
      followUpDate.setHours(8, 0, 0, 0);
    }
  }

  let initialNotes = `[AI Scheduled] ${analysis.reason || "Follow-up call"} | Opener: ${analysis.suggested_opener || ""}`;

  // Generate call map
  try {
    const historySnippet = (contact.activities || [])
      .filter(a => !/^Contact (created|updated):/i.test((a.notes || '').trim()))
      .slice(0, 4)
      .map(a => {
        const pics = a.picture_urls?.length ? ` [+${a.picture_urls.length} image(s)]` : "";
        return `${format(new Date(a.activity_date), "MMM d")}: ${a.activity_type} — ${(a.notes || "").slice(0, 120)}${pics}`;
      }).join("\n");

    const scriptPictureUrls = (contact.activities || []).slice(0, 6).flatMap(a => a.picture_urls || []).slice(0, 6);

    const allActivityNotes = (contact.activities || []).map(a => a.notes || "").join(" ");
    const boxSent = /box sent|intro package sent|package sent|sent a box|sent an intro|introduction package|sent box|mailed a box|mailed package/i.test(allActivityNotes);
    const isFirstContact = (contact.activities || []).every(a => /^(FIRST CONTACT:|Contact created:)/i.test((a.notes || "").trim()));
    const firstName = contact.name?.split(' ')[0] || 'there';

    const firstContactScript = isFirstContact && !boxSent ? `
⚠️ THIS IS A BRAND NEW CONTACT — FIRST CALL EVER. Use this exact opening structure:
Opening: "Hi ${firstName}, this is Brad — I'm a local real estate media creator. Do you have a moment?"
[Pause briefly]
Then: "I came across your listing on [find their active listing from market research — street name or area] — it's a beautiful home."
[Pause]
Then: "I noticed the listing currently has photos but no video, so I wanted to reach out. I create clean, unbranded video tours that are MLS-ready, so agents can drop them straight into the listing without changing anything else."
[Pause]
Then: "If video isn't something you're planning to add, totally fine — I just wanted to see if it's something you'd be open to considering."

If they have NO active listing found: Skip the listing reference. Instead: "I work with realtors in the area providing full-service real estate media — photography, video, and drone. I just wanted to introduce myself and see if you'd be open to connecting."
` : "";

    const boxSentContext = boxSent ? `
    ⚠️ BOX / INTRO PACKAGE WAS SENT TO THIS CONTACT. The opening MUST be:
    "Hi ${contact.name?.split(' ')[0] || '[Name]'}, my name is Brad Burke, a local real estate media provider — do you have a moment? I recently sent over a small introduction package and just wanted to introduce myself personally."
    [Pause. Let them respond.]
    Then: "Glad it made it. I provide full-service real estate media — photography, video, and drone — and I just wanted to put a voice behind the name. [Reference their active listing if found.] I would love to help you get it to the closing table by adding a 2–3 minute MLS-ready video you can just drop into the listing."
    If they say won't need it: "Totally understand. If you ever need backup coverage or something with a quick turnaround, I'd be happy to be a resource."
    ` : "";

    // Fetch system-wide learned style preferences
    let learnedStyleCtx = "";
    try {
      const styleProfiles = await base44.entities.SalesRepStyleProfile.list();
      if (styleProfiles?.length > 0) {
        const totalEdits = styleProfiles.reduce((s, p) => s + (p.edit_count || 0), 0);
        const allPrefs = styleProfiles.filter(p => p.learned_preferences).map(p => p.learned_preferences).join('\n\n---\n\n');
        if (allPrefs) learnedStyleCtx = `\n\nSYSTEM-LEARNED CALL MAP IMPROVEMENTS (from ${totalEdits} rep edits — apply ALL of these style improvements to every section):\n${allPrefs.slice(0, 2000)}\n`;
      }
    } catch (e) {}

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `CALL MAP for ${contact.name} at ${contact.company || "Unknown brokerage"}
    ${learnedStyleCtx}
    CRITICAL — ARRIV IS A REAL ESTATE PHOTOGRAPHY & VIDEO COMPANY. NOTHING ELSE.
    - We shoot photos and video for real estate listings. That's it.
    - We do NOT offer: websites, marketing platforms, advertising campaigns, CRM tools, lead gen, or anything other than photo/video.
    - NEVER use placeholders like "[Your Name]" or "[Your Company]". Use "ARRIV" as company.
    - Scripts must be casual and human, not corporate. Reference specific details from history.
    - Key stat: "homes with pro media sell 32% faster and for 5-11% more"
    - Brad handles pricing questions and closings.
    ${boxSentContext}${firstContactScript}
    History: ${historySnippet || "no prior contact"}

    Output JSON with ALL 10 sections. Every field required and must be filled with full content.

    ${scriptPictureUrls.length > 0 ? `Read attached images for full context.\n` : ""}`,
      add_context_from_internet: true,
      file_urls: scriptPictureUrls.length > 0 ? scriptPictureUrls : undefined,
      response_json_schema: {
        type: "object",
        properties: {
          opening: { type: "string" },
          if_interested: { type: "string" },
          if_has_photographer: { type: "string", description: "They already use a photographer. Acknowledge it warmly, then mention ARRIV provides BOTH photography AND video as full-service media. Don't dismiss their photographer — position ARRIV as an add-on/upgrade. Example: 'That's great! We actually do photography too, but we also specialize in video tours. A lot of agents use us alongside their existing photographer to add video to their listings. Worth keeping in mind as an add-on.' OR 'Awesome — we do full-service real estate media including photos and video, so we could potentially upgrade what you're already doing or add video tours.'" },
          if_not_interested: { type: "string" },
          if_send_email: { type: "string" },
          if_too_expensive: { type: "string" },
          if_cold_unengaged: { type: "string" },
          if_busy_bad_time: { type: "string" },
          if_no_answer_voicemail: { type: "string" },
          follow_up_text: { type: "string" }
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

  const res = await base44.functions.invoke('manageSalesActivity', {
    action: 'create',
    sales_member_id: sid,
    data: {
      activity_type: "call",
      contact_name: contact.name,
      contact_email: contact.email,
      contact_phone: contact.phone || "",
      company_name: contact.company,
      activity_date: followUpDate.toISOString(),
      notes: initialNotes,
      sales_member_email: sem,
    },
  });
  const record = res?.data?.activity || res?.activity;

  return record;
}
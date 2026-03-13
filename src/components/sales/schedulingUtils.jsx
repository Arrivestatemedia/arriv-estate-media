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
  const historyText = (contact.activities || [])
    .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
    .slice(0, 15)
    .map(a => {
      const pics = a.picture_urls?.length ? ` [has ${a.picture_urls.length} attached image(s)]` : "";
      return `${format(new Date(a.activity_date), "MMM d, yyyy")} [${a.activity_type}]: ${a.notes}${pics}`;
    })
    .join("\n");

  const allPictureUrls = (contact.activities || [])
    .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
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
For the TIME of day: use realtor behavior research — realtors are most reachable 8-9am (before showings), 12-1pm (lunch), and 5-7pm (after showings). Pick the best window based on what you know about this contact.

1. DID THEY GIVE A SPECIFIC CALLBACK TIME? ("call me back at 2pm today", "tomorrow morning", "next Monday", "in 2 weeks")
   → Schedule EXACTLY then. Urgency: high.

2. DID THEY SAY THEY'LL CALL YOU? ("I'll get back to you", "I'll reach out when ready")
   → Schedule 45 days out. Urgency: skip.

3. ARE THEY A WARM LEAD? (said "interested", "sounds good", "send me info", asked pricing questions)
   → Schedule 2–4 days out at best contact window. Urgency: high.

4. DID THEY SAY "NOT INTERESTED"? (firm no, rejection)
   → Schedule 30–45 days out. Urgency: low.

5. NO ANSWER / LEFT VOICEMAIL
   → Schedule 3–5 days out at a DIFFERENT time window than last attempt. Urgency: medium.

6. THEY SAID THEY'RE BUSY/BAD TIME (but no specific callback time given)
   → Schedule 3–5 days out at best contact window. Urgency: medium.

7. GENERAL CONVERSATION / TOUCHPOINT (no specific signal)
   → Schedule 7–14 days out. Urgency: medium.

8. CONTACT CREATED (only activity is a "Contact created:" note — brand new, never called)
   → Schedule TODAY if it's a business day before 5pm, otherwise NEXT business day. Pick the best time window for realtors based on your research. Urgency: high. FRESH lead — call immediately.

9. FIRST CONTACT (has some history but no clear signal)
   → Schedule 5–7 days out at best contact window. Urgency: high.

BEST TIMES: 8–9am > 12–1pm > 5–7pm. AVOID weekends & Friday evenings.

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
  let followUpDate = analysis.follow_up_date_time
    ? new Date(analysis.follow_up_date_time)
    : addDays(new Date(), 7);

  // Check if this is a brand-new contact (only has a "Contact created:" note)
  const allNotes = (contact.activities || []).map(a => (a.notes || "").trim());
  const isNewContactOnly = allNotes.length > 0 && allNotes.every(n => /^Contact created:/i.test(n));

  // For new contacts, always force same/next business day regardless of what AI returned
  if (isNewContactOnly) {
    const now = new Date();
    const isBusinessDay = now.getDay() >= 1 && now.getDay() <= 5;
    const isBeforeEnd = now.getHours() < 17;
    followUpDate = new Date(now);
    if (!isBusinessDay || !isBeforeEnd) {
      do {
        followUpDate.setDate(followUpDate.getDate() + 1);
      } while (followUpDate.getDay() === 0 || followUpDate.getDay() === 6);
    }
    // Keep the AI-suggested hour if it's in the future today, else default to 8:30am
    const aiHour = analysis.follow_up_date_time ? new Date(analysis.follow_up_date_time).getHours() : 8;
    const aiMinute = analysis.follow_up_date_time ? new Date(analysis.follow_up_date_time).getMinutes() : 30;
    followUpDate.setHours(aiHour || 8, aiMinute || 30, 0, 0);
    if (followUpDate < now) followUpDate.setHours(now.getHours() + 1, 0, 0, 0);
  }

  // Safety: don't schedule in the past
  if (followUpDate < new Date()) {
    followUpDate = addDays(new Date(), 1);
    while (followUpDate.getDay() === 0 || followUpDate.getDay() === 6) {
      followUpDate.setDate(followUpDate.getDate() + 1);
    }
    followUpDate.setHours(8, 30, 0, 0);
  }

  const bestTimeStr = getBestTime(contact);
  const isEveningPreferred = bestTimeStr.includes("5:00") || bestTimeStr.includes("7:00") || bestTimeStr.includes("PM");
  const isMorningPreferred = bestTimeStr.includes("8:00") || bestTimeStr.includes("9:00") || bestTimeStr.includes("Mon–Wed");
  const isNoonPreferred = bestTimeStr.includes("12:00") || bestTimeStr.includes("1:00 PM");
  const isAfternoonPreferred = bestTimeStr.includes("1:00") || bestTimeStr.includes("2:00");

  if (sem === 'bradley@arrivestatemedia.com' || sem?.toLowerCase().includes('bradley') || sem?.toLowerCase().includes('brad')) {
    const allWindows = [
      { start: 7.9167, end: 8.167 },
      { start: 10.25, end: 10.633 },
      { start: 14.25, end: 24 }
    ];
    const windows = isEveningPreferred
      ? [allWindows[2], allWindows[0], allWindows[1]]
      : isNoonPreferred || isAfternoonPreferred
        ? [allWindows[1], allWindows[2], allWindows[0]]
        : allWindows;

    let found = false;
    for (let dayOffset = 0; dayOffset < 14 && !found; dayOffset++) {
      let adjusted = new Date(followUpDate);
      adjusted.setDate(adjusted.getDate() + dayOffset);
      adjusted.setHours(0, 0, 0, 0);

      for (const window of windows) {
        let testTime = new Date(adjusted);
        testTime.setHours(Math.floor(window.start), Math.round((window.start % 1) * 60), 0, 0);
        const maxMinutes = Math.floor(window.end) * 60 + Math.round((window.end % 1) * 60);

        while (testTime.getHours() * 60 + testTime.getMinutes() < maxMinutes) {
          if (testTime > new Date()) {
            const conflict = existingScheduledMap && Object.values(existingScheduledMap).some(s => {
              return Math.abs(testTime - new Date(s.activity_date)) / 60000 < 5;
            });
            if (!conflict) {
              followUpDate = testTime;
              found = true;
              break;
            }
          }
          testTime.setMinutes(testTime.getMinutes() + 5);
        }
        if (found) break;
      }
    }
  } else {
    const allOptimalWindows = [
      { start: 9, end: 11 },
      { start: 13, end: 15 },
      { start: 17, end: 19 }
    ];
    const optimalWindows = isEveningPreferred
      ? [allOptimalWindows[2], allOptimalWindows[0], allOptimalWindows[1]]
      : isNoonPreferred || isAfternoonPreferred
        ? [allOptimalWindows[1], allOptimalWindows[2], allOptimalWindows[0]]
        : allOptimalWindows;

    let found = false;
    for (let dayOffset = 0; dayOffset < 14 && !found; dayOffset++) {
      let adjusted = new Date(followUpDate);
      adjusted.setDate(adjusted.getDate() + dayOffset);
      adjusted.setHours(0, 0, 0, 0);
      for (const window of optimalWindows) {
        const testTime = new Date(adjusted);
        testTime.setHours(window.start, 0, 0, 0);
        if (testTime > new Date()) {
          followUpDate = testTime;
          found = true;
          break;
        }
      }
    }
  }

  let initialNotes = `[AI Scheduled] ${analysis.reason || "Follow-up call"} | Opener: ${analysis.suggested_opener || ""}`;

  // Generate call map
  try {
    const historySnippet = (contact.activities || []).slice(0, 4).map(a => {
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

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `CALL MAP for ${contact.name} at ${contact.company || "Unknown brokerage"}

    CRITICAL — ARRIV IS A REAL ESTATE PHOTOGRAPHY & VIDEO COMPANY. NOTHING ELSE.
    - We shoot photos and video for real estate listings. That's it.
    - We do NOT offer: websites, marketing platforms, advertising campaigns, CRM tools, lead gen, or anything other than photo/video.
    - NEVER use placeholders like "[Your Name]" or "[Your Company]". Use "ARRIV" as company.
    - Scripts must be casual and human, not corporate. Reference specific details from history.
    - Key stat: "homes with pro media sell 32% faster and for 5-11% more"
    - Brad handles pricing questions and closings.
    ${boxSentContext}
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
          if_has_photographer: { type: "string" },
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
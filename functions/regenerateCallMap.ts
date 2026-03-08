import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { activityId, contactName, contactEmail, companyName } = await req.json();

    // Fetch the activity and related history
    const activity = await base44.entities.ActivityLog.get(activityId);
    if (!activity) {
      return Response.json({ error: 'Activity not found' }, { status: 404 });
    }

    // Fetch past activities for this contact
    const pastActivities = await base44.entities.ActivityLog.filter({
      contact_email: contactEmail,
    }, '-activity_date', 10);

    // Build history snippet
    const historySnippet = pastActivities.slice(0, 4).map(a => {
      const pics = a.picture_urls?.length ? ` [+${a.picture_urls.length} image(s)]` : "";
      const dateStr = new Date(a.activity_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${dateStr}: ${a.activity_type} — ${a.notes.slice(0, 120)}${pics}`;
    }).join("\n");

    // Collect picture URLs for context
    const pictureUrls = pastActivities
      .slice(0, 6)
      .flatMap(a => a.picture_urls || [])
      .slice(0, 6);

    // Generate call map via LLM
    const callMapRes = await base44.integrations.Core.InvokeLLM({
      prompt: `You're helping a sales rep at ARRIV (real estate photography company) prep for a call with ${contactName}${companyName ? ` from ${companyName}` : ""}. Write a COMPLETE CALL MAP — every branch of the conversation covered. This should sound like a real person who knows them, not a salesperson reading off a sheet.

What we know:
- Contact: ${contactName}
- Company: ${companyName || "unknown"}
- History: ${historySnippet || "no prior contact"}

TONE RULES (critical):
- Write like a human talks, not how a textbook describes sales
- Short sentences. Contractions. Natural pauses built in.
- No buzzwords like "leverage", "synergy", "value proposition"
- Use what you know about them specifically — generic lines get hung up on
- Confident but relaxed

FORMAT — cover EVERY section:

📞 **Opening** (1-2 sentences, casual, specific to this person)

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

${pictureUrls.length > 0 ? `NOTE: There are attached images from past activities — READ THEM to understand the full context before writing this guide.` : ""}`,
      add_context_from_internet: true,
      file_urls: pictureUrls.length > 0 ? pictureUrls : undefined,
    });

    const newCallMap = typeof callMapRes === "string" ? callMapRes : callMapRes?.text || String(callMapRes);

    return Response.json({ call_map: newCallMap });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
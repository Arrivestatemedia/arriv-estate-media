import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { activityId, contactName, contactCompany, contactPhone, history, reason, pictureUrls } = await req.json();

    const prompt = `You're helping a sales rep at ARRIV (real estate photography company) prep for a call with ${contactName}${contactCompany ? ` from ${contactCompany}` : ""}. Write a COMPLETE CALL MAP — every branch of the conversation covered. This should sound like a real person who knows them, not a salesperson reading off a sheet.

What we know:
- Contact intel: Realtor at ${contactCompany || "unknown brokerage"}
- Why calling now: ${reason || "scheduled follow-up"}
- History: ${history || "no prior contact"}

TONE RULES (critical):
- Write like a human talks, not how a textbook describes sales
- Short sentences. Contractions. Natural pauses built in.
- No buzzwords like "leverage", "synergy", "value proposition"
- The opener should NOT start with "Hi, this is [name] from ARRIV" — they can see the number
- Use what you know about them specifically — generic lines get hung up on
- Confident but relaxed — like calling a colleague you've met before

PERSUASION PRINCIPLES (weave in naturally):
- Say something unexpected first to break the auto-reject mode
- Reference something specific about their market or listings
- One genuine stat if it fits: listings with pro media sell 32% faster, 5-11% more
- Ask one question that makes them curious rather than defensive
- If they push back, acknowledge it genuinely before responding

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
[Exact lines — hand off to Brad naturally: "Our owner Brad will walk you through the rest."]`;

    const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      ...(pictureUrls?.length > 0 ? { file_urls: pictureUrls } : {})
    });

    const callMap = typeof res === 'string' ? res : res?.text || String(res);

    // Update the ActivityLog record with the full call map in notes
    if (activityId) {
      const existing = await base44.asServiceRole.entities.ActivityLog.filter({ id: activityId });
      if (existing?.[0]) {
        const oldNotes = existing[0].notes || '';
        // Keep the [AI Scheduled] prefix and reason, replace/append the call map
        const prefix = oldNotes.match(/^\[AI Scheduled\][^|]*/)?.[0]?.trim() || '[AI Scheduled]';
        await base44.asServiceRole.entities.ActivityLog.update(activityId, {
          notes: `${prefix}\n\n--- CALL MAP ---\n${callMap}`
        });
      }
    }

    return Response.json({ success: true, callMap });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
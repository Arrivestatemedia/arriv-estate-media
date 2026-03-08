import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { activityId, contactName, contactEmail, companyName, contactPhone } = await req.json();

    // If activityId provided, fetch it; otherwise it's a pre-creation scenario
    let activity = null;
    if (activityId) {
      activity = await base44.entities.ActivityLog.get(activityId);
      if (!activity) {
        return Response.json({ error: 'Activity not found' }, { status: 404 });
      }
    }

    // Fetch past activities for this contact
    const pastActivities = await base44.entities.ActivityLog.filter({
      contact_email: contactEmail,
    }, '-activity_date', 15);

    // Fetch SMS conversation history
    let smsHistory = "";
    if (contactPhone) {
      try {
        const smsConversation = await base44.entities.SmsConversation.filter({
          from_number: contactPhone,
        }, '-last_message_at', 1);
        
        if (smsConversation.length > 0) {
          const messages = await base44.entities.SmsMessage.filter({
            conversation_id: smsConversation[0].id,
          }, '-created_date', 20);
          
          smsHistory = messages.map(m => {
            const direction = m.direction === 'inbound' ? 'Contact' : 'Rep';
            const time = new Date(m.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return `${time} ${direction}: ${m.body}`;
          }).reverse().join("\n");
        }
      } catch (e) {
        console.log('SMS fetch skipped:', e.message);
      }
    }

    // Fetch HubSpot contact data
    let hubspotData = "";
    try {
      const { accessToken } = await base44.asServiceRole.connectors.getConnection("hubspot");
      const searchRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "email",
                  operator: "EQ",
                  value: contactEmail,
                }
              ]
            }
          ],
          limit: 1,
          properties: [
            "firstname",
            "lastname",
            "jobtitle",
            "company",
            "phone",
            "lifecyclestage",
            "hs_lead_status",
            "num_notes",
            "num_contacted_notes",
            "hubspotutk",
            "recent_deal_amount",
            "hs_analytics_num_page_views",
            "notes_last_updated",
          ],
        }),
      });

      const searchData = await searchRes.json();
      if (searchData.results && searchData.results.length > 0) {
        const contact = searchData.results[0].properties;
        hubspotData = `Job Title: ${contact.jobtitle || "unknown"}
Company: ${contact.company || "unknown"}
Lifecycle Stage: ${contact.lifecyclestage || "unknown"}
Lead Status: ${contact.hs_lead_status || "unknown"}
Notes on File: ${contact.num_notes || 0}
Last Activity: ${contact.notes_last_updated || "never"}
Page Views: ${contact.hs_analytics_num_page_views || 0}`;
      }
    } catch (e) {
      console.log('HubSpot fetch skipped:', e.message);
    }

    // Build comprehensive history snippet
    const historySnippet = pastActivities.slice(0, 6).map(a => {
      const pics = a.picture_urls?.length ? ` [+${a.picture_urls.length} image(s)]` : "";
      const dateStr = new Date(a.activity_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${dateStr} (${a.activity_type}): ${a.notes.slice(0, 100)}${pics}`;
    }).join("\n");

    // Collect all picture URLs for LLM analysis
    const pictureUrls = pastActivities
      .flatMap(a => a.picture_urls || [])
      .slice(0, 8);

    // Do web research on contact/company to find market intel
    const webResearch = await base44.integrations.Core.InvokeLLM({
      prompt: `Quickly research: ${contactName}${companyName ? ` at ${companyName}` : ""}. Find: their recent listings, market trends in their area, company size, specialties. Be concise.`,
      add_context_from_internet: true,
    });

    const marketIntel = typeof webResearch === "string" ? webResearch : webResearch?.text || "";

    // Generate comprehensive call map
    const callMapRes = await base44.integrations.Core.InvokeLLM({
      prompt: `You're helping a sales rep at ARRIV (real estate photography company) prep for a call with ${contactName}. Write a COMPLETE CALL MAP weaving in all context. Every conversation branch covered. Sound like a real person who knows them.

PROFILE DATA:
${hubspotData}

MARKET INTEL:
${marketIntel}

CALL HISTORY:
${historySnippet || "No prior activities"}

${smsHistory ? `TEXT MESSAGE HISTORY (analyze the tone, concerns, interests):\n${smsHistory}\n` : ""}

BRAD'S PROVEN CLOSING FRAMEWORK:
1. Open specific to them (reference actual conversation or market detail)
2. Lead with urgency: "listings with pro media sell 32% faster, 5-11% higher"
3. Handle objections gracefully, never argue
4. Close with: "Brad handles the rest" — makes transition seamless
5. For objections: acknowledge first, then redirect

MARKET-SPECIFIC STRATEGIES:
- If high-end market: emphasize luxury presentation & MLS impact
- If volume market: stress speed & consistency
- If new agent: position as "competitive edge they're missing"
- If established: "upgrade to stay ahead of competitors"

TONE RULES:
- Write like humans talk — short sentences, contractions, natural pauses
- No buzzwords (leverage, synergy, value prop)
- Specific to THEM, not generic
- Confident but relaxed

⚠️ CRITICAL: You MUST output EVERY single section below. None optional. This is a complete call map, not just an opener.

FORMAT — cover EVERY path:

📞 **Opening** (1-2 sentences, casual, specific to this person — reference something real from their history or market)

🔀 **If they're open/interested:**
[Under 60 seconds. Key points in plain language. Guide toward booking with Brad.]

🔀 **If objection — "I already have a photographer":**
[Acknowledge. Plant seed about upgrade or backup coverage.]

🔀 **If objection — "Not interested right now":**
[Graceful. Leave door open. "When's a better time?"]

🔀 **If objection — "Send me an email":**
[Agree. Lock in brief follow-up call too: "I'll send that now. Quick call tomorrow?"]

🔀 **If objection — "Too expensive":**
[Value-first. "We're ROI-focused. Brad can discuss packages." Never discount.]

🔀 **If they're cold/one-word answers:**
[Graceful exit. "I'll follow up next quarter. Good luck with listings."]

🔀 **If they're busy/bad timing:**
[Respect time. Lock specific callback: "Thursday 2pm work better?"]

📵 **Voicemail** (15 sec max, word-for-word):
[Sound natural. Quick. Reference something specific. Leave Brad's number.]

📱 **Follow-up text** (send right after voicemail):
[2-3 sentences. Casual. Include link to portfolio or closing stat.]

🏁 **Closing / Ready to move forward:**
[Hand off to Brad smoothly: "Our owner Brad will walk you through pricing and next steps. He's expecting your call."]

${pictureUrls.length > 0 ? `\nATTACHED IMAGES: Screenshots from past interactions. Analyze them to understand what was actually discussed. Reference specific details if visible.` : ""}`,
      add_context_from_internet: false,
      file_urls: pictureUrls.length > 0 ? pictureUrls : undefined,
    });

    const newCallMap = typeof callMapRes === "string" ? callMapRes : callMapRes?.text || String(callMapRes);

    return Response.json({ call_map: newCallMap });
  } catch (error) {
    console.error('Regenerate error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
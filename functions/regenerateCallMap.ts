import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { activityId, contactName, contactEmail, companyName, contactPhone, activityHistory, patternTags, reason, contactIntel } = await req.json();

    // Fetch past activities for this contact
    const pastActivities = await base44.asServiceRole.entities.ActivityLog.filter({
      contact_email: contactEmail,
    }, '-activity_date', 15);

    // Fetch SMS conversation history
    let smsHistory = "";
    if (contactPhone) {
      try {
        const smsConversation = await base44.asServiceRole.entities.SmsConversation.filter({
          from_number: contactPhone,
        }, '-last_message_at', 1);
        
        if (smsConversation.length > 0) {
          const messages = await base44.asServiceRole.entities.SmsMessage.filter({
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

    // Build comprehensive history snippet (use provided activityHistory if available)
    const historySnippet = activityHistory || pastActivities.slice(0, 6).map(a => {
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
      model: "gemini_3_flash",
    });

    const marketIntel = typeof webResearch === "string" ? webResearch : webResearch?.text || "";

    // Generate comprehensive call map with learned patterns
    const callMapRes = await base44.integrations.Core.InvokeLLM({
      prompt: `You're helping a sales rep at ARRIV (real estate photography company) prep for a call with ${contactName}. Generate a complete call map as a JSON structure with all conversation branches covered. Sound like a real person who knows them.

PROFILE DATA:
${hubspotData}

MARKET INTEL:
${marketIntel}

CONTEXT:
${reason ? `Reason for call: ${reason}\n` : ""}${contactIntel ? `Rep notes on this contact: ${contactIntel}\n` : ""}${patternTags && patternTags.length > 0 ? `Recurring patterns with this contact: ${patternTags.join(", ")}\n` : ""}

CALL HISTORY:
${historySnippet || "No prior activities"}

${smsHistory ? `TEXT MESSAGE HISTORY (analyze the tone, concerns, interests):\n${smsHistory}\n` : ""}

BRAD'S PROVEN CLOSING FRAMEWORK:
1. Open specific to them (reference actual conversation or market detail)
2. Lead with urgency: "listings with pro media sell 32% faster, 5-11% higher"
3. Handle objections gracefully, never argue
4. Close with: "Brad handles the rest" — makes transition seamless
5. For objections: acknowledge first, then redirect
6. Same-day follow-ups are valid and encouraged — if someone says "call me back in an hour" or "later today," schedule it for that same day, not days later

Fill in each JSON field with natural, conversational scripts (multiple sentences where appropriate). Reference specific details from their history or market.

${pictureUrls.length > 0 ? `\nATTACHED IMAGES: Screenshots from past interactions. Analyze them to understand what was actually discussed. Reference specific details if visible.` : ""}`,
      model: "gemini_3_flash",
      file_urls: pictureUrls.length > 0 ? pictureUrls : undefined,
      response_json_schema: {
        type: "object",
        properties: {
          opening: { type: "string", description: "Opening 1-2 sentences, casual, specific to this person" },
          if_interested: { type: "string", description: "Script if they're open/interested (under 60 sec)" },
          if_has_photographer: { type: "string", description: "Script for 'I already have a photographer' objection" },
          if_not_interested: { type: "string", description: "Script for 'Not interested right now' objection" },
          if_send_email: { type: "string", description: "Script for 'Send me an email' objection" },
          if_too_expensive: { type: "string", description: "Script for 'Too expensive' objection" },
          if_cold_unengaged: { type: "string", description: "Script for cold/one-word answers" },
          if_busy_bad_time: { type: "string", description: "Script for busy/bad timing objection — if they say call back later today, schedule a same-day follow up" },
          if_no_answer_voicemail: { type: "string", description: "Voicemail script (15 sec max)" },
          follow_up_text: { type: "string", description: "Follow-up text to send after voicemail" }
        },
        required: ["opening", "if_interested", "if_has_photographer", "if_not_interested", "if_send_email", "if_too_expensive", "if_cold_unengaged", "if_busy_bad_time", "if_no_answer_voicemail", "follow_up_text"]
      }
    });

    // callMapRes is already parsed JSON object from LLM — stringify it for storage
    let newCallMap = "";
    if (callMapRes) {
      newCallMap = typeof callMapRes === "string" ? callMapRes : JSON.stringify(callMapRes);
    }
    
    if (!newCallMap || newCallMap.length === 0) {
      console.error('[regenerateCallMap] ERROR: Call map generation returned empty result');
      return Response.json({ error: 'Call map generation failed', call_map: "" }, { status: 500 });
    }
    
    console.log('[regenerateCallMap] Generated call map, length:', newCallMap.length);

    return Response.json({ call_map: newCallMap });
  } catch (error) {
    console.error('Regenerate error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
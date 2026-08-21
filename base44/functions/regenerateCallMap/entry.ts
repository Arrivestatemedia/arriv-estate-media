import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { activityId, contactName, contactEmail, companyName, contactPhone, activityHistory, patternTags, reason, contactIntel, previousCallMap, pictureUrls: frontendPictureUrls } = await req.json();

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
    // Merge picture URLs from backend history + any passed directly from frontend
    const dbPictureUrls = pastActivities.flatMap(a => a.picture_urls || []);
    const pictureUrls = [...new Set([...(frontendPictureUrls || []), ...dbPictureUrls])].slice(0, 10);

    // Do web research on contact/company to find market intel
    const webResearch = await base44.integrations.Core.InvokeLLM({
      prompt: `Quickly research: ${contactName}${companyName ? ` at ${companyName}` : ""}. Find: their recent listings, market trends in their area, company size, specialties. Be concise.`,
      add_context_from_internet: true,
      model: "gemini_3_flash",
    });

    const marketIntel = typeof webResearch === "string" ? webResearch : webResearch?.text || "";

    // Fetch system-wide learned style preferences from all rep edits (tenant-scoped)
    let learnedStyleContext = "";
    try {
      const tenantConfigs = await base44.asServiceRole.entities.ArrivOneTenantConfig.list();
      const tenantId = tenantConfigs?.[0]?.arriv_one_tenant_id || 'tnt_estate_media';
      const styleProfiles = await base44.asServiceRole.entities.SalesRepStyleProfile.filter({ tenant_id: tenantId });
      if (styleProfiles?.length > 0) {
        const totalEdits = styleProfiles.reduce((sum, p) => sum + (p.edit_count || 0), 0);
        const allPrefs = styleProfiles
          .filter(p => p.learned_preferences)
          .map(p => p.learned_preferences)
          .join('\n\n---\n\n');
        if (allPrefs) {
          learnedStyleContext = `\n\nSYSTEM-LEARNED CALL MAP IMPROVEMENTS (learned from ${totalEdits} rep edits — apply ALL of these style improvements to every section of this call map):\n${allPrefs.slice(0, 2500)}\n`;
        }
      }
    } catch (e) {
      console.log('Style profile fetch skipped:', e.message);
    }

    // Detect box/intro package sent and first contact
    const allActivityNotes = pastActivities.map(a => a.notes || "").join(" ");
    const boxSent = /box sent|sent.*box|intro package|introduction package|mailed.*package|package.*sent|sent.*package/i.test(allActivityNotes);
    const isFirstContact = pastActivities.length === 0 || pastActivities.every(a => /^(FIRST CONTACT:|Contact created:)/i.test((a.notes || "").trim()));
    const firstName = (contactName || "").split(" ")[0] || "there";

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

    const boxContext = boxSent ? `
⚠️ BOX / INTRO PACKAGE WAS SENT TO THIS CONTACT. The opening MUST be:
"Hi ${firstName}, my name is Brad Burke, a local real estate media provider — do you have a moment? I recently sent over a small introduction package and just wanted to introduce myself personally."
[Pause. Let them respond.]
Then: "Glad it made it. I provide full-service real estate media — photography, video, and drone — and I just wanted to put a voice behind the name. [Reference their active listing if found from market intel.] I would love to help you get it to the closing table by adding a 2–3 minute MLS-ready video you can just drop into the listing."
If they say they don't need it: "Totally understand. If you ever need backup coverage or something with a quick turnaround, I'd be happy to be a resource."
` : "";

    // Generate comprehensive call map with learned patterns
    const callMapRes = await base44.integrations.Core.InvokeLLM({
      prompt: `You're helping a sales rep at ARRIV prep for a call with ${contactName}. Generate a complete call map.${previousCallMap ? `\n\nEXISTING CALL MAP (for reference only — do NOT copy the opening word-for-word if it doesn't match the situation below):\n${previousCallMap}\n` : ""}${learnedStyleContext}

CRITICAL — ARRIV IS A REAL ESTATE PHOTOGRAPHY & VIDEO COMPANY. NOTHING ELSE.
- We shoot photos and video for real estate listings. That's it.
- We do NOT offer: websites, marketing platforms, advertising campaigns, CRM tools, lead gen, anything digital other than photo/video.
- The rep's name is the rep. NEVER use placeholders like "[Your Name]" or "[Your Company]". Use "ARRIV" as the company name.
- Scripts must sound like a real human, not a corporate bot. Casual, warm, direct.
- Key stat to use when relevant: "homes with pro media sell 32% faster and for 5-11% more"
- Brad handles pricing questions and closings — route there when needed.

⚠️ SITUATION-SPECIFIC OPENING INSTRUCTIONS — THESE OVERRIDE EVERYTHING ABOVE:
${boxSent ? boxContext : `🚫 NO BOX OR INTRO PACKAGE WAS SENT TO THIS CONTACT. NEVER use the phrase "I recently sent over a small introduction package" or anything like it. That would be a lie. It is absolutely prohibited regardless of any style guidelines.`}
${firstContactScript}

Generate a complete call map as a JSON structure with all conversation branches covered. Sound like a real person who knows them.

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
          if_has_photographer: { type: "string", description: "They already use a photographer. Acknowledge it warmly, then mention ARRIV provides BOTH photography AND video as full-service media. Don't dismiss their photographer — position ARRIV as upgrade/add-on. Example: 'That's great! We actually do photography too, but we also specialize in video tours. A lot of agents use us alongside their existing photographer to add video to their listings. Worth keeping in mind as an add-on.' OR 'Awesome — we do full-service real estate media including photos and video, so we could potentially upgrade what you're already doing or add video tours.'" },
          if_not_interested: { type: "string", description: "Script for 'Not interested right now' objection. Use: 'Totally understand. If you ever need backup coverage or something with a quick turnaround, I'd be happy to be a resource.'" },
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

    // callMapRes is already parsed JSON object from LLM — format it as Markdown for storage and display
    let newCallMap = "";
    if (callMapRes) {
      const callMapData = typeof callMapRes === "string" ? JSON.parse(callMapRes) : callMapRes;
      console.log('[regenerateCallMap] LLM response:', JSON.stringify(callMapData, null, 2));
      // Format as Markdown with sections
      newCallMap = `📞 **Opening**\n${callMapData.opening}\n\n🔀 **If they're interested**\n${callMapData.if_interested}\n\n🔀 **If they say "I already have a photographer"**\n${callMapData.if_has_photographer}\n\n🔀 **If they say "Not interested right now"**\n${callMapData.if_not_interested}\n\n🔀 **If they say "Send me an email"**\n${callMapData.if_send_email}\n\n🔀 **If they say "Too expensive"**\n${callMapData.if_too_expensive}\n\n🔀 **If they're cold / one-word answers**\n${callMapData.if_cold_unengaged}\n\n🔀 **If they're busy / bad time**\n${callMapData.if_busy_bad_time}\n\n📵 **If no answer — voicemail**\n${callMapData.if_no_answer_voicemail}\n\n📱 **Follow-up text**\n${callMapData.follow_up_text}`;
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
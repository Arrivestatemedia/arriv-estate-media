import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

/**
 * Estate Media Prospect Brief / Call Prep
 *
 * REUSES the canonical Arriv One Prospect Brief capability (the platform's
 * InvokeLLM research engine with web search) and CONFIGURES it for the
 * Estate Media real-estate vertical. Does NOT build a second research
 * engine — uses the same InvokeLLM + add_context_from_internet that Arriv
 * One uses, with an Estate Media-specific prompt and JSON schema.
 *
 * SalesLogin-authenticated reps don't have a Base44 user token, so we use
 * asServiceRole and resolve identity from the request body (sales_member_id).
 */

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    prospect_name: { type: "string", description: "Prospect name" },
    prospect_role: { type: "string", description: "Role (Real Estate Agent, Broker, Builder, Team Lead, etc.)" },
    prospect_brokerage: { type: "string", description: "Brokerage / company / team name" },
    prospect_market: { type: "string", description: "Market area / location they serve" },
    why_them: { type: "string", description: "Why THIS particular prospect is worth contacting right now" },
    why_this_business: { type: "string", description: "Why the brokerage/team/builder may represent an Estate Media opportunity" },
    listing_intelligence: { type: "string", description: "Active/recent listings, property/location context, listing characteristics. Use 'UNKNOWN' if evidence is insufficient. NEVER fabricate listing data." },
    listing_price_range: { type: "string", description: "Approximate listing price range where supported. 'UNKNOWN' if unavailable." },
    listing_activity_volume: { type: "string", description: "Approximate listing activity/volume where supported. 'UNKNOWN' if unavailable." },
    media_audit: { type: "string", description: "Evaluation of available listing/media evidence: professional photography, professional video, virtual tour/video presence, visible media opportunities" },
    professional_video_status: { type: "string", enum: ["UNKNOWN", "NO_PROFESSIONAL_VIDEO", "PROFESSIONAL_VIDEO_PRESENT", "COMING_SOON_NO_MEDIA", "MEDIA_NOT_YET_VERIFIABLE"], description: "Professional video check — primary Estate Media prospecting gate. Use UNKNOWN if evidence is insufficient." },
    professional_video_notes: { type: "string", description: "Evidence supporting the professional video status conclusion. Use 'Insufficient evidence to determine' if unknown." },
    potential_opportunity: { type: "string", description: "Currently sellable Estate Media opportunities based on evidence (photography, videography, combined photography + videography). Do NOT include physical staging." },
    suggested_opening: { type: "string", description: "Prospect-specific opening using actual research. If professional video appears absent, lead with Arriv Estate Media's clean, unbranded, MLS-ready video capability." },
    questions_to_ask: { type: "array", items: { type: "string" }, description: "5-8 prospect-specific discovery questions about listing volume, current media provider, photography, video, turnaround, consistency, scheduling, pain points, upcoming listings, workflow, what they value in a media partner" },
    likely_objections: { type: "array", items: { type: "string" }, description: "3-5 likely objections from this prospect (existing photographer, photographer does video, no video need, phone quality, price, loyalty, availability, discount requests)" },
    staging_interest_signal: { type: "boolean", description: "Whether a future staging-interest signal was detected from available evidence" },
    staging_boundary_note: { type: "string", description: "Boundary reminder: physical staging is NOT currently sales authorized. Reps may document interest only." },
    research_confidence: { type: "string", enum: ["HIGH", "MODERATE", "LOW", "UNKNOWN"], description: "Overall confidence in the research findings" },
    research_sources: { type: "array", items: { type: "string" }, description: "Sources consulted (MLS, Zillow, Realtor.com, brokerage website, agent website, social media) so the rep can VERIFY" }
  },
  required: ["prospect_name", "why_them", "professional_video_status", "potential_opportunity", "suggested_opening", "questions_to_ask", "likely_objections", "research_confidence"]
};

const ESTATE_MEDIA_PROMPT = `You are generating an Estate Media Prospect Brief / Call Prep for an Arriv Estate Media sales representative.

ARRIV ESTATE MEDIA sells professional real-estate listing media services:
- Professional photography
- Professional videography (clean, unbranded, MLS-ready video)
- Combined photography + videography packages
- MLS Walkthrough
- Preferred membership ($29.99/month, 10% discount on regular packages)

The prospect is one of: real-estate agent, agent team, brokerage, builder, or appropriate real-estate organization.

YOUR TASK: Research this prospect using web search and produce a structured Prospect Brief that strengthens the Estate Media sales workflow:
DISCOVER → RESEARCH → PROFESSIONAL VIDEO CHECK → QUALIFY → CONTACT → CRM → FOLLOW-UP

CRITICAL RULES:
1. PROFESSIONAL VIDEO CHECK is the primary Estate Media prospecting gate. Clearly identify whether professional video is present when evidence supports a conclusion. If evidence is insufficient, use "UNKNOWN" — NEVER guess.
2. NEVER fabricate listing data. If you cannot find listings, say "UNKNOWN" for listing intelligence fields.
3. ONLY recommend currently sellable Estate Media services (photography, videography, combined). Do NOT recommend physical staging as currently sellable.
4. PHYSICAL STAGING is NOT currently sales authorized. Estate Media reps may document interest but may NOT quote, sell, promise pricing, promise launch date, package staging into an order, or promise specific unfinished staging capabilities. A separate Staging Sales Certification will be required before authorization.
5. The suggested opening must use ACTUAL research. If professional video appears absent, the opening may appropriately lead with Arriv Estate Media's clean, unbranded, MLS-ready video capability.
6. Questions to ask should be prospect-specific discovery questions covering: listing volume, current media provider, photography, video, turnaround expectations, consistency, scheduling, pain points, upcoming listings, current workflow, what they value in a media partner.
7. Likely objections should use Estate Media training truth: "I already have a photographer," "My photographer also does video," "I don't use video," "I use my phone," price, loyalty to existing provider, availability, discount requests.
8. Include research_sources so the rep can VERIFY the research rather than blindly trusting AI.

Use the prospect information provided below to focus your research. Search for their listings, brokerage, and media presence. Be specific and evidence-based. When evidence is insufficient for any field, use "UNKNOWN" rather than guessing.

PROSPECT INFORMATION:
- Name: {PROSPECT_NAME}
- Brokerage/Company: {PROSPECT_BROKERAGE}
- Market/Location: {PROSPECT_LOCATION}
- Trigger Listing Address: {LISTING_ADDRESS}
- Website: {PROSPECT_WEBSITE}

Generate the complete Estate Media Prospect Brief now.`;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const {
      prospect_name,
      prospect_brokerage,
      prospect_location,
      listing_address,
      contact_id,
      sales_member_id,
      prospect_phone,
      prospect_email,
      prospect_website,
    } = body;

    if (!prospect_name) {
      return Response.json({ error: "prospect_name is required" }, { status: 400 });
    }
    if (!sales_member_id) {
      return Response.json({ error: "sales_member_id is required" }, { status: 400 });
    }

    // Build the prompt with prospect context
    const prompt = ESTATE_MEDIA_PROMPT
      .replace("{PROSPECT_NAME}", prospect_name || "Unknown")
      .replace("{PROSPECT_BROKERAGE}", prospect_brokerage || "Unknown")
      .replace("{PROSPECT_LOCATION}", prospect_location || "Unknown")
      .replace("{LISTING_ADDRESS}", listing_address || "Not specified")
      .replace("{PROSPECT_WEBSITE}", prospect_website || "Not available");

    // Reuse the canonical Arriv One research capability: InvokeLLM with web search
    // (same engine Arriv One uses), configured for Estate Media's vertical.
    const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      model: "gemini_3_flash",
      response_json_schema: BRIEF_SCHEMA,
    });

    const brief = typeof llmResult === "string" ? JSON.parse(llmResult) : llmResult;

    // Enforce staging boundary regardless of LLM output
    brief.staging_boundary_note = "PHYSICAL STAGING — NOT CURRENTLY SALES AUTHORIZED. Reps may document interest only. May NOT quote, sell, promise pricing/launch date, package into orders, or promise specific unfinished staging capabilities. Separate Staging Sales Certification required.";

    // Persist the brief (service role — SalesLogin reps don't have a Base44 user token)
    const saved = await base44.asServiceRole.entities.ProspectBrief.create({
      sales_member_id,
      contact_id: contact_id || "",
      prospect_name: brief.prospect_name || prospect_name,
      prospect_role: brief.prospect_role || "",
      prospect_brokerage: brief.prospect_brokerage || prospect_brokerage || "",
      prospect_market: brief.prospect_market || prospect_location || "",
      prospect_phone: prospect_phone || "",
      prospect_email: prospect_email || "",
      prospect_website: prospect_website || "",
      listing_address: listing_address || "",
      why_them: brief.why_them || "",
      why_this_business: brief.why_this_business || "",
      listing_intelligence: brief.listing_intelligence || "UNKNOWN",
      listing_price_range: brief.listing_price_range || "UNKNOWN",
      listing_activity_volume: brief.listing_activity_volume || "UNKNOWN",
      media_audit: brief.media_audit || "",
      professional_video_status: brief.professional_video_status || "UNKNOWN",
      professional_video_notes: brief.professional_video_notes || "Insufficient evidence to determine.",
      potential_opportunity: brief.potential_opportunity || "",
      suggested_opening: brief.suggested_opening || "",
      questions_to_ask: brief.questions_to_ask || [],
      likely_objections: brief.likely_objections || [],
      rep_notes: "",
      staging_interest_signal: brief.staging_interest_signal || false,
      staging_boundary_note: brief.staging_boundary_note,
      research_confidence: brief.research_confidence || "UNKNOWN",
      research_sources: brief.research_sources || [],
      generated_at: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      brief,
      saved_brief_id: saved.id,
    });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to generate prospect brief" }, { status: 500 });
  }
}
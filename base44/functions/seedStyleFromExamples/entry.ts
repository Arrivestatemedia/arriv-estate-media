import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Gold-standard approved call map examples extracted directly from Brad's real calls
const APPROVED_EXAMPLES = [
  {
    contact: "Tami Willard (Keller Williams Realty Ad. Partners)",
    situation: "Contact stated they will reach out when ready.",
    opener: "Hi Tami, this is Brad Burke from ARRIV. I hope you're doing well. Just wanted to check in and see if now is a good time to connect.",
    notes: "Warm follow-up after previous contact. Used personal name from ARRIV branding directly."
  },
  {
    contact: "Quiana Watson (Watch Realty Co)",
    situation: "First contact; no prior communication.",
    opener: "Hi Quiana, my name is Brad Burke, a local real estate media provider. Do you have a moment? I recently came across your listings and wanted to see if professional media might be something you'd be interested in.",
    notes: "Cold outreach. Introduced as 'local real estate media provider' not 'ARRIV'. Asked for a moment before pitching."
  },
  {
    contact: "Diana Gonzalez (Virtual Properties Realty)",
    situation: "First contact; no prior communication.",
    opener: "Hi Diana, my name is Brad Burke, a local real estate media provider. Do you have a moment?",
    notes: "Cold outreach. Short opener. Introduced as 'local real estate media provider'. Asked for a moment."
  },
  {
    contact: "Josue Duros (Virtual Properties Realty.com)",
    situation: "First contact; no prior communication.",
    opener: "Hi Josue, my name is Brad Burke, a local real estate media provider. Do you have a moment?",
    notes: "Cold outreach. Consistent opener format with name, role as 'local real estate media provider', and asking for a moment."
  }
];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Admin only' }, { status: 403 });
  }

  const examplesText = APPROVED_EXAMPLES.map((e, i) =>
    `EXAMPLE ${i+1}: ${e.contact}\nSITUATION: ${e.situation}\nOPENER USED: "${e.opener}"\nNOTES: ${e.notes}`
  ).join('\n\n---\n\n');

  const analysis = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: `You are analyzing ${APPROVED_EXAMPLES.length} real, approved openers and call notes used by Brad Burke at ARRIV Estate Media. These are GOLD STANDARD examples that represent exactly how Brad speaks and introduces himself.

Extract concrete, actionable style rules for future call map generation:

${examplesText}

Key things to extract:
- When does Brad use "this is Brad Burke from ARRIV" vs "my name is Brad Burke, a local real estate media provider"?
- What is the exact cold outreach opener format?
- What is the exact warm follow-up opener format?
- Tone (casual vs formal)?
- How short or long are openers?
- What specific phrases are consistent across calls?`,
    response_json_schema: {
      type: "object",
      properties: {
        learned_preferences: { type: "string" },
        key_phrases: { type: "array", items: { type: "string" } },
        summary: { type: "string" }
      },
      required: ["learned_preferences", "key_phrases", "summary"]
    }
  });

  const prefs = typeof analysis === 'string' ? JSON.parse(analysis) : analysis;

  const profileData = {
    sales_member_id: 'system',
    sales_member_email: 'system@arriv',
    learned_preferences: `SEEDED FROM APPROVED EXAMPLES:\n\n${prefs.learned_preferences}\n\nKEY PHRASES:\n${(prefs.key_phrases || []).map(p => `- "${p}"`).join('\n')}\n\nSTYLE SUMMARY: ${prefs.summary}`,
    edit_count: APPROVED_EXAMPLES.length,
    last_updated: new Date().toISOString()
  };

  const tenantId = user.tenant_id || user.data?.tenant_id || 'tnt_estate_media';
  const existing = await base44.asServiceRole.entities.SalesRepStyleProfile.filter({ sales_member_email: 'system@arriv', tenant_id: tenantId });
  if (existing?.length > 0) {
    await base44.asServiceRole.entities.SalesRepStyleProfile.update(existing[0].id, { ...profileData, tenant_id: tenantId });
  } else {
    await base44.asServiceRole.entities.SalesRepStyleProfile.create({ ...profileData, tenant_id: tenantId });
  }

  return Response.json({
    message: `Style profile seeded from ${APPROVED_EXAMPLES.length} approved examples`,
    summary: prefs.summary,
    key_phrases: prefs.key_phrases
  });
});
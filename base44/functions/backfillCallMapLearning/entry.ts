import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Admin only' }, { status: 403 });
  }

  // Fetch all activity logs (tenant-scoped)
  const tenantId = user.tenant_id || user.data?.tenant_id || 'tnt_estate_media';
  const all = await base44.asServiceRole.entities.ActivityLog.filter({ tenant_id: tenantId }, '-activity_date', 1000);

  // Find ones that have a call map stored
  const withCallMap = all.filter(a => /--- CALL MAP ---/i.test(a.notes || ''));

  if (withCallMap.length === 0) {
    return Response.json({ message: 'No call maps found to learn from', count: 0 });
  }

  // Extract just the call map portion from each — treat it as the "approved" version
  const callMaps = withCallMap.map(a => {
    const parts = a.notes.split(/--- CALL MAP ---/i);
    return parts[1]?.trim() || '';
  }).filter(Boolean);

  if (callMaps.length === 0) {
    return Response.json({ message: 'No usable call map content found', count: 0 });
  }

  // Feed all call maps together into the LLM as gold-standard examples
  const combined = callMaps.slice(0, 20).join('\n\n========\n\n');

  const analysis = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: `You are analyzing ${callMaps.length} real, approved sales call maps used by Brad Burke at ARRIV Estate Media. These have been reviewed and represent the CORRECT style, tone, and approach.

Extract concrete, actionable style preferences and rules that should be applied to ALL future call maps. Focus on:
- Tone and personality (formal vs casual, specific phrases used)
- How Brad introduces himself (exact wording patterns)
- How objections are handled (specific language)
- Length and structure preferences
- Any specific phrases or words that appear repeatedly
- What to avoid based on what's NOT in these approved maps

APPROVED CALL MAPS:
${combined}

Output a clear, concise set of rules/preferences that should guide future call map generation. Be specific and quote exact phrases where they appear consistently.`,
    response_json_schema: {
      type: "object",
      properties: {
        learned_preferences: { type: "string", description: "Detailed style preferences and rules extracted from approved call maps" },
        key_phrases: { type: "array", items: { type: "string" }, description: "Exact phrases that appear consistently and should be reused" },
        summary: { type: "string", description: "One paragraph summary of Brad's call map style" }
      },
      required: ["learned_preferences", "key_phrases", "summary"]
    }
  });

  const prefs = typeof analysis === 'string' ? JSON.parse(analysis) : analysis;

  // Save or update a system-wide style profile (tenant-scoped)
  const existing = await base44.asServiceRole.entities.SalesRepStyleProfile.filter({ sales_member_email: 'system@arriv', tenant_id: tenantId });
  
  const profileData = {
    sales_member_id: 'system',
    sales_member_email: 'system@arriv',
    learned_preferences: `${prefs.learned_preferences}\n\nKEY PHRASES TO USE:\n${(prefs.key_phrases || []).map(p => `- "${p}"`).join('\n')}\n\nSTYLE SUMMARY: ${prefs.summary}`,
    edit_count: callMaps.length,
    last_updated: new Date().toISOString(),
    tenant_id: tenantId
  };

  if (existing?.length > 0) {
    await base44.asServiceRole.entities.SalesRepStyleProfile.update(existing[0].id, profileData);
  } else {
    await base44.asServiceRole.entities.SalesRepStyleProfile.create(profileData);
  }

  return Response.json({
    message: `Successfully learned from ${callMaps.length} approved call maps`,
    count: callMaps.length,
    summary: prefs.summary
  });
});
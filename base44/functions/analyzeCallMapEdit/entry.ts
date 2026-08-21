import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { salesMemberId, salesMemberEmail, originalCallMap, editedCallMap } = await req.json();

    if (!originalCallMap || !editedCallMap || !salesMemberId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Analyze diff to extract style patterns
    const analysisPrompt = `You are analyzing a sales call map edit to extract style and tone preferences.

ORIGINAL CALL MAP:
${originalCallMap}

EDITED CALL MAP:
${editedCallMap}

Extract ONLY the style patterns, tone adjustments, and preferences that were applied. Be concise. Focus on:
1. Tone changes (more casual, formal, direct, etc.)
2. Structure/pacing changes (shorter/longer sections, different flow)
3. Language preferences (specific phrases, vocab style)
4. Content emphasis (what the rep prioritized)
5. Approach changes (more aggressive, consultative, etc.)

Format as a bullet list of 3-5 key learnings.`;

    const analysisResult = await base44.integrations.Core.InvokeLLM({
      prompt: analysisPrompt,
      model: 'gpt_5_mini'
    });

    const learnedPreferences = typeof analysisResult === 'string' ? analysisResult : analysisResult?.text || analysisResult?.content || '';

    // Fetch or create the sales rep's style profile (tenant-scoped)
    const tenantId = user.tenant_id || user.data?.tenant_id || 'tnt_estate_media';
    const profiles = await base44.asServiceRole.entities.SalesRepStyleProfile.filter({ sales_member_id: salesMemberId, tenant_id: tenantId });
    const profile = profiles?.[0];

    let updatedProfile;
    if (profile) {
      // Update existing profile
      const updatedPrefs = `${profile.learned_preferences || ''}\n\n[Edit #${(profile.edit_count || 0) + 1}]\n${learnedPreferences}`;
      updatedProfile = await base44.asServiceRole.entities.SalesRepStyleProfile.update(profile.id, {
        learned_preferences: updatedPrefs,
        edit_count: (profile.edit_count || 0) + 1,
        last_updated: new Date().toISOString()
      });
    } else {
      // Create new profile (tenant-scoped)
      updatedProfile = await base44.asServiceRole.entities.SalesRepStyleProfile.create({
        tenant_id: tenantId,
        sales_member_id: salesMemberId,
        sales_member_email: salesMemberEmail,
        learned_preferences: learnedPreferences,
        edit_count: 1,
        last_updated: new Date().toISOString()
      });
    }

    return Response.json({
      success: true,
      learnedPreferences,
      profileUpdated: true,
      editCount: updatedProfile.edit_count
    });
  } catch (error) {
    console.error('[analyzeCallMapEdit] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
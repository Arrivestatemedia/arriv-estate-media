import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { contactEmail } = await req.json();

    if (!contactEmail) {
      return Response.json({ error: 'Missing contactEmail' }, { status: 400 });
    }

    // Fetch the most recent activity for this contact
    const activities = await base44.entities.ActivityLog.filter(
      { contact_email: contactEmail },
      '-activity_date',
      1
    );

    if (!activities || activities.length === 0) {
      return Response.json({ error: 'No activities found for this contact' }, { status: 404 });
    }

    const activity = activities[0];
    const notes = activity.notes || '';

    // Extract call maps from notes
    const callMapMatch = notes.match(/--- CALL MAP ---\n([\s\S]*?)$/);
    if (!callMapMatch) {
      return Response.json({ error: 'No edited call map found in activity notes' }, { status: 400 });
    }

    const editedCallMap = callMapMatch[1].trim();

    // Analyze the edited call map to extract style patterns
    const analysisPrompt = `You are analyzing a sales call map that was manually edited to extract style and tone preferences.

EDITED CALL MAP:
${editedCallMap}

Extract the style patterns, tone, structure, and approach evident in this call map. Be concise. Focus on:
1. Overall tone and approach (casual vs formal, aggressive vs consultative)
2. Structure and pacing (how sections flow, emphasis points)
3. Language style and vocabulary preferences
4. Key messaging priorities
5. Unique personality or approach

Format as a bullet list of 3-5 key learnings.`;

    const analysisResult = await base44.integrations.Core.InvokeLLM({
      prompt: analysisPrompt,
      model: 'gpt_5_mini'
    });

    const learnedPreferences = typeof analysisResult === 'string' ? analysisResult : analysisResult?.text || analysisResult?.content || '';

    // Fetch or create the style profile (tenant-scoped)
    const tenantId = user.tenant_id || user.data?.tenant_id || 'tnt_estate_media';
    const profiles = await base44.asServiceRole.entities.SalesRepStyleProfile.filter({ sales_member_id: user.id, tenant_id: tenantId });
    const profile = profiles?.[0];

    let updatedProfile;
    if (profile) {
      const updatedPrefs = `${profile.learned_preferences || ''}\n\n[Backfilled from ${activity.contact_name}]\n${learnedPreferences}`;
      updatedProfile = await base44.asServiceRole.entities.SalesRepStyleProfile.update(profile.id, {
        learned_preferences: updatedPrefs,
        edit_count: (profile.edit_count || 0) + 1,
        last_updated: new Date().toISOString()
      });
    } else {
      updatedProfile = await base44.asServiceRole.entities.SalesRepStyleProfile.create({
        tenant_id: tenantId,
        sales_member_id: user.id,
        sales_member_email: user.email,
        learned_preferences: learnedPreferences,
        edit_count: 1,
        last_updated: new Date().toISOString()
      });
    }

    return Response.json({
      success: true,
      contactEmail,
      contactName: activity.contact_name,
      learned: learnedPreferences,
      editCount: updatedProfile.edit_count
    });
  } catch (error) {
    console.error('[backfillStyleLearning] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
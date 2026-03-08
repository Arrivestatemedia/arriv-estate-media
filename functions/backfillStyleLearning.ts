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
    const activities = await base44.asServiceRole.entities.ActivityLog.filter(
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

    // Get the original call map - it would be the part before the edited one
    // For simplicity, we'll ask the LLM to infer what the original might have been
    // Or we need to store the original separately. For now, let's just analyze the edit

    // Call analyzeCallMapEdit
    const result = await base44.functions.invoke('analyzeCallMapEdit', {
      salesMemberId: user.id,
      salesMemberEmail: user.email,
      originalCallMap: `[Original call map for ${activity.contact_name} - inferred from edit]`,
      editedCallMap: editedCallMap
    });

    return Response.json({
      success: true,
      contactEmail,
      contactName: activity.contact_name,
      learned: result.learnedPreferences,
      editCount: result.editCount
    });
  } catch (error) {
    console.error('[backfillStyleLearning] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
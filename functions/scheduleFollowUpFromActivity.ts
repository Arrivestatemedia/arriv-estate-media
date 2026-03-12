import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { event } = await req.json();
    const body = await req.json();
    const activity = body.data;

    if (!activity || !activity.contact_email) {
      return Response.json({ success: false, reason: 'No contact email' });
    }

    // Skip AI-scheduled records and Queue Call outcomes — those are handled by DailyCallQueue already
    const notes = activity.notes || '';
    if (notes.includes('[AI Scheduled]') || notes.includes('[Queue Call]') || notes.includes('--- CALL MAP ---')) {
      return Response.json({ success: false, reason: 'Skipped: AI or queue activity' });
    }

    // Fetch prior activities for this contact
    const priorActivities = await base44.entities.ActivityLog.filter(
      { contact_email: activity.contact_email },
      '-created_date',
      20
    );

    // Use LLM to determine optimal follow-up date based on activity notes
    const prompt = `Based on this sales activity note, determine the ideal follow-up date:

Activity Type: ${activity.activity_type}
Notes: ${activity.notes || ''}
Contact: ${activity.contact_name || activity.contact_email}
Company: ${activity.company_name || 'N/A'}

Previous activity count: ${priorActivities?.length || 0}

Return ONLY a JSON object with:
{
  "days_until_followup": <number of days from today>,
  "reason": "<brief reason for this timing>"
}

Consider:
- If contact is warm (multiple prior calls), follow up sooner (1-3 days)
- If they asked to call back at a specific time, use that
- If deal-related, follow up based on urgency in notes
- Default to 3-5 days if unclear`;

    const llmResult = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          days_until_followup: { type: 'number' },
          reason: { type: 'string' }
        },
        required: ['days_until_followup', 'reason']
      }
    });

    const scheduleData = typeof llmResult === 'string' ? JSON.parse(llmResult) : llmResult;
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + Math.max(1, scheduleData.days_until_followup));
    followUpDate.setHours(9, 0, 0, 0); // Schedule for 9 AM

    // Create new AI-scheduled task
    await base44.entities.ActivityLog.create({
      activity_type: 'task',
      contact_name: activity.contact_name || '',
      contact_email: activity.contact_email || '',
      contact_phone: activity.contact_phone || '',
      company_name: activity.company_name || '',
      activity_date: followUpDate.toISOString(),
      notes: `[AI Scheduled] Follow up on: ${activity.notes ? activity.notes.slice(0, 100) : 'previous interaction'}. Reason: ${scheduleData.reason}`,
      sales_member_email: activity.sales_member_email || '',
      sales_member_id: activity.sales_member_id || ''
    });

    return Response.json({
      success: true,
      followUpScheduledFor: followUpDate.toISOString(),
      reason: scheduleData.reason
    });
  } catch (error) {
    console.error('scheduleFollowUpFromActivity error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
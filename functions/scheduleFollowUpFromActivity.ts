import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // Automation payload structure: { event, data, old_data }
    // Direct call structure: { activity_id, activity_type, contact_email, ..., _force_reschedule: true }
    const forceReschedule = body?._force_reschedule === true;
    const activity = body?.data || body?.event?.data || (forceReschedule ? body : null);

    if (!activity) {
      return Response.json({ success: false, reason: 'No activity data' });
    }

    // Skip AI-scheduled tasks, queue calls — unless force rescheduling
    if (!forceReschedule) {
      const notes = activity.notes || '';
      if (
        notes.includes('[AI Scheduled]') ||
        notes.includes('[Queue Call]')
      ) {
        return Response.json({ success: false, reason: 'Skipping AI-scheduled or queue call' });
      }

      // Only trigger on real activity types (not task/note)
      if (!['call', 'email', 'meeting'].includes(activity.activity_type)) {
        return Response.json({ success: false, reason: 'Not a trackable activity type' });
      }
    }

    const contactEmail = activity.contact_email;
    const contactName = activity.contact_name;
    const sid = activity.sales_member_id;
    const sem = activity.sales_member_email;

    if (!contactEmail && !contactName) {
      return Response.json({ success: false, reason: 'No contact identifier' });
    }

    // Use service role for all DB operations (no user token in automation context)
    const allLogs = await base44.asServiceRole.entities.ActivityLog.list('-activity_date', 500);

    // Get all activities for this contact by this sales member
    const contactLogs = allLogs.filter(a => {
      const keyMatch = (contactEmail && a.contact_email === contactEmail) ||
        (contactName && a.contact_name === contactName);
      if (!keyMatch) return false;
      return (a.sales_member_id === sid) ||
        ((a.sales_member_email || '').toLowerCase() === (sem || '').toLowerCase()) ||
        ((a.created_by || '').toLowerCase() === (sem || '').toLowerCase());
    });

    // 1. Retire any existing AI-scheduled tasks for this contact
    const aiTasksToRetire = contactLogs.filter(a => {
      const n = a.notes || '';
      return n.includes('[AI Scheduled]') && !n.includes('[Queue Call]');
    });

    if (aiTasksToRetire.length > 0) {
      const retiredDate = new Date();
      retiredDate.setDate(retiredDate.getDate() - 30);
      await Promise.all(aiTasksToRetire.map(s =>
        base44.asServiceRole.entities.ActivityLog.update(s.id, {
          activity_date: retiredDate.toISOString(),
          notes: `[Queue Call] Completed via activity — ${notes.slice(0, 100)}`,
        }).catch(() => {})
      ));
    }

    // 2. Use LLM to determine optimal follow-up date based on activity notes and history
    const historySnippet = contactLogs
      .filter(a => {
        const n = a.notes || '';
        return !n.includes('[AI Scheduled]') && !n.includes('--- CALL MAP ---');
      })
      .slice(0, 10)
      .map(a => `${new Date(a.activity_date).toLocaleDateString()}: [${a.activity_type}] ${(a.notes || '').slice(0, 120)}`)
      .join('\n');

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are a sales scheduling AI for ARRIV (real estate photography company). A sales rep just logged a real activity. Schedule the next follow-up.

TODAY: ${today}
CONTACT: ${contactName || contactEmail}
ACTIVITY JUST LOGGED: [${activity.activity_type}] ${notes}
PRIOR HISTORY:
${historySnippet || 'No prior history'}

RULES:
- NEVER schedule same-day or next-day unless notes explicitly say "call back today/tomorrow"
- Default minimum: 7 days from today
- If warm/interested: 7-10 days
- If no answer / left voicemail: 7 days
- If they said "I'll reach out when ready" / "building home" / "not ready yet" / waiting on something: 45-60 days
- If not interested OR already has someone / a photographer / a vendor: 120-180 days (4-6 months) — they may change their mind
- If they said "never" / "remove me" / "do not call": urgency = "skip"
- Use common sense — go as far out as needed. There's no maximum.

Return ONLY valid JSON:
{
  "days_until_followup": <number>,
  "reason": "<brief reason>",
  "urgency": "high" | "medium" | "low" | "skip"
}`,
      response_json_schema: {
        type: 'object',
        properties: {
          days_until_followup: { type: 'number' },
          reason: { type: 'string' },
          urgency: { type: 'string' }
        },
        required: ['days_until_followup', 'reason', 'urgency']
      }
    });

    const scheduleData = typeof llmResult === 'string' ? JSON.parse(llmResult) : llmResult;

    // Skip if urgency is skip
    if (scheduleData.urgency === 'skip') {
      return Response.json({ success: true, reason: 'Urgency skip — no follow-up scheduled' });
    }

    const daysOut = Math.max(7, scheduleData.days_until_followup || 7);
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + daysOut);
    followUpDate.setHours(8, 30, 0, 0); // Default 8:30 AM

    // 3. Create new AI-scheduled follow-up task
    await base44.asServiceRole.entities.ActivityLog.create({
      activity_type: 'call',
      contact_name: activity.contact_name || '',
      contact_email: activity.contact_email || '',
      contact_phone: activity.contact_phone || '',
      company_name: activity.company_name || '',
      activity_date: followUpDate.toISOString(),
      notes: `[AI Scheduled] ${scheduleData.reason || 'Follow-up'}`,
      sales_member_id: sid || '',
      sales_member_email: sem || '',
    });

    return Response.json({
      success: true,
      followUpScheduledFor: followUpDate.toISOString(),
      reason: scheduleData.reason,
      daysOut
    });
  } catch (error) {
    console.error('scheduleFollowUpFromActivity error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
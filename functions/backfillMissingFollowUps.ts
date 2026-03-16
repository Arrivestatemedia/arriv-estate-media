import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get all activity logs
  const allLogs = await base44.asServiceRole.entities.ActivityLog.list('-activity_date', 2000);

  // Find all contacts that already have an [AI Scheduled] task
  const scheduledEmails = new Set(
    allLogs
      .filter(a => a.notes && a.notes.startsWith('[AI Scheduled]'))
      .map(a => a.contact_email)
      .filter(Boolean)
  );

  // Find all contacts that have NO [AI Scheduled] task
  // Group by email, pick their most recent non-AI-scheduled activity
  const contactMap = {};
  for (const log of allLogs) {
    const email = log.contact_email;
    if (!email || scheduledEmails.has(email)) continue;
    if (log.notes && (log.notes.startsWith('[AI Scheduled]') || log.notes.startsWith('[Queue Call]'))) continue;
    if (!contactMap[email] || new Date(log.activity_date) > new Date(contactMap[email].activity_date)) {
      contactMap[email] = log;
    }
  }

  const toBackfill = Object.values(contactMap);
  console.log(`[Backfill] Found ${toBackfill.length} contacts without scheduled follow-ups`);

  let scheduled = 0;
  let errors = 0;

  for (const activity of toBackfill) {
    try {
      await base44.asServiceRole.functions.invoke('scheduleFollowUpFromActivity', {
        event: { type: 'create', entity_name: 'ActivityLog', entity_id: activity.id },
        data: {
          activity_type: activity.activity_type,
          contact_name: activity.contact_name,
          contact_email: activity.contact_email,
          company_name: activity.company_name,
          activity_date: activity.activity_date,
          notes: activity.notes,
          sales_member_id: activity.sales_member_id,
          sales_member_email: activity.sales_member_email,
        }
      });
      scheduled++;
      console.log(`[Backfill] Scheduled follow-up for ${activity.contact_email}`);
    } catch (e) {
      errors++;
      console.error(`[Backfill] Failed for ${activity.contact_email}: ${e.message}`);
    }
  }

  return Response.json({ success: true, scheduled, errors, total: toBackfill.length });
});
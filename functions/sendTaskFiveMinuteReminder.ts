import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const now = new Date();
    // Window: tasks starting between 4 and 9 minutes from now
    const windowStart = new Date(now.getTime() + 4 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 9 * 60 * 1000);

    // Filter by date range server-side
    const activities = await base44.asServiceRole.entities.ActivityLog.filter({
      activity_date: { $gte: windowStart.toISOString(), $lte: windowEnd.toISOString() }
    });

    const upcoming = activities.filter(a => a.sales_member_email);

    if (upcoming.length === 0) {
      return Response.json({ success: true, sent: 0 });
    }

    // Send all emails in parallel
    const results = await Promise.allSettled(upcoming.map(activity => {
      const time = new Date(activity.activity_date).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/New_York'
      });
      const contact = activity.contact_name || activity.company_name || 'a contact';
      const type = activity.activity_type ? activity.activity_type.charAt(0).toUpperCase() + activity.activity_type.slice(1) : 'Task';

      return base44.asServiceRole.integrations.Core.SendEmail({
        to: activity.sales_member_email,
        from_name: 'Arriv',
        subject: `⏰ Reminder: ${type} with ${contact} in 5 minutes`,
        body: `Hi,\n\nJust a reminder — you have a ${type} scheduled with ${contact} at ${time} ET.\n\nNotes: ${activity.notes || 'None'}\n\nGood luck!\nArriv Team`
      });
    }));

    const sent = results.filter(r => r.status === 'fulfilled').length;

    return Response.json({ success: true, sent, failed: results.length - sent });
  } catch (error) {
    console.error('Error sending 5-minute task reminders:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
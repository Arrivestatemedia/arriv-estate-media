import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const now = new Date();
    // Window: tasks starting between 4 and 9 minutes from now
    const windowStart = new Date(now.getTime() + 4 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 9 * 60 * 1000);

    // Get all activities
    const activities = await base44.asServiceRole.entities.ActivityLog.list('-activity_date', 500);

    const upcoming = activities.filter(a => {
      const d = new Date(a.activity_date);
      return d >= windowStart && d <= windowEnd && a.sales_member_email;
    });

    if (upcoming.length === 0) {
      return Response.json({ success: true, sent: 0 });
    }

    let sent = 0;
    for (const activity of upcoming) {
      const time = new Date(activity.activity_date).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/New_York'
      });

      const contact = activity.contact_name || activity.company_name || 'a contact';
      const type = activity.activity_type ? activity.activity_type.charAt(0).toUpperCase() + activity.activity_type.slice(1) : 'Task';

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: activity.sales_member_email,
        from_name: 'Arriv',
        subject: `⏰ Reminder: ${type} with ${contact} in 5 minutes`,
        body: `Hi,\n\nJust a reminder — you have a ${type} scheduled with ${contact} at ${time} ET.\n\nNotes: ${activity.notes || 'None'}\n\nGood luck!\nArriv Team`
      });

      sent++;
    }

    return Response.json({ success: true, sent });
  } catch (error) {
    console.error('Error sending 5-minute task reminders:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
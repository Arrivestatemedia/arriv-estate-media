import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { sendBrevoEmail } from '../../shared/brevoClient.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get all sales team members
    const salesTeamMembers = await base44.asServiceRole.entities.SalesTeamMember.list();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    for (const member of salesTeamMembers) {
      if (!member.email) continue;

      // Get activities for this sales team member
      const activities = await base44.asServiceRole.entities.ActivityLog.filter({
        sales_member_email: member.email
      }, '-activity_date', 100);

      // Filter for TODAY's SCHEDULED activities (future or today, not past logged activities)
      const now = new Date();
      const todaysActivities = activities.filter(a => {
        const activityDate = new Date(a.activity_date);
        // Only include if activity is scheduled for today or later AND is in the future (not already past)
        const isTodayOrLater = activityDate >= today;
        const isScheduledOrPending = a.activity_type === 'call' || a.activity_type === 'task' || a.activity_type === 'meeting';
        // Exclude if it's already past (older than 30 minutes ago)
        const isPast = activityDate < new Date(now.getTime() - 30 * 60 * 1000);
        return isTodayOrLater && isScheduledOrPending && !isPast;
      });

      if (todaysActivities.length === 0) continue;

      // Send email
      const tasksList = todaysActivities
        .map(a => `• ${a.contact_name || a.company_name || 'Unnamed'} at ${new Date(a.activity_date).toLocaleTimeString()}`)
        .join('\n');

      await sendBrevoEmail({
        to: member.email,
        subject: `You have ${todaysActivities.length} task${todaysActivities.length > 1 ? 's' : ''} today`,
        textContent: `Hi ${member.full_name},\n\nYou have ${todaysActivities.length} upcoming task${todaysActivities.length > 1 ? 's' : ''} scheduled for today:\n\n${tasksList}\n\nBest regards,\nArriv Team`
      });
    }

    return Response.json({ success: true, processed: salesTeamMembers.length });
  } catch (error) {
    console.error('Error sending upcoming task emails:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
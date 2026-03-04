import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get all activities for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const allActivities = await base44.asServiceRole.entities.ActivityLog.list('-activity_date', 500);

    const todayActivities = allActivities.filter(activity => {
      const activityDate = new Date(activity.activity_date);
      activityDate.setHours(0, 0, 0, 0);
      return activityDate.getTime() === today.getTime();
    });

    // Get unique sales members with today's tasks
    const memberEmails = new Set();
    todayActivities.forEach(activity => {
      if (activity.sales_member_email) {
        memberEmails.add(activity.sales_member_email);
      }
    });

    // Send email for each member
    for (const email of memberEmails) {
      const memberTasks = todayActivities.filter(a => a.sales_member_email === email);

      const tasksList = memberTasks.map(task => {
        const time = new Date(task.activity_date).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
        return `• ${time} - ${task.contact_name || task.company_name || 'No contact'}: ${task.notes}`;
      }).join('\n');

      const subject = `You have ${memberTasks.length} upcoming task${memberTasks.length > 1 ? 's' : ''} today`;
      const body = `You have ${memberTasks.length} task${memberTasks.length > 1 ? 's' : ''} scheduled for today:\n\n${tasksList}`;

      try {
        await base44.integrations.Core.SendEmail({
          to: email,
          subject: subject,
          body: body,
          from_name: 'Arriv'
        });
      } catch (emailError) {
        console.error(`Failed to send email to ${email}:`, emailError);
      }
    }

    return Response.json({
      success: true,
      sentEmails: memberEmails.size,
      tasksProcessed: todayActivities.length
    });
  } catch (error) {
    console.error('Error in sendUpcomingTaskReminders:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
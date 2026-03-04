import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get all sales team members
    const salesMembers = await base44.asServiceRole.entities.SalesTeamMember.list();

    if (!salesMembers || salesMembers.length === 0) {
      return Response.json({ success: true, message: "No sales members found" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let sentCount = 0;
    let errorCount = 0;

    for (const member of salesMembers) {
      if (!member.email || !member.company_email) continue;

      try {
        // Get all activities for this member
        const activities = await base44.asServiceRole.entities.ActivityLog.filter(
          { sales_member_email: member.email },
          '-activity_date',
          200
        );

        if (!activities || activities.length === 0) continue;

        // Filter for today's tasks
        const tasksToday = activities.filter(a => {
          const activityDate = new Date(a.activity_date);
          activityDate.setHours(0, 0, 0, 0);
          return activityDate.getTime() === today.getTime();
        });

        if (tasksToday.length === 0) continue;

        // Build email content
        const taskList = tasksToday
          .sort((a, b) => new Date(a.activity_date) - new Date(b.activity_date))
          .map(t => `• ${t.contact_name || t.company_name} at ${new Date(t.activity_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`)
          .join('\n');

        const emailBody = `Hi ${member.full_name},\n\nYou have ${tasksToday.length} upcoming task${tasksToday.length > 1 ? 's' : ''} today:\n\n${taskList}\n\nLog in to the Activity Log to view details.\n\nBest regards,\nArriv`;

        // Send email via Gmail
        await base44.integrations.Core.SendEmail({
          from_name: "Arriv",
          to: member.email,
          subject: `You have ${tasksToday.length} upcoming task${tasksToday.length > 1 ? 's' : ''} today`,
          body: emailBody
        });

        sentCount++;
      } catch (error) {
        console.error(`Failed to send reminder to ${member.email}:`, error);
        errorCount++;
      }
    }

    return Response.json({
      success: true,
      sentCount,
      errorCount,
      message: `Sent ${sentCount} reminders, ${errorCount} errors`
    });
  } catch (error) {
    console.error('Error in sendUpcomingTaskReminders:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
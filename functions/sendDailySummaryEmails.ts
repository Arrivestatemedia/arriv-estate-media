import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { emailType } = await req.json(); // 'morning' or 'evening'
    
    if (!emailType || !['morning', 'evening'].includes(emailType)) {
      return Response.json({ error: 'Invalid emailType' }, { status: 400 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all sales team members
    const salesMembers = await base44.asServiceRole.entities.SalesTeamMember.filter({});

    for (const member of salesMembers) {
      if (!member.email) continue;

      const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');

      // Get activities for today
      const activities = await base44.asServiceRole.entities.ActivityLog.filter({
        sales_member_id: member.id,
        activity_date: { $gte: today.toISOString(), $lt: tomorrow.toISOString() }
      }, '-activity_date', 100);

      if (emailType === 'morning') {
        // Send morning email with upcoming tasks (future activities today)
        const upcomingActivities = activities.filter(a => new Date(a.activity_date) > new Date());
        
        if (upcomingActivities.length === 0) continue;

        const firstName = member.full_name?.split(' ')[0] || 'there';
        const taskSummary = upcomingActivities
          .map(a => `• ${a.contact_name || a.company_name} at ${new Date(a.activity_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${a.notes?.slice(0, 50)}`)
          .join('\n');

        const body = `Good Morning ${firstName}!\n\nToday you have ${upcomingActivities.length} scheduled activity(ies):\n\n${taskSummary}\n\nLet's make it a great day!`;

        await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            raw: Buffer.from(
              `To: ${member.email}\nSubject: Your Schedule for Today\n\n${body}`
            ).toString('base64')
          })
        });
      } else if (emailType === 'evening') {
        // Send evening email with full summary of all activities
        if (activities.length === 0) continue;

        const firstName = member.full_name?.split(' ')[0] || 'there';
        const activitySummary = activities
          .map(a => `• ${a.contact_name || a.company_name} at ${new Date(a.activity_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${a.notes}`)
          .join('\n');

        const body = `Good Afternoon ${firstName}!\n\nPlease find your summary below!\n\nToday's Activities:\n${activitySummary}\n\nGreat work today!`;

        await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            raw: Buffer.from(
              `To: ${member.email}\nSubject: Your Daily Summary\n\n${body}`
            ).toString('base64')
          })
        });
      }
    }

    return Response.json({ success: true, emailType, membersProcessed: salesMembers.length });
  } catch (error) {
    console.error('Error sending daily summary emails:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
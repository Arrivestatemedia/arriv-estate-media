import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Use service role so this can be called by automation
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all upcoming activities for today
    const allLogs = await base44.asServiceRole.entities.ActivityLog.list('-activity_date', 500);

    const todayTasks = allLogs.filter(log => {
      const d = new Date(log.activity_date);
      return d >= today && d < tomorrow;
    });

    if (todayTasks.length === 0) {
      return Response.json({ sent: 0, message: "No tasks today" });
    }

    // Group by sales member
    const byMember = {};
    for (const task of todayTasks) {
      const email = task.sales_member_email;
      if (!email) continue;
      if (!byMember[email]) byMember[email] = [];
      byMember[email].push(task);
    }

    let sent = 0;
    for (const [email, tasks] of Object.entries(byMember)) {
      const taskLines = tasks.map(t => {
        const time = new Date(t.activity_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const contact = t.contact_name ? ` with ${t.contact_name}` : '';
        return `• ${t.activity_type?.toUpperCase()} at ${time}${contact}: ${t.notes?.slice(0, 100)}`;
      }).join('\n');

      const body = `Hi,\n\nHere are your scheduled tasks for today:\n\n${taskLines}\n\nLog in to Arriv One to view all details.\n\n— Arriv Team`;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: email,
        subject: `📋 You have ${tasks.length} task${tasks.length > 1 ? 's' : ''} today`,
        body
      });
      sent++;
    }

    return Response.json({ sent, message: `Emails sent to ${sent} reps` });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
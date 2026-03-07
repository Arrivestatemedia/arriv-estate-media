import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Use service role for scheduled tasks
    const pending = await base44.asServiceRole.entities.ScheduledEmail.filter({
      status: "pending"
    });

    const now = new Date();
    const toSend = pending.filter(e => new Date(e.scheduled_for) <= now);

    let sent = 0, failed = 0;

    for (const email of toSend) {
      try {
        await base44.asServiceRole.functions.invoke('sendEmailViaGmail', {
          to: email.to,
          subject: email.subject,
          body: email.body,
          fromEmail: email.from_email || undefined,
          fromName: email.from_name || undefined,
          salesMemberId: email.sales_member_id || undefined,
        });

        await base44.asServiceRole.entities.ScheduledEmail.update(email.id, {
          status: "sent",
          sent_at: new Date().toISOString()
        });
        sent++;
      } catch (err) {
        await base44.asServiceRole.entities.ScheduledEmail.update(email.id, {
          status: "failed",
          error_message: err.message
        });
        failed++;
      }
    }

    return Response.json({ success: true, sent, failed, checked: toSend.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
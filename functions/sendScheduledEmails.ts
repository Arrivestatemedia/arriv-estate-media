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

    // Cap at 20 per run to avoid timeouts
    const batch = toSend.slice(0, 20);

    const results = await Promise.allSettled(
      batch.map(async (email) => {
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
      })
    );

    let sent = 0, failed = 0;
    await Promise.all(results.map(async (result, i) => {
      if (result.status === 'fulfilled') {
        sent++;
      } else {
        failed++;
        await base44.asServiceRole.entities.ScheduledEmail.update(batch[i].id, {
          status: "failed",
          error_message: result.reason?.message || 'Unknown error'
        });
      }
    }));

    return Response.json({ success: true, sent, failed, checked: batch.length, total_pending: toSend.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
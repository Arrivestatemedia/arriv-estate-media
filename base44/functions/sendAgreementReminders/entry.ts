import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { isTerminal, AGREEMENT_STATES } from '../../shared/agreementStateMachine.ts';
import { logAgreementEvent } from '../../shared/agreementEventLog.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // This is a scheduled workflow function — no body needed
    const now = new Date();

    // Get all sent/in-progress agreements
    const activeAgreements = await base44.asServiceRole.entities.Agreement.filter({
      status: { $in: [AGREEMENT_STATES.SENT, AGREEMENT_STATES.DELIVERED, AGREEMENT_STATES.OPENED, AGREEMENT_STATES.VIEWING, AGREEMENT_STATES.SIGNING, AGREEMENT_STATES.PARTIALLY_SIGNED] },
    }, '-sent_at', 500);

    let remindersSent = 0;
    let expiredCount = 0;

    for (const agreement of activeAgreements) {
      // Check expiration
      if (agreement.expires_at && new Date(agreement.expires_at) < now) {
        await base44.asServiceRole.entities.Agreement.update(agreement.id, { status: AGREEMENT_STATES.EXPIRED, updated_at: now.toISOString() });
        await logAgreementEvent(base44.asServiceRole, agreement.id, 'AGREEMENT_EXPIRED', { actor: 'system', actor_type: 'system' });
        expiredCount++;
        continue;
      }

      // Skip if reminders paused
      if (agreement.reminders_paused) continue;

      // Get recipients who haven't completed
      const recipients = await base44.asServiceRole.entities.AgreementRecipient.filter({ agreement_id: agreement.id });
      const pendingRecipients = recipients.filter(r =>
        r.is_required !== false &&
        r.role !== 'CC' && r.role !== 'VIEWER' &&
        ['PENDING', 'NOTIFIED', 'DELIVERED', 'OPENED'].includes(r.status)
      );

      if (pendingRecipients.length === 0 || !agreement.sent_at) continue;

      // Check reminder schedule
      const sentAt = new Date(agreement.sent_at);
      const hoursSinceSent = (now.getTime() - sentAt.getTime()) / (1000 * 60 * 60);
      const schedule = agreement.reminder_schedule_hours || [24, 72, 168];

      for (const recipient of pendingRecipients) {
        // Check which reminder tier they're due for
        const existingReminders = await base44.asServiceRole.entities.AgreementNotification.filter({
          agreement_id: agreement.id,
          recipient_id: recipient.recipient_id,
          notification_type: 'AGREEMENT_REMINDER',
        });

        const reminderCount = existingReminders.length;
        if (reminderCount >= schedule.length) continue;

        const nextReminderHours = schedule[reminderCount];
        if (hoursSinceSent >= nextReminderHours) {
          // Send reminder via manageAgreements
          await base44.functions.invoke('manageAgreements', {
            action: 'send_reminder',
            agreement_id: agreement.id,
            recipient_id: recipient.recipient_id,
            reminder_number: reminderCount + 1,
            actor: 'system',
          });
          remindersSent++;
        }
      }
    }

    return Response.json({
      status: 'OK',
      data: { reminders_sent: remindersSent, expired: expiredCount, checked: activeAgreements.length },
    });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});
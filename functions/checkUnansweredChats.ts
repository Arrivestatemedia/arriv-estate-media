import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const THRESHOLD_MS = 2.5 * 60 * 1000; // 2.5 minutes
    const now = Date.now();
    const cutoff = new Date(now - THRESHOLD_MS).toISOString();

    // Fetch sales members, DMs, and Gmail token in parallel
    const [salesMembers, allDMs, { accessToken }] = await Promise.all([
      base44.asServiceRole.entities.SalesTeamMember.list(),
      base44.asServiceRole.entities.DirectMessage.filter({ read: false, reminder_sent: false }),
      base44.asServiceRole.connectors.getConnection('gmail')
    ]);

    const memberMap = {};
    salesMembers.forEach(m => { memberMap[m.id] = m; });

    const unreminedOldDMs = allDMs.filter(dm => {
      const ts = dm.timestamp || dm.created_date;
      return ts && new Date(ts).toISOString() < cutoff;
    });

    // Group by recipient so we send one email per recipient
    const dmByRecipient = {};
    for (const dm of unreminedOldDMs) {
      if (!dmByRecipient[dm.recipient_id]) dmByRecipient[dm.recipient_id] = [];
      dmByRecipient[dm.recipient_id].push(dm);
    }

    const gmailHeaders = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    const results = await Promise.allSettled(
      Object.entries(dmByRecipient).map(async ([recipientId, dms]) => {
        const recipient = memberMap[recipientId];
        if (!recipient || !recipient.email) return;

        const count = dms.length;
        const senderNames = [...new Set(dms.map(d => d.sender_name).filter(Boolean))].join(', ');
        const emailBody = `Hi ${recipient.full_name},\n\nYou have ${count} unread direct message${count > 1 ? 's' : ''} from ${senderNames} that ${count > 1 ? 'have' : 'has'} been waiting over 2.5 minutes for a reply.\n\nPlease log in and respond.\n\n– Arriv Team`;
        const subject = `You have ${count} unanswered direct message${count > 1 ? 's' : ''}`;
        const message = `To: ${recipient.email}\nSubject: ${subject}\n\n${emailBody}`;
        const utf8Bytes = new TextEncoder().encode(message);
        const encodedMessage = btoa(String.fromCharCode(...utf8Bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

        await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: gmailHeaders,
          body: JSON.stringify({ raw: encodedMessage })
        });

        // Mark all DMs as reminded in parallel
        await Promise.all(dms.map(dm =>
          base44.asServiceRole.entities.DirectMessage.update(dm.id, { reminder_sent: true })
        ));
      })
    );

    const emailsSent = results.filter(r => r.status === 'fulfilled').length;

    return Response.json({ success: true, emailsSent });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
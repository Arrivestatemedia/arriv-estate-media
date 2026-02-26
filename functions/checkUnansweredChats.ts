import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const THRESHOLD_MS = 2.5 * 60 * 1000; // 2.5 minutes
    const now = Date.now();
    const cutoff = new Date(now - THRESHOLD_MS).toISOString();

    // Get all sales team members for email lookup
    const salesMembers = await base44.asServiceRole.entities.SalesTeamMember.list();
    const memberMap = {};
    salesMembers.forEach(m => { memberMap[m.id] = m; });

    let emailsSent = 0;

    // Only handle Direct Messages (no channels)
    // Find DMs that are:
    //   1. Unread by the recipient
    //   2. Older than 2.5 minutes
    //   3. Reminder has NOT been sent yet
    const allDMs = await base44.asServiceRole.entities.DirectMessage.filter({ read: false, reminder_sent: false });
    const unreminedOldDMs = allDMs.filter(dm => {
      const ts = dm.timestamp || dm.created_date;
      return ts && new Date(ts).toISOString() < cutoff;
    });

    // Group by recipient so we send one email per recipient (even if multiple unread DMs)
    const dmByRecipient = {};
    for (const dm of unreminedOldDMs) {
      if (!dmByRecipient[dm.recipient_id]) dmByRecipient[dm.recipient_id] = [];
      dmByRecipient[dm.recipient_id].push(dm);
    }

    for (const [recipientId, dms] of Object.entries(dmByRecipient)) {
      const recipient = memberMap[recipientId];
      if (!recipient || !recipient.email) continue;

      const count = dms.length;
      const senderNames = [...new Set(dms.map(d => d.sender_name).filter(Boolean))].join(', ');

      const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');

      const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      };

      const emailBody = `Hi ${recipient.full_name},\n\nYou have ${count} unread direct message${count > 1 ? 's' : ''} from ${senderNames} that ${count > 1 ? 'have' : 'has'} been waiting over 2.5 minutes for a reply.\n\nPlease log in and respond.\n\n– Arriv Team`;
      const subject = `You have ${count} unanswered direct message${count > 1 ? 's' : ''}`;
      const message = `To: ${recipient.email}\nSubject: ${subject}\n\n${emailBody}`;
      const utf8Bytes = new TextEncoder().encode(message);
      const encodedMessage = btoa(String.fromCharCode(...utf8Bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

      await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers,
        body: JSON.stringify({ raw: encodedMessage })
      });

      // Mark all these DMs as reminder_sent so we never email again for them
      for (const dm of dms) {
        await base44.asServiceRole.entities.DirectMessage.update(dm.id, { reminder_sent: true });
      }

      emailsSent++;
    }

    return Response.json({ success: true, emailsSent });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
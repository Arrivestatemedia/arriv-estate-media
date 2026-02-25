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

    const adminEmail = Deno.env.get('ADMIN_EMAIL');

    let emailsSent = 0;

    // --- Check Direct Messages ---
    // Find DMs older than 2.5 min that have not been replied to
    const allDMs = await base44.asServiceRole.entities.DirectMessage.filter({ read: false });
    const unreadOldDMs = allDMs.filter(dm => {
      const ts = dm.timestamp || dm.created_date;
      return ts && new Date(ts).toISOString() < cutoff;
    });

    // Group by recipient
    const dmByRecipient = {};
    for (const dm of unreadOldDMs) {
      if (!dmByRecipient[dm.recipient_id]) dmByRecipient[dm.recipient_id] = [];
      dmByRecipient[dm.recipient_id].push(dm);
    }

    for (const [recipientId, dms] of Object.entries(dmByRecipient)) {
      const recipient = memberMap[recipientId];
      if (!recipient) continue;

      const count = dms.length;
      const senderNames = [...new Set(dms.map(d => d.sender_name).filter(Boolean))].join(', ');

      const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
      
      const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      };

      const emailBody = `Hi ${recipient.full_name},\n\nYou have ${count} unread message${count > 1 ? 's' : ''} from ${senderNames} that ${count > 1 ? 'have' : 'has'} been waiting over 2.5 minutes for a reply.\n\nPlease log in and respond.\n\n– Arriv Team`;
      
      const message = `To: ${recipient.email}\nSubject: You have ${count} unanswered chat message${count > 1 ? 's' : ''}\n\n${emailBody}`;
      const utf8Bytes = new TextEncoder().encode(message);
      const encodedMessage = btoa(String.fromCharCode(...utf8Bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

      await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers,
        body: JSON.stringify({ raw: encodedMessage })
      });
      
      emailsSent++;
    }

    // --- Check Channel Messages (no reply from anyone in 2.5 min) ---
    const channels = await base44.asServiceRole.entities.ChatChannel.list();
    for (const channel of channels) {
      const recentMsgs = await base44.asServiceRole.entities.ChatMessage.filter({ channel_id: channel.id }, '-timestamp', 5);
      if (recentMsgs.length === 0) continue;

      const lastMsg = recentMsgs[0];
      const ts = lastMsg.timestamp || lastMsg.created_date;
      if (!ts || new Date(ts).toISOString() >= cutoff) continue;

      // Check if there's a reply from someone else after the last message
      const hasReply = recentMsgs.some(m => m.sender_id !== lastMsg.sender_id && (m.timestamp || m.created_date) > ts);
      if (hasReply) continue;

      // No reply — notify other channel members (not the sender)
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');

      for (const memberId of channel.members || []) {
        if (memberId === lastMsg.sender_id) continue; // Skip the sender
        
        const member = memberMap[memberId];
        if (!member) continue;

        const headers = {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        };

        const emailBody = `Hi ${member.full_name},\n\n${lastMsg.sender_name} sent a message in #${channel.name} over 2.5 minutes ago that hasn't been addressed.\n\nMessage: "${lastMsg.content}"\n\nPlease review and respond if needed.\n\n– Arriv Team`;

        const message = `To: ${member.email}\nSubject: Unanswered message in #${channel.name} from ${lastMsg.sender_name}\n\n${emailBody}`;
        const utf8Bytes = new TextEncoder().encode(message);
        const encodedMessage = btoa(String.fromCharCode(...utf8Bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

        await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers,
          body: JSON.stringify({ raw: encodedMessage })
        });

        emailsSent++;
      }
    }

    return Response.json({ success: true, emailsSent });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
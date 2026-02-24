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

      // Only email the rep (or admin if the admin is the recipient)
      const isAdmin = recipient.email === adminEmail;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: recipient.email,
        subject: `⚠️ You have ${count} unanswered chat message${count > 1 ? 's' : ''}`,
        body: `Hi ${recipient.full_name},\n\nYou have ${count} unread message${count > 1 ? 's' : ''} from ${senderNames} that ${count > 1 ? 'have' : 'has'} been waiting over 2.5 minutes for a reply.\n\nPlease log in and respond.\n\n– Arriv Team`
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

      // No reply — only email the sender
      const sender = memberMap[lastMsg.sender_id];
      if (!sender) continue;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: sender.email,
        subject: `⚠️ No response yet in #${channel.name}`,
        body: `Hi ${sender.full_name},\n\nYour message in #${channel.name} hasn't received a reply in over 2.5 minutes.\n\nMessage: "${lastMsg.content}"\n\nYou may want to follow up.\n\n– Arriv Team`
      });
      emailsSent++;
    }

    return Response.json({ success: true, emailsSent });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
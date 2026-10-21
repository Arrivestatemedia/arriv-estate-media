import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import {
  statusCallbackUrl,
  rewriteOutboundLinks,
  persistTrackedLinks,
  friendlyFailureReason,
  rankOf,
  STATUS_RANK,
} from '../../shared/smsTracking.ts';

/**
 * Sends a text message from the representative's own assigned number.
 *
 * Enhancement over the previous version:
 *   - The message record is written BEFORE the Twilio call, so a rejected send is
 *     still visible in the thread with the reason instead of disappearing.
 *   - Twilio is asked to report delivery status back to this app, so Delivered is
 *     only ever shown once Twilio confirms it (a successful request only means queued).
 *   - Trackable links in the message are rewritten to our own tracked redirect.
 *     Sign-in, password, verification, payment, invoice and internal links are never
 *     rewritten.
 *
 * Unchanged: the sending number (the representative's assigned Twilio number, with
 * the company number as fallback), the conversation handling, and the response shape.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { conversationId, toNumber, body, salesMemberId, newConversation } = await req.json();

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    let fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    // Use sales rep's assigned number if provided
    if (salesMemberId) {
      const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
      const member = members[0];
      if (member && member.twilio_phone_number) {
        fromNumber = member.twilio_phone_number;
      }
    }

    // Resolve the conversation first so the message record can exist before sending.
    let convoId = conversationId;
    if (!convoId) {
      const existing = await base44.asServiceRole.entities.SmsConversation.filter({ from_number: toNumber });
      if (existing && existing.length > 0) {
        convoId = existing[0].id;
      } else {
        const newConvo = await base44.asServiceRole.entities.SmsConversation.create({
          from_number: toNumber,
          last_message: body,
          last_message_at: new Date().toISOString(),
          unread_count: 0,
          sales_member_id: salesMemberId,
        });
        convoId = newConvo.id;
      }
    }

    const { body: outboundBody, links } = rewriteOutboundLinks(String(body || ''));
    const now = new Date().toISOString();

    const message = await base44.asServiceRole.entities.SmsMessage.create({
      conversation_id: convoId,
      from_number: fromNumber,
      to_number: toNumber,
      body: outboundBody,
      direction: 'outbound',
      twilio_sid: '',
      sales_member_id: salesMemberId || '',
      status: 'queued',
      status_rank: STATUS_RANK.queued,
      status_updated_at: now,
      has_links: links.length > 0,
      delivery_events: [{ status: 'queued', rank: STATUS_RANK.queued, at: now, error_code: '' }],
      link_engagement: {
        click_count: 0,
        human_click_count: 0,
        preview_count: 0,
        first_click_at: '',
        last_click_at: '',
        last_destination_label: '',
        last_destination_url: '',
        last_event_type: '',
      },
    });

    const formData = new URLSearchParams({
      From: fromNumber,
      To: toNumber,
      Body: outboundBody,
      StatusCallback: statusCallbackUrl(),
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      }
    );

    const result = await response.json();

    if (!response.ok) {
      const reason = result.message || 'Failed to send SMS';
      const failedAt = new Date().toISOString();
      const errorCode = String(result.code || '');
      await base44.asServiceRole.entities.SmsMessage.update(message.id, {
        status: 'failed',
        status_rank: STATUS_RANK.failed,
        status_updated_at: failedAt,
        failed_at: failedAt,
        twilio_error_code: errorCode,
        twilio_error_message: friendlyFailureReason(errorCode, 'failed') || reason,
        delivery_events: [
          { status: 'queued', rank: STATUS_RANK.queued, at: now, error_code: '' },
          { status: 'failed', rank: STATUS_RANK.failed, at: failedAt, error_code: errorCode },
        ],
      });
      await base44.asServiceRole.entities.SmsConversation.update(convoId, {
        last_message: outboundBody,
        last_message_at: failedAt,
      });
      return Response.json({ success: false, error: reason, messageId: message.id }, { status: 500 });
    }

    const apiStatus = String(result.status || 'queued').toLowerCase();
    const acceptedStatus = (apiStatus in STATUS_RANK) && apiStatus !== 'unset' ? apiStatus : 'queued';
    const acceptedAt = new Date().toISOString();

    const patch: any = {
      twilio_sid: result.sid || '',
      status: acceptedStatus,
      status_rank: rankOf(acceptedStatus),
      status_updated_at: acceptedAt,
    };
    const segments = Number(result.num_segments);
    if (Number.isFinite(segments) && segments > 0) patch.segment_count = segments;
    await base44.asServiceRole.entities.SmsMessage.update(message.id, patch);

    if (links.length) {
      await persistTrackedLinks(base44, links, {
        messageId: message.id,
        messageSid: result.sid || '',
        conversationId: convoId,
        salesMemberId: salesMemberId || '',
        customerNumber: toNumber,
        now: acceptedAt,
      });
    }

    await base44.asServiceRole.entities.SmsConversation.update(convoId, {
      last_message: outboundBody,
      last_message_at: acceptedAt,
      last_outbound_at: acceptedAt,
    });

    return Response.json({
      success: true,
      sid: result.sid,
      status: acceptedStatus,
      messageId: message.id,
      trackedLinks: links.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
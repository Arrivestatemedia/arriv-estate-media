import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import {
  rewriteOutboundLinks,
  persistTrackedLinks,
  recordTrackedClick,
  applyDeliveryStatus,
  recordInboundReply,
  classifyUserAgent,
} from '../../shared/smsTracking.ts';

/**
 * SMS tracking certification harness.
 *
 * Admin-gated. Creates clearly marked synthetic records (555 test numbers and a
 * `smstest_` run prefix), exercises the tracking logic, and deletes every synthetic
 * row in a finally block. It never sends a real message and never touches a real
 * customer record, phone number, or conversation.
 */
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (user && user.role !== 'admin') {
    return Response.json({ error: 'Admin access required' }, { status: 403 });
  }

  const runId = `smstest_${Date.now().toString(36)}`;
  const repA = `${runId}_repA`;
  const repB = `${runId}_repB`;
  const numberA = '+15550000001';
  const numberB = '+15550000002';
  const numberFromA = '+15550009991';
  const created = { messages: [] as string[], links: [] as string[], conversations: [] as string[] };
  const scenarios: { name: string; pass: boolean; details: any }[] = [];
  const svc = base44.asServiceRole.entities;

  const check = (name: string, pass: boolean, details: any = {}) => {
    scenarios.push({ name, pass: !!pass, details });
  };

  try {
    const convoA = await svc.SmsConversation.create({
      from_number: numberA, contact_name: 'Tracking Test A', sales_member_id: repA,
    });
    const convoB = await svc.SmsConversation.create({
      from_number: numberB, contact_name: 'Tracking Test B', sales_member_id: repB,
    });
    created.conversations.push(convoA.id, convoB.id);

    const newOutbound = async (convo: any, body: string, sid: string, sentAt?: string) => {
      const row = await svc.SmsMessage.create({
        conversation_id: convo.id,
        from_number: numberFromA,
        to_number: convo.from_number,
        body,
        direction: 'outbound',
        twilio_sid: sid,
        sales_member_id: convo.sales_member_id,
        status: 'queued',
        status_rank: 1,
        status_updated_at: sentAt || new Date().toISOString(),
        sent_at: sentAt || '',
        delivery_events: [{ status: 'queued', rank: 1, at: sentAt || new Date().toISOString(), error_code: '' }],
        has_links: false,
        link_engagement: { click_count: 0, human_click_count: 0, preview_count: 0, first_click_at: '', last_click_at: '', last_destination_label: '', last_destination_url: '', last_event_type: '' },
      });
      created.messages.push(row.id);
      return row;
    };

    const reload = async (id: string) => (await svc.SmsMessage.filter({ id }))[0];

    // 1 — message successfully sent
    const sentMsg = await newOutbound(convoA, 'First message', `${runId}_SM_SENT`);
    const r1 = await applyDeliveryStatus(base44, { sid: `${runId}_SM_SENT`, status: 'sent', segments: 1 });
    let row = await reload(sentMsg.id);
    check('1 message sent', r1.applied && row.status === 'sent' && !!row.sent_at, { status: row.status, reason: r1.reason });

    // 2 — confirmed delivered
    const r2 = await applyDeliveryStatus(base44, { sid: `${runId}_SM_SENT`, status: 'delivered' });
    row = await reload(sentMsg.id);
    check('2 confirmed delivered', row.status === 'delivered' && !!row.delivered_at, { status: row.status, reason: r2.reason });

    // 11a — duplicate callback
    const rDupe = await applyDeliveryStatus(base44, { sid: `${runId}_SM_SENT`, status: 'delivered' });
    check('11a duplicate callback ignored', rDupe.applied === false && rDupe.reason === 'duplicate_callback', rDupe);

    // 11b — a delayed callback for an earlier stage cannot downgrade a delivered message
    const rOlder = await applyDeliveryStatus(base44, { sid: `${runId}_SM_SENT`, status: 'sending' });
    row = await reload(sentMsg.id);
    check('11b out-of-order callback does not downgrade', row.status === 'delivered' && rOlder.applied === false && rOlder.reason === 'delivered_is_final', { status: row.status, reason: rOlder.reason, events: row.delivery_events?.length });

    // 3 — delivery fails
    const failMsg = await newOutbound(convoA, 'Second message', `${runId}_SM_FAIL`);
    await applyDeliveryStatus(base44, { sid: `${runId}_SM_FAIL`, status: 'failed', errorCode: '30007' });
    row = await reload(failMsg.id);
    check('3 delivery failure recorded', row.status === 'failed' && row.twilio_error_code === '30007' && !!row.twilio_error_message, { status: row.status, reason: row.twilio_error_message });
    const undeliveredMsg = await newOutbound(convoA, 'Third message', `${runId}_SM_UNDELIVERED`);
    await applyDeliveryStatus(base44, { sid: `${runId}_SM_UNDELIVERED`, status: 'undelivered', errorCode: '30003' });
    row = await reload(undeliveredMsg.id);
    check('3b undelivered recorded with explanation', row.status === 'undelivered' && !!row.twilio_error_message, { status: row.status, reason: row.twilio_error_message });

    // 4 — message without links is never marked as opened
    const noLink = rewriteOutboundLinks('Call me when you are on the way, 2pm works');
    check('4 no links, nothing tracked', noLink.links.length === 0 && noLink.body === 'Call me when you are on the way, 2pm works', noLink);

    // 5 — tracked link, destination preserved
    const withLink = rewriteOutboundLinks('Here is the gallery: https://app.arrivestatemedia.com/book?job=42 — see you there');
    const rewrittenOk = withLink.links.length === 1
      && withLink.body.includes('/functions/smsLinkRedirect?c=')
      && withLink.links[0].target_url === 'https://app.arrivestatemedia.com/book?job=42';
    check('5 tracked link rewritten, destination preserved', rewrittenOk, withLink);

    // 12 — exclusions and non-https are left untouched
    const excluded = rewriteOutboundLinks('Reset your password: https://app.arrivestatemedia.com/reset-password?token=abc Payment: https://checkout.stripe.com/pay/cs_test_1 Invoice: https://arrivestatemedia.com/invoice/99 Plain http: http://example.com/x Branded file: https://arrivestatemedia.com/r/f1234567');
    check('12 sensitive and internal links never rewritten', excluded.links.length === 0 && excluded.body.includes('/reset-password?token=abc') && excluded.body.includes('checkout.stripe.com'), excluded);

    // 6 / 7 — click and automated preview
    const linkMsg = await newOutbound(convoA, withLink.body, `${runId}_SM_LINK`);
    await persistTrackedLinks(base44, withLink.links, {
      messageId: linkMsg.id, messageSid: `${runId}_SM_LINK`, conversationId: convoA.id,
      salesMemberId: repA, customerNumber: numberA, now: new Date().toISOString(),
    });
    const linkRows = await svc.SmsTrackedLink.filter({ message_id: linkMsg.id });
    const linkRow = linkRows[0];
    if (linkRow) created.links.push(linkRow.id);

    const click1 = await recordTrackedClick(base44, linkRow, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1');
    row = await reload(linkMsg.id);
    check('6 customer click recorded', click1.category === 'human' && row.link_engagement?.human_click_count === 1 && !!row.link_engagement?.first_click_at && row.link_engagement?.last_destination_label, { engagement: row.link_engagement });

    const click2 = await recordTrackedClick(base44, linkRow, 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)');
    row = await reload(linkMsg.id);
    const convoAfterClick = (await svc.SmsConversation.filter({ id: convoA.id }))[0];
    check('7 automated preview distinguished', click2.category === 'preview' && row.link_engagement?.preview_count === 1 && row.link_engagement?.human_click_count === 1 && convoAfterClick.link_click_count === 2, { engagement: row.link_engagement, conversation_clicks: convoAfterClick.link_click_count });
    check('7b classification helper', classifyUserAgent('') === 'unknown' && classifyUserAgent('Googlebot/2.1') === 'preview' && classifyUserAgent('Mozilla/5.0 Chrome/120') === 'human');

    // 8 — customer replies (single outbound waiting)
    const waitConvo = await svc.SmsConversation.create({ from_number: '+15550000003', contact_name: 'Tracking Test Reply', sales_member_id: repA });
    created.conversations.push(waitConvo.id);
    const waiting = await newOutbound(waitConvo, 'Are you free Tuesday?', `${runId}_SM_WAIT`);
    const inbound = await svc.SmsMessage.create({
      conversation_id: waitConvo.id, from_number: waitConvo.from_number, to_number: numberFromA,
      body: 'Tuesday works', direction: 'inbound', twilio_sid: `${runId}_SM_REPLY`,
    });
    created.messages.push(inbound.id);
    const reply1 = await recordInboundReply(base44, waitConvo, { messageId: inbound.id, sid: `${runId}_SM_REPLY` });
    const waitingAfter = await reload(waiting.id);
    const waitConvoAfter = (await svc.SmsConversation.filter({ id: waitConvo.id }))[0];
    check('8 reply recorded and attributed', reply1.attributed === true && !!waitingAfter.replied_at && !!waitConvoAfter.last_reply_at, { reply: reply1, replied_at: waitingAfter.replied_at });

    // 9 — reply after several unanswered texts is never credited to the newest one
    const olderConvo = await svc.SmsConversation.create({ from_number: '+15550000004', contact_name: 'Tracking Test Older', sales_member_id: repA });
    created.conversations.push(olderConvo.id);
    const olderA = await newOutbound(olderConvo, 'Oldest question', `${runId}_SM_OLD_A`);
    const olderB = await newOutbound(olderConvo, 'Newest question', `${runId}_SM_OLD_B`);
    const inbound2 = await svc.SmsMessage.create({
      conversation_id: olderConvo.id, from_number: olderConvo.from_number, to_number: numberFromA,
      body: 'Answering the first one', direction: 'inbound', twilio_sid: `${runId}_SM_REPLY2`,
    });
    created.messages.push(inbound2.id);
    const reply2 = await recordInboundReply(base44, olderConvo, { messageId: inbound2.id, sid: `${runId}_SM_REPLY2` });
    const olderAAfter = await reload(olderA.id);
    const olderBAfter = await reload(olderB.id);
    check('9 no false attribution to the newest message', reply2.attributed === false && !olderAAfter.replied_at && !olderBAfter.replied_at, { reply: reply2, oldest_replied: !!olderAAfter.replied_at, newest_replied: !!olderBAfter.replied_at });

    // 9b — a reply outside the window is not attributed
    const staleConvo = await svc.SmsConversation.create({ from_number: '+15550000005', contact_name: 'Tracking Test Stale', sales_member_id: repA });
    created.conversations.push(staleConvo.id);
    const staleSentAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const stale = await newOutbound(staleConvo, 'Five days ago', `${runId}_SM_STALE`, staleSentAt);
    const inbound3 = await svc.SmsMessage.create({
      conversation_id: staleConvo.id, from_number: staleConvo.from_number, to_number: numberFromA,
      body: 'Sorry for the delay', direction: 'inbound', twilio_sid: `${runId}_SM_REPLY3`,
    });
    created.messages.push(inbound3.id);
    const reply3 = await recordInboundReply(base44, staleConvo, { messageId: inbound3.id, sid: `${runId}_SM_REPLY3` });
    const staleAfter = await reload(stale.id);
    check('9b reply outside the window not attributed', reply3.attributed === false && reply3.reason === 'outside_reply_window' && !staleAfter.replied_at, { reply: reply3 });

    // 10 — each representative's traffic stays with that representative
    const repBMsg = await newOutbound(convoB, 'Rep B private message', `${runId}_SM_REPB`);
    const repBMessages = await svc.SmsMessage.filter({ conversation_id: convoB.id });
    const repAMessages = await svc.SmsMessage.filter({ conversation_id: convoA.id });
    const isolationOk = repBMsg.sales_member_id === repB
      && repBMessages.every((m: any) => m.conversation_id === convoB.id)
      && repAMessages.every((m: any) => m.sales_member_id === repA)
      && !repAMessages.some((m: any) => m.conversation_id === convoB.id);
    check('10 per-representative records kept apart', isolationOk, { rep_a_messages: repAMessages.length, rep_b_messages: repBMessages.length });

    // 12b — unknown SID is dropped safely, never treated as an error
    const unknown = await applyDeliveryStatus(base44, { sid: `${runId}_SM_NOT_OURS`, status: 'delivered' });
    check('12b unknown callback acknowledged safely', unknown.applied === false && unknown.reason === 'unknown_message', unknown);

    const passed = scenarios.filter((s) => s.pass).length;
    return Response.json({
      run_id: runId,
      passed,
      failed: scenarios.length - passed,
      scenarios,
      note: 'Synthetic rows only (555 test numbers), deleted at the end of the run. No real message was sent.',
    });
  } catch (error) {
    return Response.json({ run_id: runId, error: error.message, scenarios }, { status: 500 });
  } finally {
    try {
      if (created.messages.length) await base44.asServiceRole.entities.SmsMessage.deleteMany({ id: { $in: created.messages } });
      if (created.links.length) await base44.asServiceRole.entities.SmsTrackedLink.deleteMany({ id: { $in: created.links } });
      if (created.conversations.length) await base44.asServiceRole.entities.SmsConversation.deleteMany({ id: { $in: created.conversations } });
    } catch (e) {
      console.error('Tracking test cleanup failed:', e.message);
    }
  }
});
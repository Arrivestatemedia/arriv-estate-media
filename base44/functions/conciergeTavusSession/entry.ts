import { createClientFromRequest } from 'npm:@base44/sdk@0.8.59';
import { requireCustomer } from '../../shared/customerSession.ts';
import { resolvePreferredEntitlement } from '../../shared/preferredEntitlement.ts';
import { mintConciergeToolToken } from '../../shared/conciergeSessionToken.ts';
import { endTavusConversation, getTavusConversation } from '../../shared/tavusInterview.ts';

/**
 * On-demand Tavus video concierge session for a Preferred member.
 *
 * - Sessions start only when the customer asks for one, so no Tavus minutes are spent
 *   just by opening the portal.
 * - Credentials stay server-side. The browser receives only the conversation URL.
 * - Nothing is fabricated: with no concierge replica/PAL configured the function
 *   reports exactly what is missing instead of pretending a session exists.
 * - Only a first name and membership level are shared with Tavus. No email, no payment
 *   data, no transcripts of account records.
 */

const DAILY_VIDEO_ACTION_LIMIT = 40;

/** Arriv's business timezone, so the greeting matches the customer's own day. */
function timeOfDay(): string {
  try {
    const hour = Number(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(new Date()));
    if (hour < 12) return 'this morning';
    if (hour < 18) return 'this afternoon';
    return 'this evening';
  } catch {
    return 'today';
  }
}

function checklist(missing: string[]) {
  return [
    'Create the Arriv Concierge replica in Tavus (professional on-brand appearance and voice).',
    'Create a PAL for the concierge with the Arriv Concierge system prompt, and set its replica.',
    'Add the concierge tools in the Tavus PAL dashboard, each pointing at /functions/conciergeTavusTool with the tool name matching a registered action (for example list_bookings, open_gallery, prepare_booking).',
    'Add TAVUS_CONCIERGE_PAL_ID (and optionally TAVUS_CONCIERGE_REPLICA_ID) to the app secrets.',
    missing.includes('TAVUS_API_KEY') ? 'Add TAVUS_API_KEY to the app secrets.' : null,
    'Keep the preferred_concierge AppSetting video_enabled true to allow video sessions.',
  ].filter(Boolean);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const auth = await requireCustomer(base44, req, body);
    if (!auth.ok) {
      return Response.json({ ok: false, reason: 'SESSION_REQUIRED', error: auth.error }, { status: auth.status });
    }
    const email = auth.actor.email;

    const entitlement = await resolvePreferredEntitlement(base44, { email, accountId: auth.actor.account_id });
    if (!entitlement.active || entitlement.video_enabled === false) {
      return Response.json({
        ok: false,
        reason: 'PREFERRED_REQUIRED',
        message: 'The video concierge is available to Preferred members.',
      }, { status: 403 });
    }

    const sessionId = String(body?.session_id || '').trim();
    const sessions = await base44.asServiceRole.entities.ConciergeSession
      .filter({ customer_email: email }, { sort: '-last_active_at', limit: 5 });
    const rows = Array.isArray(sessions) ? sessions : (sessions?.items || []);
    let session = sessionId
      ? rows.find((row: any) => row.session_id === sessionId) || null
      : rows[0] || null;
    if (!session) {
      // The customer can ask for video before typing anything; mint the conversation now
      // so both channels share one history and one action engine.
      session = await base44.asServiceRole.entities.ConciergeSession.create({
        session_id: `cses_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        customer_email: email,
        conversation_id: `conv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        status: 'active',
        mode: 'video',
        transcript: [],
        preferences: {},
        last_active_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
    }

    if (String(body?.action || 'start') === 'end') {
      if (session.tavus_conversation_id) {
        await endTavusConversation(session.tavus_conversation_id).catch(() => null);
      }
      await base44.asServiceRole.entities.ConciergeSession.update(session.id, {
        tavus_conversation_id: '',
        tavus_conversation_url: '',
        tavus_ended_at: new Date().toISOString(),
        mode: 'text',
      });
      return Response.json({ ok: true, ended: true });
    }

    const apiKey = Deno.env.get('TAVUS_API_KEY');
    const palId = Deno.env.get('TAVUS_CONCIERGE_PAL_ID');
    const replicaId = Deno.env.get('TAVUS_CONCIERGE_REPLICA_ID');
    const missing: string[] = [];
    if (!apiKey) missing.push('TAVUS_API_KEY');
    if (!palId) missing.push('TAVUS_CONCIERGE_PAL_ID');
    if (!palId && !replicaId) missing.push('TAVUS_CONCIERGE_REPLICA_ID');

    if (missing.length) {
      return Response.json({
        ok: false,
        configured: false,
        missing,
        message: 'The Arriv Concierge video representative is not configured yet. The text concierge is fully available.',
        checklist: checklist(missing),
      });
    }

    // Reuse a live conversation instead of starting (and billing) a new one.
    if (session.tavus_conversation_id && session.tavus_conversation_url) {
      const existing = await getTavusConversation(session.tavus_conversation_id).catch(() => null);
      const status = String(existing?.status || '').toLowerCase();
      if (existing && !['ended', 'failed', 'error'].includes(status)) {
        const token = mintConciergeToolToken({ email, conversationId: session.tavus_conversation_id, sessionId: session.session_id });
        return Response.json({
          ok: true,
          configured: true,
          resumed: true,
          conversation_url: session.tavus_conversation_url,
          conversation_id: session.tavus_conversation_id,
          concierge_token: token,
        });
      }
    }

    // Cost guard: a bounded number of video actions per customer per day.
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const usedToday = await base44.asServiceRole.entities.ConciergeAction
      .count({ customer_email: email, channel: 'video', created_at: { $gte: dayStart.toISOString() } })
      .catch(() => 0);
    if (Number(usedToday || 0) >= DAILY_VIDEO_ACTION_LIMIT) {
      return Response.json({
        ok: false,
        configured: true,
        limit_reached: true,
        message: 'The video concierge has reached its limit for today. The text concierge still works.',
      }, { status: 429 });
    }

    const firstName = String(auth.actor.full_name || '').split(' ')[0] || 'there';
    const payload: Record<string, any> = {
      conversation_name: `Arriv Preferred Concierge — ${new Date().toISOString().slice(0, 10)}`,
      custom_greeting: `Hi ${firstName}, how are you ${timeOfDay()}? How can I help you?`,
      conversational_context: `You are the Arriv Preferred Concierge speaking with ${firstName}, an Arriv Preferred member using the Arriv Estate Media customer portal. Use the concierge tools for every account question or action. Never state a price, balance, booking or payment that a tool did not return. Paid bookings, publishing and payments are completed by the customer in the portal itself.`,
      properties: {
        max_call_duration: 900,
        participant_left_timeout: 120,
        participant_absent_timeout: 120,
      },
    };
    if (palId) payload.pal_id = palId;
    if (replicaId) payload.replica_id = replicaId;

    const response = await fetch('https://tavusapi.com/v2/conversations', {
      method: 'POST',
      headers: { 'x-api-key': apiKey as string, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.conversation_url) {
      const reason = String(data?.message || data?.error || `Tavus returned ${response.status}`);
      return Response.json({
        ok: false,
        configured: true,
        message: 'The video concierge could not start. Your portal and the text concierge are unaffected.',
        error: reason,
      }, { status: 502 });
    }

    await base44.asServiceRole.entities.ConciergeSession.update(session.id, {
      mode: 'video',
      tavus_conversation_id: data.conversation_id || '',
      tavus_conversation_url: data.conversation_url,
      tavus_started_at: new Date().toISOString(),
      tavus_ended_at: '',
      last_active_at: new Date().toISOString(),
    });

    const token = mintConciergeToolToken({
      email,
      conversationId: data.conversation_id || '',
      sessionId: session.session_id,
    });

    return Response.json({
      ok: true,
      configured: true,
      conversation_url: data.conversation_url,
      conversation_id: data.conversation_id || '',
      concierge_token: token,
      max_call_duration: payload.properties.max_call_duration,
    });
  } catch (error: any) {
    console.error('conciergeTavusSession error:', error);
    return Response.json({ ok: false, configured: true, message: 'The video concierge is unavailable right now.', error: String(error?.message || error) }, { status: 502 });
  }
}
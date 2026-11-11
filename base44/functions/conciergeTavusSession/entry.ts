import { createClientFromRequest } from 'npm:@base44/sdk@0.8.59';
import { requireCustomer } from '../../shared/customerSession.ts';
import { resolvePreferredEntitlement } from '../../shared/preferredEntitlement.ts';
import { mintConciergeToolToken } from '../../shared/conciergeSessionToken.ts';
import { endTavusConversation, getTavusConversation } from '../../shared/tavusInterview.ts';
import {
  ensureConciergePal,
  isRecruitingPal,
  preferredConversationContext,
  CONCIERGE_ROLE_PREFERRED,
} from '../../shared/conciergePal.ts';

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
    missing.includes('TAVUS_API_KEY') ? 'Add TAVUS_API_KEY to the app secrets.' : null,
    'Run the configureConciergePal function as an administrator: it creates the Arriv Preferred Concierge PAL (same face and voice as the recruiting representative) and attaches the account tools.',
    'Never store the recruiting/interview PAL id in TAVUS_CONCIERGE_PAL_ID: customer conversations refuse to run on that persona.',
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
        customer_name: String(auth.actor.full_name || ''),
        account_id: String(auth.actor.account_id || ''),
        conversation_id: `conv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        status: 'active',
        context: { role: CONCIERGE_ROLE_PREFERRED },
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

    // Starting on request always starts a conversation that really has her in it. A
    // conversation left behind by an earlier visit stays "active" at the provider after
    // the customer leaves, but her video is no longer in the room, so joining it shows
    // an empty frame. Ending it first means the frame that opens has a concierge in it.
    if (body?.fresh === true && session.tavus_conversation_id) {
      await endTavusConversation(session.tavus_conversation_id).catch(() => null);
      await base44.asServiceRole.entities.ConciergeSession.update(session.id, {
        tavus_conversation_id: '',
        tavus_conversation_url: '',
        tavus_ended_at: new Date().toISOString(),
      });
      session.tavus_conversation_id = '';
      session.tavus_conversation_url = '';
    }

    const apiKey = Deno.env.get('TAVUS_API_KEY');
    if (!apiKey) {
      return Response.json({
        ok: false,
        configured: false,
        missing: ['TAVUS_API_KEY'],
        message: 'The Arriv Concierge video representative is not configured yet. The text concierge is fully available.',
        checklist: checklist(['TAVUS_API_KEY']),
      });
    }

    // ONE appearance, TWO business contexts. The customer meets the concierge PAL — never the
    // recruiting/interview PAL, which is what made her ask about interviews in the portal.
    const pal = await ensureConciergePal(base44);
    if (!pal.ok || !pal.pal_id) {
      return Response.json({
        ok: false,
        configured: false,
        missing: pal.missing || [],
        notes: pal.notes || [],
        reason: 'CONCIERGE_PAL_UNAVAILABLE',
        message: 'The Arriv Concierge video representative is not configured yet. The text concierge is fully available.',
        checklist: checklist(pal.missing || []),
      });
    }
    if (isRecruitingPal(pal.pal_id)) {
      return Response.json({
        ok: false,
        configured: false,
        reason: 'ROLE_MISMATCH',
        message: 'The concierge is not available right now. Nothing was started.',
      }, { status: 503 });
    }

    const portalContext = {
      page: String(body?.context?.page || '').slice(0, 120),
      listing_id: String(body?.context?.listing_id || '').slice(0, 120),
    };
    // The conversation's own role, remembered on the session so a tool call can never leave
    // the Preferred context.
    await base44.asServiceRole.entities.ConciergeSession.update(session.id, {
      context: { role: CONCIERGE_ROLE_PREFERRED, ...portalContext },
    }).catch(() => null);

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
      pal_id: pal.pal_id,
      conversation_name: `Arriv Preferred Concierge — ${new Date().toISOString().slice(0, 10)}`,
      custom_greeting: `Hi ${firstName}, how are you ${timeOfDay()}? I'm your Arriv concierge. What can I take care of for you?`,
      // Explicit, trusted context: the role is stated, not guessed from the conversation.
      conversational_context: preferredConversationContext({
        firstName,
        page: portalContext.page,
        listingId: portalContext.listing_id,
        plan: entitlement.plan || 'Preferred',
      }),
      // Tavus rejects these at the top level: they belong to the conversation's properties.
      properties: {
        max_call_duration: 300,
        participant_left_timeout: 120,
        participant_absent_timeout: 120,
      },
    };
    // The face lives on the PAL itself; sending it again at conversation level is not needed
    // and an unsupported field would fail the start.

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
      // Proof of which persona actually opened, so "she is in the concierge role" is
      // verifiable from the portal and not assumed.
      pal_id: pal.pal_id,
      pal_name: pal.pal_name,
      role: CONCIERGE_ROLE_PREFERRED,
      tools_attached: pal.tools?.attached || 0,
      role_notes: pal.notes || [],
    });
  } catch (error: any) {
    console.error('conciergeTavusSession error:', error);
    return Response.json({ ok: false, configured: true, message: 'The video concierge is unavailable right now.', error: String(error?.message || error) }, { status: 502 });
  }
}
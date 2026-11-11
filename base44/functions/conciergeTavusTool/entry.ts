import { createClientFromRequest } from 'npm:@base44/sdk@0.8.59';
import { resolvePreferredEntitlement } from '../../shared/preferredEntitlement.ts';
import { verifyConciergeToolToken, readConciergeToken } from '../../shared/conciergeSessionToken.ts';
import { requireCustomer } from '../../shared/customerSession.ts';
import { runConciergeAction, isKnownAction } from '../../shared/conciergeActions.ts';

/**
 * Tool callback for the Tavus video concierge.
 *
 * This is the ONLY bridge between the video representative and the account. It runs the
 * very same action engine as the text concierge, for the customer bound to that
 * conversation when the session was created — a conversation id or a tool argument can
 * never be used to act for someone else.
 *
 * Consequential actions come back as `pending_confirmation`: the representative relays
 * the details and the customer confirms in the portal. Nothing is charged here.
 */

function rowsOf(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

function normaliseToolInput(raw: any) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? raw : {};
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Two legitimate callers:
    //   * Tavus itself, server-to-server, authenticated with the shared tool secret.
    //   * Our own portal, when the representative's app tool hands the call to the browser
    //     for the signed-in customer, authenticated with that customer's own session.
    // Either way the account is re-derived from the conversation, never from the request.
    const sharedSecret = Deno.env.get('TAVUS_TOOL_SECRET');
    const provided = req.headers.get('x-arriv-tool-secret') || '';
    const fromTavus = !!sharedSecret && provided === sharedSecret;

    const tokenPayload = verifyConciergeToolToken(readConciergeToken(req, body));
    const conversationId = String(body?.conversation_id || tokenPayload?.convo || '').trim();
    if (!conversationId) {
      return Response.json({ ok: false, error: 'A conversation is required.' }, { status: 400 });
    }

    const session = rowsOf(await base44.asServiceRole.entities.ConciergeSession
      .filter({ tavus_conversation_id: conversationId }, { limit: 1 }))[0];
    if (!session?.customer_email) {
      return Response.json({ ok: false, error: 'This conversation is not linked to an Arriv account.' }, { status: 403 });
    }
    if (tokenPayload && String(tokenPayload.email) !== String(session.customer_email)) {
      return Response.json({ ok: false, error: 'Conversation token does not match the session.' }, { status: 403 });
    }

    if (!fromTavus) {
      const auth = await requireCustomer(base44, req, body).catch(() => null);
      const callerEmail = String((auth as any)?.actor?.email || '').toLowerCase();
      if (!callerEmail) {
        return Response.json({ ok: false, error: 'Not authorized.' }, { status: 401 });
      }
      if (callerEmail !== String(session.customer_email).toLowerCase()) {
        return Response.json({ ok: false, error: 'This conversation belongs to another account.' }, { status: 403 });
      }
    }

    const email = String(session.customer_email).toLowerCase();
    const entitlement = await resolvePreferredEntitlement(base44, { email });
    if (!entitlement.active) {
      await base44.asServiceRole.entities.ConciergeSession.update(session.id, {
        tavus_conversation_id: '',
        tavus_conversation_url: '',
        mode: 'text',
      }).catch(() => null);
      return Response.json({
        ok: false,
        reply: 'This membership is no longer active, so I cannot access the account. Nothing was changed.',
        reason: 'PREFERRED_REQUIRED',
      }, { status: 403 });
    }

    const name = String(body?.tool_name || body?.action || body?.name || '').trim();
    if (!isKnownAction(name)) {
      return Response.json({ ok: false, reply: 'I do not have a tool for that request.' }, { status: 400 });
    }

    const input = normaliseToolInput(body?.arguments ?? body?.input ?? body?.parameters);
    const ctx = {
      base44,
      email,
      accountId: session.account_id || '',
      fullName: session.customer_name || '',
      entitlement,
      sessionId: session.session_id,
      channel: 'video' as const,
    };

    const outcome = await runConciergeAction(ctx, name, input, { confirmed: false });

    await base44.asServiceRole.entities.ConciergeAction.create({
      action_id: `cact_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      customer_email: email,
      session_id: session.session_id,
      conversation_id: session.conversation_id,
      channel: 'video',
      action_name: name,
      utterance: String(body?.utterance || 'video request').slice(0, 500),
      mutating: outcome.pending === true,
      status: outcome.pending ? 'awaiting_confirmation' : outcome.ok ? 'executed' : 'failed',
      input,
      result: outcome.data || {},
      ui: outcome.ui || null,
      confirmation_summary: outcome.confirmation_summary || '',
      executed_at: outcome.ok && !outcome.pending ? new Date().toISOString() : undefined,
      error: outcome.ok ? undefined : (outcome.error || 'action_failed'),
      created_at: new Date().toISOString(),
    }).catch(() => null);

    return Response.json({
      ok: outcome.ok === true,
      reply: outcome.speech,
      pending_confirmation: outcome.pending === true,
      confirmation_summary: outcome.confirmation_summary || '',
      data: outcome.data || null,
      // The portal polls its pending actions, so a video request the customer confirms
      // there is the same audited action.
      portal_confirmation_required: outcome.pending === true,
    });
  } catch (error: any) {
    console.error('conciergeTavusTool error:', error);
    return Response.json({ ok: false, reply: 'That request could not be completed.', error: String(error?.message || error) }, { status: 500 });
  }
}
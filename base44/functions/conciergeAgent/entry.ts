import { createClientFromRequest } from 'npm:@base44/sdk@0.8.59';
import { createHash } from 'node:crypto';
import { requireCustomer } from '../../shared/customerSession.ts';
import { resolvePreferredEntitlement } from '../../shared/preferredEntitlement.ts';
import {
  conciergeCatalog,
  isKnownAction,
  actionIsMutating,
  actionRequiresConfirmation,
  runConciergeAction,
} from '../../shared/conciergeActions.ts';

/**
 * The Arriv Preferred Concierge — one entry point for the text interface.
 *
 * Flow:
 *   verified session -> entitlement -> (LLM chooses registered actions) -> the SAME
 *   action engine the Tavus representative calls -> real backend result -> audit row.
 *
 * The model only ever supplies an action NAME and its own input. Identity, ownership,
 * prices, entitlements and membership status are re-derived here.
 */

const MAX_ACTIONS = 3;
const TRANSCRIPT_LIMIT = 24;

function id(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function idempotencyKey(email: string, name: string, input: any) {
  const canonical = JSON.stringify(input || {}, Object.keys(input || {}).sort());
  return createHash('sha256').update(`${email}|${name}|${canonical}`).digest('hex').slice(0, 40);
}

function rowsOf(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

async function loadSession(base44: any, email: string, body: any) {
  const sessionId = String(body?.session_id || '').trim();
  if (sessionId) {
    const existing = rowsOf(await base44.asServiceRole.entities.ConciergeSession
      .filter({ session_id: sessionId, customer_email: email }, { limit: 1 }))[0];
    if (existing) return existing;
  }
  const conversationId = String(body?.conversation_id || '').trim() || id('conv');
  const created = await base44.asServiceRole.entities.ConciergeSession.create({
    session_id: id('cses'),
    customer_email: email,
    conversation_id: conversationId,
    status: 'active',
    mode: body?.channel === 'video' ? 'video' : 'text',
    transcript: [],
    preferences: {},
    last_active_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
  return created;
}

function buildPrompt(ctx: any, entitlement: any, snapshot: any, pageContext: any) {
  const catalog = conciergeCatalog();
  return `You are the Arriv Concierge, the private assistant of an Arriv Estate Media Preferred member.

CUSTOMER
Name: ${ctx.fullName || 'the member'}
Membership: ${entitlement.plan || 'Preferred'} (${entitlement.status || 'active'})
Current portal page: ${pageContext?.page || 'unknown'}
Selected property: ${pageContext?.listing_id || 'none'}

ACCOUNT SNAPSHOT (real data, already authorized for this customer)
${JSON.stringify(snapshot).slice(0, 3000)}

AVAILABLE ACTIONS
${JSON.stringify(catalog).slice(0, 6000)}

HOW TO ANSWER
- Choose 0 to ${MAX_ACTIONS} actions that actually answer the request. Prefer the smallest set.
- Only use action names from the list. Only pass inputs the action's schema allows.
- Never invent a record id, address, price, invoice or membership fact. Use values from the snapshot or the customer's own words.
- If the customer wants to see or change something, choose the action; the system renders the real result on screen, so you do not need to describe the data yourself.
- If a request is unclear or you need one detail (which property, which date), choose no action and ask one short question.
- Never claim a payment, booking, publication or subscription change has happened. Those need the customer's confirmation or the secure form.
- Reply in at most 45 words, warm and precise, no emoji, no markdown.

Return JSON: { "reply": string, "actions": [ { "name": string, "input": object } ] }`;
}

function summarize(outcomes: any[]) {
  const spoken = outcomes
    .map((item) => item.outcome?.speech)
    .filter((text: string) => typeof text === 'string' && text.trim());
  return spoken.join(' ');
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
    const entitlement = await resolvePreferredEntitlement(base44, {
      email,
      accountId: auth.actor.account_id,
    });
    if (!entitlement.active || entitlement.concierge_enabled === false) {
      return Response.json({
        ok: false,
        reason: 'PREFERRED_REQUIRED',
        message: 'The Arriv Concierge is available to Preferred members.',
      }, { status: 403 });
    }

    const utterance = String(body?.utterance || '').trim().slice(0, 1200);
    if (!utterance) {
      return Response.json({ ok: false, error: 'An instruction is required.' }, { status: 400 });
    }

    const session = await loadSession(base44, email, body);
    const channel = body?.channel === 'video' ? 'video' : 'text';
    const pageContext = {
      page: String(body?.context?.page || '').slice(0, 120),
      listing_id: String(body?.context?.listing_id || '').slice(0, 120),
      job_id: String(body?.context?.job_id || '').slice(0, 120),
    };

    const ctx = {
      base44,
      email,
      accountId: auth.actor.account_id,
      fullName: auth.actor.full_name || '',
      entitlement,
      sessionId: session.session_id,
      channel,
    };

    // Real account context for the planner. Read-only; nothing is written by this call.
    const overview = await runConciergeAction(ctx, 'get_account_overview', {});
    const snapshot = overview.ok ? overview.data : { note: 'Account summary unavailable.' };

    const llm = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: buildPrompt(ctx, entitlement, snapshot, pageContext),
      response_json_schema: {
        type: 'object',
        properties: {
          reply: { type: 'string' },
          actions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                input: { type: 'object' },
              },
            },
          },
        },
        required: ['reply'],
      },
    }).catch(() => null);

    const requested = Array.isArray(llm?.actions) ? llm.actions.slice(0, MAX_ACTIONS) : [];
    const outcomes: any[] = [];
    let preferencePatch: any = null;
    let pendingAction: any = null;
    let uiDirective: any = null;

    for (const requestedAction of requested) {
      const name = String(requestedAction?.name || '');
      if (!isKnownAction(name)) continue;
      const input = requestedAction?.input && typeof requestedAction.input === 'object' ? requestedAction.input : {};
      const mutating = actionIsMutating(name);
      const needsConfirmation = actionRequiresConfirmation(name);

      // A consequential action is never executed from an instruction alone.
      if (needsConfirmation) {
        const actionId = id('cact');
        await base44.asServiceRole.entities.ConciergeAction.create({
          action_id: actionId,
          customer_email: email,
          session_id: session.session_id,
          conversation_id: session.conversation_id,
          channel,
          action_name: name,
          utterance,
          mutating: true,
          status: 'awaiting_confirmation',
          input,
          idempotency_key: idempotencyKey(email, name, input),
          created_at: new Date().toISOString(),
        });
        const preview = await runConciergeAction(ctx, name, input, { confirmed: false });
        if (!preview.ok) {
          await base44.asServiceRole.entities.ConciergeAction.update(actionId, {
            status: 'failed',
            error: preview.error || 'preview_failed',
          });
          outcomes.push({ name, outcome: preview });
          continue;
        }
        await base44.asServiceRole.entities.ConciergeAction.update(actionId, {
          result: preview.data || {},
          confirmation_summary: preview.confirmation_summary || preview.speech || '',
        });
        pendingAction = {
          action_record_id: actionId,
          action_name: name,
          summary: preview.confirmation_summary || preview.speech || '',
          speech: preview.speech || '',
          data: preview.data || {},
        };
        outcomes.push({ name, outcome: preview });
        continue;
      }

      // A repeat of the same consequential request that already executed must not run twice.
      const key = idempotencyKey(email, name, input);
      if (mutating) {
        const duplicate = rowsOf(await base44.asServiceRole.entities.ConciergeAction
          .filter({ customer_email: email, idempotency_key: key, status: 'executed' }, { sort: '-created_at', limit: 1 }))[0];
        if (duplicate) {
          outcomes.push({
            name,
            outcome: {
              ok: true,
              speech: 'That was already done a moment ago, so I have not repeated it.',
              data: duplicate.result || {},
              duplicate: true,
            },
          });
          continue;
        }
      }

      const outcome = await runConciergeAction(ctx, name, input, { confirmed: !needsConfirmation });
      const actionId = id('cact');
      await base44.asServiceRole.entities.ConciergeAction.create({
        action_id: actionId,
        customer_email: email,
        session_id: session.session_id,
        conversation_id: session.conversation_id,
        channel,
        action_name: name,
        utterance,
        mutating,
        status: outcome.ok ? 'executed' : 'failed',
        input,
        result: outcome.data || {},
        ui: outcome.ui || null,
        idempotency_key: key,
        executed_at: outcome.ok ? new Date().toISOString() : undefined,
        error: outcome.ok ? undefined : (outcome.error || 'action_failed'),
        created_at: new Date().toISOString(),
      });
      if (outcome.preference_patch) preferencePatch = { ...(preferencePatch || {}), ...outcome.preference_patch };
      if (outcome.ui && !uiDirective) uiDirective = outcome.ui;
      outcomes.push({ name, outcome });
    }

    const actionSpeech = summarize(outcomes);
    const reply = actionSpeech
      || (typeof llm?.reply === 'string' && llm.reply.trim() ? llm.reply.trim() : 'I can help with bookings, galleries, property pages, billing and marketing. What would you like to do?');

    const history = Array.isArray(session.transcript) ? session.transcript.slice(-TRANSCRIPT_LIMIT) : [];
    history.push({ role: 'customer', text: utterance, at: new Date().toISOString() });
    history.push({ role: 'concierge', text: reply, at: new Date().toISOString() });

    await base44.asServiceRole.entities.ConciergeSession.update(session.id, {
      status: 'active',
      mode: channel,
      context: pageContext,
      transcript: history.slice(-TRANSCRIPT_LIMIT),
      preferences: { ...(session.preferences || {}), ...(preferencePatch || {}) },
      last_active_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return Response.json({
      ok: true,
      session_id: session.session_id,
      conversation_id: session.conversation_id,
      reply,
      pending_action: pendingAction,
      ui: uiDirective,
      actions: outcomes.map((item) => ({
        name: item.name,
        ok: item.outcome?.ok === true,
        speech: item.outcome?.speech || '',
        data: item.outcome?.data || null,
        ui: item.outcome?.ui || null,
        duplicate: item.outcome?.duplicate === true,
        error: item.outcome?.error || null,
      })),
    });
  } catch (error: any) {
    console.error('conciergeAgent error:', error);
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
}
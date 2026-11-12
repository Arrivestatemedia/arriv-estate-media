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

/** Actions that answer with a general summary instead of opening the screen that was asked for. */
const SUMMARY_ONLY = new Set(['get_account_overview', 'get_preferred_savings', 'get_visibility_summary']);

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

/**
 * The whole action list. It used to be cut off at 6,000 characters, which hid most of what she
 * can actually do — including cancelling a membership, opening a property page and analytics —
 * so she answered real requests with whatever the visible few actions could produce.
 */
function catalogText() {
  const compact = conciergeCatalog().map((action: any) => ({
    name: action.name,
    description: action.description,
    ...(action.input_schema && Object.keys(action.input_schema.properties || {}).length
      ? { input_schema: action.input_schema }
      : {}),
    ...(action.mutating ? { mutating: true } : {}),
    ...(action.confirmation_required ? { confirmation_required: true } : {}),
  }));
  return JSON.stringify(compact);
}

/**
 * Only what the member said, oldest first. Her own earlier sentences are deliberately left out:
 * fed back in, she answered a new request by defending something she had said in an old one
 * (a booking request came back as an apology about a cancellation that was never mentioned).
 * The member's own words are what a follow-up ("that one", "cancel it") refers to.
 */
function recentTurns(history: any[]) {
  const turns = (Array.isArray(history) ? history : [])
    .filter((entry: any) => String(entry?.role || '') === 'customer')
    .slice(-4)
    .map((entry: any) => `- ${String(entry?.text || '').slice(0, 240)}`)
    .filter((line: string) => line.trim().length > 3);
  return turns.length ? turns.join('\n') : 'This is the start of the conversation.';
}

function buildPrompt(ctx: any, entitlement: any, snapshot: any, pageContext: any, history: any[], utterance: string) {
  return `You are the Arriv Concierge, the private assistant of an Arriv Estate Media Preferred member.

CUSTOMER
Name: ${ctx.fullName || 'the member'}
Membership: ${entitlement.plan || 'Preferred'} (${entitlement.status || 'active'})
Current portal page: ${pageContext?.page || 'unknown'}
Selected property: ${pageContext?.listing_id || 'none'}

EARLIER REQUESTS FROM THE MEMBER (oldest first — only for what "it" or "that one" refers to)
${recentTurns(history)}

ACCOUNT SNAPSHOT (real data, already authorized for this customer)
${JSON.stringify(snapshot).slice(0, 3000)}

AVAILABLE ACTIONS (the complete list — read all of it)
${catalogText().slice(0, 30000)}

HOW TO ANSWER
- Answer THE REQUEST TO ANSWER NOW, and nothing else. The earlier requests are there only to explain a pronoun; never apologise for, retract, defend or continue an earlier exchange.
- Never mention a cancellation, a misunderstanding, or a request you filed before unless THE REQUEST TO ANSWER NOW is about it.
- Choose 0 to ${MAX_ACTIONS} actions that actually answer the request. Prefer the smallest set.
- Only use action names from the list. Only pass inputs the action's schema allows.
- Never invent a record id, address, price, invoice or membership fact. Use values from the snapshot or the customer's own words.
- If the customer wants to see or change something, choose the action; the system renders the real result on screen, so you do not need to describe the data yourself.
- A question about what is on a screen (bookings, property pages, galleries, invoices, wallet, analytics) counts as asking to see it: choose that screen's action and answer briefly.
- If a request is unclear or you need one detail (which property, which date), choose no action and ask one short question.
- Never claim a payment, booking, publication or subscription change has happened. Those need the customer's confirmation or the secure form.
- If the customer asks to cancel or stop their Preferred membership, use request_membership_cancellation. It alerts their advisor and files the request; it never cancels anything, so say the team will process it and reach out. Never say the membership is cancelled.
- Reply to the request that was actually made, in your own words. Use the recent conversation: a short follow-up ("cancel it", "that one", "yes") refers to what was just discussed.
- Reply in at most 45 words, warm and precise, no emoji, no markdown.

THE COMPANY NAME
The company is Arriv, pronounced exactly like the English word "Arrive". Say it that way every time.

FORMS AND DETAILS
- When the customer wants to book a shoot, call open_booking_form immediately. When they want a property page, call create_property_page immediately. Never interview them in chat for details the form itself collects.
- Carry everything they have already said: the property address goes in "address", a date in "date" (YYYY-MM-DD), a package in "package_id".
- When they give you the address (or date, or package) after a form is already open, call that same action again with the value so the open form arrives filled in, and say in one line that you put it in the form.
- Any street address the customer says is the property they mean.

THE REQUEST TO ANSWER NOW
"${String(utterance || '').slice(0, 600)}"

Return JSON: { "reply": string, "actions": [ { "name": string, "input": object } ] }`;
}

/**
 * A member asking to SEE something must always get that window, whatever the planner picked.
 * The Tavus representative calls one tool per request; in text the planner sometimes answers
 * with a general summary instead of the screen that was asked for, so the intent is resolved
 * here and the matching action runs.
 */
// Any mention of what a screen holds is enough — a question ("what's on?") and a request
// ("show me") resolve the same way, because both are answered by opening that screen.
const VIEW_INTENTS: Array<[string, RegExp]> = [
  ['show_analytics', /\b(analytics?|performance|performing|traffic|insights?|stats?|statistics|views?|reports?|dashboard|leads? (this|last)\b)\b/i],
  ['list_invoices', /\b(invoices?|billing|bills?|receipts?|owe|due|outstanding|charged?)\b/i],
  ['get_payment_summary', /\b(wallet|auto-?fund|prepaid|credits?|payment summary|balance)\b/i],
  ['list_galleries', /\b(galleries|gallery|photos?|images?|pictures?|footage|downloads?|media|shots?)\b/i],
  ['list_properties', /\b(propert(y|ies)|listings?|listing pages?|mvp pages?)\b/i],
  ['list_bookings', /\b(bookings?|appointments?|shoots?|calendar|scheduled|upcoming)\b/i],
];

/** An instruction to change something is never turned into a "just show me" window. */
const ACTION_VERB = /\b(cancel|reschedul(e|ing)|book|rebook|add|create|delete|remove|update|change|pause|resume|publish|unpublish|promote|pay|send|request|switch|turn)\b/i;

/** A plain instruction to end the membership. Resolved here so it can never become a summary. */
const MEMBERSHIP_CANCELLATION = /\b(cancel|cancelling|canceling|end|stop|quit|terminate|close)\b\s+(?:my\s+|the\s+|our\s+|this\s+|that\s+)?(?:preferred\s+)?(?:membership|member\s?ship|subscription|plan)\b|\b(?:my\s+|the\s+|our\s+)?(?:preferred\s+)?(?:membership|subscription)\b[\s\S]{0,40}\b(cancel|cancelled|canceling|cancelling|ended|terminated|closed)\b/i;

function resolveViewIntent(utterance: string) {
  const text = String(utterance || '');
  if (ACTION_VERB.test(text)) return '';
  for (const [action, pattern] of VIEW_INTENTS) {
    if (pattern.test(text)) return action;
  }
  return '';
}

function inputForView(action: string, pageContext: any) {
  if (action === 'show_analytics' && pageContext?.listing_id) return { listing_id: pageContext.listing_id };
  return {};
}

/** The street address the customer just said, so a form they are filling can carry it. */
const STREET_ADDRESS = /\b\d{1,6}[A-Za-z]?\s+[A-Za-z0-9.'’\-]+(?:\s+[A-Za-z0-9.'’\-]+){0,7}?\s(?:street|st\.?|avenue|ave\.?|road|rd\.?|drive|dr\.?|lane|ln\.?|court|ct\.?|circle|cir\.?|boulevard|blvd\.?|place|pl\.?|terrace|ter\.?|parkway|pkwy\.?|highway|hwy\.?|trail|trl\.?|way)\b(?:\.|,)?(?:\s*,?\s*[A-Za-z][A-Za-z .'\-]{1,28})?(?:\s*,?\s*[A-Z]{2})?(?:\s+\d{5})?/i;

function extractAddress(text: string): string {
  const match = String(text || '').match(STREET_ADDRESS);
  if (!match) return '';
  return match[0]
    .replace(/\s+/g, ' ')
    // Plain speech around the address is not part of it.
    .replace(/\b(please|thanks|thank you|okay|ok|for me|today)\b\.?\s*$/i, '')
    .replace(/[\s,]+$/, '')
    .trim()
    .slice(0, 120);
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
      surface: String(body?.context?.surface || '').slice(0, 60),
    };

    const ctx = {
      base44,
      email,
      accountId: auth.actor.account_id,
      fullName: auth.actor.full_name || '',
      entitlement,
      sessionId: session.session_id,
      channel,
      // The same live screen context the video representative gets, so "this listing" or
      // "these photos" resolves against what the member has open.
      pageContext,
    };

    // Real account context for the planner. Read-only; nothing is written by this call.
    const overview = await runConciergeAction(ctx, 'get_account_overview', {});
    const snapshot = overview.ok ? overview.data : { note: 'Account summary unavailable.' };

    const priorTranscript = Array.isArray(session.transcript) ? session.transcript : [];
    const llm = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: buildPrompt(ctx, entitlement, snapshot, pageContext, priorTranscript, utterance),
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

    const planned = Array.isArray(llm?.actions) ? llm.actions.slice(0, MAX_ACTIONS) : [];
    // A plain request to see something always opens that screen: the planner never gets to
    // answer it with a general account summary, and a request to change something is left alone.
    const plannedNames = planned.map((item: any) => String(item?.name || ''));
    const viewIntent = resolveViewIntent(utterance);
    // Only a summary the planner reached for on its own is replaced: any action it picked on
    // purpose (a view, a display change, a real change) is left exactly as chosen.
    const mustOpen = Boolean(viewIntent)
      && !plannedNames.includes(viewIntent)
      && !plannedNames.some((name: string) => actionIsMutating(name))
      && plannedNames.every((name: string) => SUMMARY_ONLY.has(name));

    // Ending the membership is always the cancellation request, never a summary of the account.
    // A plain instruction resolves here so the member is never answered with their invoice count.
    // "Don't cancel my membership" is not a request to cancel it.
    const declinedCancellation = /\b(don'?t|do not|not|never)\b[^.!?]{0,25}\b(cancel|cancelling|canceling|end|quit|terminate|close)\b/i.test(utterance);
    const cancellationIntent = !declinedCancellation && MEMBERSHIP_CANCELLATION.test(utterance);
    const wantsCancellation = cancellationIntent
      && !plannedNames.includes('request_membership_cancellation');

    // She only files a membership cancellation when the member actually asked for one. A planner
    // that is still thinking about an older topic can never file it out of a request like a booking.
    const plannedSafe = planned.filter((item: any) =>
      String(item?.name || '') !== 'request_membership_cancellation' || cancellationIntent);

    const requested: any[] = wantsCancellation
      ? [{ name: 'request_membership_cancellation', input: { reason: utterance.slice(0, 300) } }]
      : mustOpen
        ? [{ name: viewIntent, input: inputForView(viewIntent, pageContext) }]
        : plannedSafe;

    // She asked for the address and the member gave it. The form opens with it, even when the
    // planner answered in words only, so nobody has to say "nothing happened" to be served.
    const lastConciergeTurn = [...(Array.isArray(session.transcript) ? session.transcript : [])]
      .reverse()
      .find((entry: any) => String(entry?.role || '') === 'concierge');
    const lastConciergeText = String(lastConciergeTurn?.text || '');
    const saidAddress = extractAddress(utterance);
    if (!requested.length && saidAddress && /\baddress\b/i.test(lastConciergeText)) {
      const wantsPage = /property page|listing page|new page|web page/i.test(lastConciergeText);
      requested.push({
        name: wantsPage ? 'create_property_page' : 'open_booking_form',
        input: { address: saidAddress },
      });
    }

    const outcomes: any[] = [];
    let preferencePatch: any = null;
    let pendingAction: any = null;
    let uiDirective: any = null;

    for (const requestedAction of requested) {
      const name = String(requestedAction?.name || '');
      if (!isKnownAction(name)) continue;
      const input = requestedAction?.input && typeof requestedAction.input === 'object' ? requestedAction.input : {};
      // The address the member just said belongs in the form they are filling, even when the
      // planner left it out of the action input.
      if (['open_booking_form', 'create_property_page'].includes(name) && !String(input?.address || '').trim()) {
        const told = extractAddress(utterance);
        if (told) input.address = told;
      }
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

    // A question about a screen is answered by that screen. If the planner answered in words
    // only, the matching window still opens; the spoken reply it wrote is left as it is.
    if (viewIntent && !uiDirective && !pendingAction
      && !outcomes.some((item: any) => actionIsMutating(item.name))
      && !outcomes.some((item: any) => item.name === viewIntent)) {
      const opener = await runConciergeAction(ctx, viewIntent, inputForView(viewIntent, pageContext), { confirmed: true });
      if (opener?.ui) uiDirective = opener.ui;
    }

    const actionSpeech = summarize(outcomes);
    const spokenReply = typeof llm?.reply === 'string' ? llm.reply.trim() : '';
    // What actually ran is what answers the member. Her own sentence is only used when nothing
    // ran (a question, one clarification), so a reply can never describe a different request —
    // which is exactly how "I'd like to book" once came back as an apology about a cancellation.
    const reply = actionSpeech
      || spokenReply
      || 'I can help with bookings, galleries, property pages, billing and marketing. What would you like to do?';

    const history = priorTranscript.slice(-TRANSCRIPT_LIMIT);
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
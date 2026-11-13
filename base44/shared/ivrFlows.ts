/**
 * Call center flows for callers who are NOT in a protected active-job route.
 *
 * The protected routes (authorised owner dial-out, media specialist with an active
 * job, client with an active job) are handled by twilioVoiceHandler before this
 * module is ever reached. This module builds only the newer experiences:
 *
 *   media specialist  greeting → spoken request → support overflow / callback / voicemail
 *   client            greeting → Media Partner / technical support / portal guidance
 *   public            press 1 sales ring group (primary → cell → owner → Ashley)
 *                     press 2 technical support voicemail
 *
 * Nothing here invents a price, an availability slot or a confirmation: every
 * spoken answer is either a real record created now, or a clear statement of the
 * next step.
 */

import {
  twiml,
  say,
  gatherSpeech,
  gatherDigits,
  dialSimultaneous,
  recordVoicemail,
  redirect,
  hangup,
  functionUrl,
  companyCallerId,
} from './ivrTwiml.ts';
import {
  greeting,
  personalGreeting,
  ownerCallerId,
  supportDestination,
  ownerFallbackNumber,
  stageNumbers,
  stageTimeout,
  eligibleReps,
} from './callCenterSettings.ts';
import { classifySpokenRequest, fallbackMenuFor, intentToDigit } from './ivrIntent.ts';
import { normalizeE164, displayNumber } from './phoneNumber.ts';
import {
  trackCall,
  createCallbackOnce,
  createVoicemailOnce,
  notifyOwner,
  outcomeForDial,
} from './callCenterStore.ts';
import type { CallerIdentity } from './callerRecognition.ts';

export interface FlowContext {
  base44: any;
  settings: any;
  identity: CallerIdentity;
  from: string;
  to: string;
  callSid: string;
  digits: string;
  speech: string;
  dialStatus: string;
  menu: string;
  tried: string[];
}

type SpeechContext = 'media_specialist' | 'client' | 'public';

function action(menu: string, extra: Record<string, string> = {}): string {
  return functionUrl('twilioVoiceHandler', { menu, ...extra });
}

function triedParam(numbers: string[]): string {
  return numbers.filter(Boolean).join(',');
}

async function note(ctx: FlowContext, patch: Record<string, any>) {
  try {
    return await trackCall(
      ctx.base44,
      ctx.callSid,
      { from: ctx.from, to: ctx.to, caller: ctx.identity },
      patch as any
    );
  } catch (error) {
    console.error('Call tracking failed:', (error as Error).message);
    return null;
  }
}

/* ───────────────────────────── Support overflow ───────────────────────────── */

function supportOverflowInner(ctx: FlowContext): string {
  const callbackEnabled = ctx.settings?.callback_enabled !== false;
  const voicemailEnabled = ctx.settings?.voicemail_enabled !== false;

  if (!callbackEnabled && !voicemailEnabled) {
    return (
      say('Thank you for calling Arrive. Please call us back shortly and we will help you right away.') + hangup()
    );
  }

  return gatherDigits({
    action: action('sup'),
    text: greeting(ctx.settings, 'support_overflow'),
    timeout: 8,
  });
}

function supportOverflowMenu(ctx: FlowContext): Response {
  return twiml(supportOverflowInner(ctx));
}

function voicemailPrompt(ctx: FlowContext, category: string, text: string, maxLength = 130): Response {
  return twiml(
    recordVoicemail({
      action: action('vm_done', { cat: category }),
      text,
      maxLength,
    }) +
      say('We did not receive a message. Please call us back shortly. Goodbye.') +
      hangup()
  );
}

function technicalVoicemail(ctx: FlowContext): Response {
  if (ctx.settings?.voicemail_enabled === false) {
    return twiml(
      say(
        'Sorry for the issues you are experiencing. Our team will reach out as soon as possible. Please try us again shortly.'
      ) + hangup()
    );
  }
  return voicemailPrompt(ctx, 'technical_support', greeting(ctx.settings, 'technical_message'), 150);
}

/* ───────────────────────────── Election helpers ───────────────────────────── */

function speechOrDigit(ctx: FlowContext, context: SpeechContext): string {
  if (ctx.digits) return String(ctx.digits).trim();
  if (!ctx.speech) return '';
  return intentToDigit(classifySpokenRequest(ctx.speech, context), context);
}

/* ──────────────────────────────── Client menu ─────────────────────────────── */

function advisorNumbers(ctx: FlowContext): string[] {
  const advisor = ctx.identity.advisor;
  if (!advisor) return [];
  return [...new Set([advisor.primary_number, advisor.cell_number].filter(Boolean))];
}

/** Configurable sales fallback when a client has no assigned Media Partner. */
function salesFallbackNumbers(ctx: FlowContext): string[] {
  const reps = eligibleReps(ctx.settings)
    .map((rep: any) => normalizeE164(rep.primary_number))
    .filter(Boolean);
  return [...new Set([...reps, ownerFallbackNumber(ctx.settings)].filter(Boolean))].slice(0, 4);
}

async function dialAdvisor(ctx: FlowContext): Promise<Response> {
  const callerId = companyCallerId(ownerCallerId(ctx.settings));

  if (!advisorNumbers(ctx).length) {
    const fallback = salesFallbackNumbers(ctx);
    await note(ctx, { route: 'client_menu', stage: 'advisor_fallback', event: 'advisor_not_assigned' });
    if (!fallback.length) return supportOverflowMenu(ctx);
    return twiml(
      say('I do not have a Media Partner assigned to your account, so I am connecting you with our team.') +
        dialSimultaneous({
          numbers: fallback,
          callerId,
          timeout: 25,
          action: action('cl_adv_done'),
        })
    );
  }

  await note(ctx, { route: 'client_menu', stage: 'advisor_dial', event: 'transfer_to_advisor' });

  return twiml(
    say('Connecting you with your Media Partner. Please hold.') +
      dialSimultaneous({
        numbers: advisorNumbers(ctx),
        callerId,
        timeout: 30,
        action: action('cl_adv_done'),
      })
  );
}

async function dialTechnicalSupport(ctx: FlowContext): Promise<Response> {
  const destination = supportDestination(ctx.settings);
  const callerId = companyCallerId(ownerCallerId(ctx.settings));
  await note(ctx, { route: 'client_menu', stage: 'technical_dial', event: 'transfer_to_support' });

  if (!destination) return supportOverflowMenu(ctx);

  return twiml(
    say('Connecting you with technical support. Please hold.') +
      dialSimultaneous({
        numbers: [destination],
        callerId,
        timeout: 30,
        action: action('cl_tech_done'),
      })
  );
}

function clientFallback(ctx: FlowContext): Response {
  return twiml(
    gatherDigits({
      action: action('cl2'),
      text: fallbackMenuFor('client'),
      timeout: 8,
    })
  );
}

function portalGuidance(ctx: FlowContext): Response {
  return twiml(
    say(
      'You can review and change your booking in the Arriv client portal. Sign in at app dot arrivestatemedia dot com, open My Portal, and your shoot appears under My Dashboard. Nothing on your booking has been changed during this call.'
    ) +
      gatherDigits({
        action: action('cl_help'),
        text: 'To have someone call you back, press 1. To leave a voicemail, press 2.',
        timeout: 8,
      })
  );
}

async function handleClientMenu(ctx: FlowContext): Promise<Response> {
  const choice = speechOrDigit(ctx, 'client');

  if (choice === '1') {
    await note(ctx, { route: 'client_menu', stage: 'advisor', digit: '1', event: 'digit_1' });
    return dialAdvisor(ctx);
  }
  if (choice === '2') {
    await note(ctx, { route: 'client_menu', stage: 'technical', digit: '2', event: 'digit_2' });
    return dialTechnicalSupport(ctx);
  }

  if (!ctx.digits && ctx.speech) {
    const intent = classifySpokenRequest(ctx.speech, 'client');
    if (intent === 'booking_help') {
      await note(ctx, { route: 'client_menu', stage: 'booking_help', event: 'portal_guidance' });
      return portalGuidance(ctx);
    }
    if (intent === 'callback') {
      return createCallbackAndConfirm(ctx, { category: 'support', reason: 'Requested a callback by voice' });
    }
    if (intent === 'sales') {
      await note(ctx, { route: 'client_menu', stage: 'sales', event: 'sales_requested' });
      return beginSalesRing(ctx, []);
    }
  }

  await note(ctx, { route: 'client_menu', stage: 'fallback', event: 'not_understood' });
  return clientFallback(ctx);
}

/* ──────────────────────────── Public / sales ring ─────────────────────────── */

function publicMenu(ctx: FlowContext): Response {
  return twiml(
    gatherDigits({
      action: action('pub'),
      text: greeting(ctx.settings, 'public'),
      timeout: 8,
    })
  );
}

function stageMenuName(index: number): string {
  return `sales_p${index}`;
}

async function beginSalesRing(ctx: FlowContext, tried: string[]): Promise<Response> {
  await note(ctx, { route: 'sales_ring', stage: stageMenuName(1), event: 'sales_stage_started' });
  return salesStage(ctx, 1, tried);
}

async function ashleyOrVoicemail(ctx: FlowContext, tried: string[]): Promise<Response> {
  if (ctx.settings?.ai_booking_enabled === false) {
    return voicemailPrompt(
      ctx,
      'sales',
      'Thank you for calling Arrive Estate Media. No one is available to take your call right now. Please leave a message after the tone and we will call you back.'
    );
  }
  await note(ctx, { route: 'sales_ring', stage: 'ashley', event: 'ashley_handoff' });
  const ashleyUrl = functionUrl('ashleyConcierge', {
    menu: 'start',
    call: ctx.callSid,
    tried: triedParam(tried),
  });
  if (!ashleyUrl) return supportOverflowMenu(ctx);
  return twiml(redirect(ashleyUrl));
}

async function salesStage(ctx: FlowContext, index: number, tried: string[]): Promise<Response> {
  const callerId = companyCallerId(ownerCallerId(ctx.settings));
  const already = [...tried];

  for (let stage = index; stage <= 3; stage += 1) {
    const kind: 'primary' | 'cell' | 'owner' = stage === 1 ? 'primary' : stage === 2 ? 'cell' : 'owner';
    const numbers = stageNumbers(ctx.settings, kind, already);
    if (!numbers.length) continue;

    const next = stage + 1;
    const nextTried = [...already, ...numbers];
    already.push(...numbers);

    await note(ctx, {
      route: 'sales_ring',
      stage: stageMenuName(stage),
      event: 'sales_stage_dial',
    });

    return twiml(
      say(stage === 1 ? 'Thank you. Connecting you with our team.' : 'One moment. Connecting you with our team.') +
        dialSimultaneous({
          numbers,
          callerId,
          timeout: stageTimeout(ctx.settings, kind),
          action: action(stageMenuName(next), { tried: triedParam(nextTried) }),
        })
    );
  }

  return ashleyOrVoicemail(ctx, already);
}

async function handleSalesDialResult(ctx: FlowContext, stageIndex: number): Promise<Response> {
  const status = String(ctx.dialStatus || '').toLowerCase();

  if (status === 'completed') {
    await note(ctx, {
      route: 'sales_ring',
      stage: stageMenuName(stageIndex),
      outcome: 'answered',
      dial_status: status,
      event: 'sales_stage_answered',
    });
    return twiml(say('Thank you for calling Arrive Estate Media. Goodbye.') + hangup());
  }

  await note(ctx, {
    route: 'sales_ring',
    stage: stageMenuName(stageIndex),
    outcome: outcomeForDial(status),
    dial_status: status,
    event: 'sales_stage_result',
  });

  return salesStage(ctx, stageIndex + 1, ctx.tried);
}

/* ──────────────────────────── Callback confirmation ───────────────────────── */

async function createCallbackAndConfirm(
  ctx: FlowContext,
  options: { category: string; reason: string }
): Promise<Response> {
  if (ctx.settings?.callback_enabled === false) return supportOverflowMenu(ctx);

  const advisor = ctx.identity.advisor;
  const assigned =
    ctx.settings?.callback_assignment === 'client_owner' && advisor
      ? { email: advisor.email, name: advisor.name, member_id: advisor.sales_member_id }
      : null;

  let created: any = null;
  try {
    const result = await createCallbackOnce(ctx.base44, {
      callSid: ctx.callSid,
      from: ctx.from,
      to: ctx.to,
      name: ctx.identity.name,
      category: options.category,
      reason: options.reason,
      caller: ctx.identity,
      assigned,
    });
    created = result?.record || null;
  } catch (error) {
    console.error('Callback create failed:', (error as Error).message);
  }

  if (!created) {
    return voicemailPrompt(
      ctx,
      options.category,
      'We could not record your callback request. Please leave a message after the tone and we will call you back.'
    );
  }

  await note(ctx, {
    route: 'callback',
    stage: 'callback_confirmed',
    outcome: 'callback',
    event: 'callback_created',
    extra: { callback_id: created.callback_id },
  });

  await notifyOwner(
    ctx.base44,
    ctx.settings,
    `Arriv callback request: ${created.name || displayNumber(ctx.from)} at ${displayNumber(ctx.from)} (${
      options.category
    }). Open the Call Center to action it.`
  );

  return twiml(
    say(
      'Thank you. Your callback request has been received and our team will call you back. Thank you for calling Arrive Estate Media.'
    ) + hangup()
  );
}

/* ───────────────────────────── Voicemail finalize ─────────────────────────── */

export async function finalizeVoicemail(
  ctx: FlowContext,
  recording: { sid: string; url: string; duration: number; category: string }
): Promise<Response> {
  const category = recording.category || 'general';

  let stored: any = null;
  try {
    const result = await createVoicemailOnce(ctx.base44, {
      callSid: ctx.callSid,
      recordingSid: recording.sid,
      recordingUrl: recording.url,
      duration: recording.duration,
      from: ctx.from,
      to: ctx.to,
      caller: ctx.identity,
      category,
    });
    stored = result?.record || null;
  } catch (error) {
    console.error('Voicemail create failed:', (error as Error).message);
  }

  if (!stored) {
    return twiml(say('We could not save your message. Please call us back shortly. Goodbye.') + hangup());
  }

  await note(ctx, {
    route: 'voicemail',
    stage: 'voicemail_recorded',
    outcome: 'voicemail',
    event: 'voicemail_recorded',
    extra: { voicemail_id: stored.voicemail_id, recording_sid: stored.recording_sid },
  });

  await notifyOwner(
    ctx.base44,
    ctx.settings,
    `Arriv voicemail from ${stored.caller_name || displayNumber(ctx.from)} (${displayNumber(
      ctx.from
    )}) on ${displayNumber(ctx.to)} - ${category.replace(/_/g, ' ')}. Review it in the Call Center.`
  );

  const ticketUrl = functionUrl('ivrSupportTicket', { voicemail: stored.voicemail_id });
  return twiml(
    say('Thank you. Your message has been received and our team will get back with you as soon as possible.') +
      (ticketUrl ? redirect(ticketUrl) : hangup())
  );
}

/* ────────────────────────────── Menu dispatcher ───────────────────────────── */

export async function handleCallCenterMenu(ctx: FlowContext): Promise<Response | null> {
  const menu = String(ctx.menu || '');
  const type = ctx.identity.type;
  const speechContext: SpeechContext =
    type === 'client' || type === 'b2b_client' ? 'client' : type === 'public' ? 'public' : 'media_specialist';

  if (menu === 'sup') {
    if (ctx.settings?.callback_enabled !== false && ctx.digits === '1') {
      return createCallbackAndConfirm(ctx, {
        category: 'support',
        reason: 'Requested a callback from the support menu',
      });
    }
    if (ctx.settings?.voicemail_enabled !== false && ctx.digits === '2') {
      return voicemailPrompt(
        ctx,
        'support',
        'Please leave your name, number and a short message after the tone.'
      );
    }
    return supportOverflowMenu(ctx);
  }

  if (menu === 'sp') {
    const intent = ctx.digits ? '' : classifySpokenRequest(ctx.speech, 'media_specialist');
    await note(ctx, {
      route: 'media_specialist_menu',
      stage: 'response',
      digit: ctx.digits || undefined as any,
      event: 'caller_responded',
    });

    if (ctx.digits === '1') return supportOverflowMenu(ctx);
    if (intent === 'callback') {
      return createCallbackAndConfirm(ctx, { category: 'support', reason: 'Asked for a callback by voice' });
    }
    if (intent === 'voicemail') {
      return voicemailPrompt(
        ctx,
        'support',
        'Please leave your name, number and a short message after the tone.'
      );
    }
    if (intent && intent !== 'unclear') return supportOverflowMenu(ctx);

    await note(ctx, { route: 'media_specialist_menu', stage: 'fallback', event: 'not_understood' });
    return twiml(
      gatherDigits({
        action: action('sp2'),
        text: fallbackMenuFor('media_specialist'),
        timeout: 8,
      })
    );
  }

  if (menu === 'sp2') {
    await note(ctx, {
      route: 'media_specialist_menu',
      stage: 'fallback_digit',
      digit: ctx.digits || undefined as any,
      event: 'fallback_response',
    });
    return supportOverflowMenu(ctx);
  }

  if (menu === 'cl') return handleClientMenu(ctx);

  if (menu === 'cl2') {
    if (ctx.digits === '1') return dialAdvisor(ctx);
    if (ctx.digits === '2') return dialTechnicalSupport(ctx);
    return supportOverflowMenu(ctx);
  }

  if (menu === 'cl_help') {
    if (ctx.digits === '1') {
      return createCallbackAndConfirm(ctx, {
        category: 'support',
        reason: 'Requested help with the client portal',
      });
    }
    return voicemailPrompt(ctx, 'technical_support', greeting(ctx.settings, 'technical_message'), 150);
  }

  if (menu === 'cl_adv_done' || menu === 'cl_tech_done') {
    const status = String(ctx.dialStatus || '').toLowerCase();
    await note(ctx, {
      route: 'client_menu',
      stage: menu === 'cl_adv_done' ? 'advisor_result' : 'technical_result',
      dial_status: status,
      outcome: outcomeForDial(status),
      event: 'transfer_result',
    });
    if (status === 'completed') {
      return twiml(say('Thank you for calling Arrive Estate Media. Goodbye.') + hangup());
    }
    return supportOverflowMenu(ctx);
  }

  if (menu === 'pub') {
    const choice = ctx.digits || speechOrDigit(ctx, 'public');
    await note(ctx, {
      route: 'public_menu',
      stage: 'selection',
      digit: choice || (undefined as any),
      event: 'public_selection',
    });
    if (choice === '1') return beginSalesRing(ctx, []);
    if (choice === '2') return technicalVoicemail(ctx);

    if (!ctx.digits && ctx.speech) {
      const intent = classifySpokenRequest(ctx.speech, 'public');
      if (intent === 'technical_support') return technicalVoicemail(ctx);
      if (intent === 'signup_help' || intent === 'sales' || intent === 'booking_help') {
        return beginSalesRing(ctx, []);
      }
    }
    return publicMenu(ctx);
  }

  if (menu === 'pub2') {
    if (ctx.digits === '2') return technicalVoicemail(ctx);
    if (ctx.digits === '1') return beginSalesRing(ctx, []);
    return twiml(say('Thank you for calling Arrive Estate Media. Goodbye.') + hangup());
  }

  for (let stage = 1; stage <= 4; stage += 1) {
    if (menu === stageMenuName(stage)) {
      return handleSalesDialResult(ctx, stage);
    }
  }

  return null;
}

/** First contact for a caller with no protected active-job route. */
export async function routeUnmatchedCaller(ctx: FlowContext): Promise<Response> {
  const type = ctx.identity.type;

  if (type === 'media_specialist' || type === 'growth_advisor') {
    await note(ctx, {
      route: 'media_specialist_menu',
      stage: 'greeting',
      event: 'recognized_caller',
      caller: ctx.identity,
    });
    return twiml(
      gatherSpeech({
        action: action('sp'),
        text: personalGreeting(ctx.identity.name),
        hints: 'support, help, speak to someone, call me back',
        timeout: 6,
      })
    );
  }

  if (type === 'client' || type === 'b2b_client') {
    await note(ctx, {
      route: 'client_menu',
      stage: 'greeting',
      event: 'recognized_caller',
      caller: ctx.identity,
    });
    return twiml(
      gatherSpeech({
        action: action('cl'),
        text: personalGreeting(ctx.identity.name),
        hints: 'my media partner, technical support, booking, call me back',
        timeout: 6,
      })
    );
  }

  await note(ctx, { route: 'public_menu', stage: 'greeting', event: 'public_caller', caller: ctx.identity });
  return publicMenu(ctx);
}

/** Reads a the spoken request for logging without changing the selected route. */
export function describeSelection(ctx: FlowContext): string {
  return `${speechOrDigit(ctx, 'public')}|${ctx.speech}`;
}
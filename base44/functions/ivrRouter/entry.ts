/**
 * ivrRouter — the personalised caller experience.
 *
 * Reached only for callers who are NOT in a protected route: the owner/admin
 * dial-out menu and the active-job client / Media Specialist menus stay in
 * twilioVoiceHandler and are never bypassed here. Entering this function means
 * those menus did not apply, so nothing protected can be overridden.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { validateTwilioRequest } from '../../shared/twilioWebhookValidation.ts';
import {
  loadSettings,
  recognizeCaller,
  isProtectedJobCaller,
  upsertCall,
  callContext,
  parseCall,
  xmlResponse,
  say,
  gatherTag,
  redirect,
  url,
  e164,
  norm,
  receivingLine,
  classifyIntent,
} from '../../shared/ivr.ts';

const VOICE_HANDLER = '/functions/twilioVoiceHandler';

function firstNameOrFriend(caller: any) {
  return caller?.first_name || '';
}

function greeting(text: string, caller: any) {
  return String(text || '').replace(/\{first_name\}/g, firstNameOrFriend(caller) || 'there');
}

Deno.serve(async (req) => {
  try {
    const { raw, params, query } = await parseCall(req);

    const valid = await validateTwilioRequest(req, raw, 'ivrRouter');
    if (!valid) {
      console.error('[ivrRouter] signature verification failed');
      return xmlResponse('');
    }

    const base44 = createClientFromRequest(req);
    const callSid = params.CallSid || '';
    const from = params.From || '';
    const to = params.To || '';
    const digits = (params.Digits || '').trim();
    const speech = (params.SpeechResult || '').trim();
    const stage = query.get('stage') || 'root';

    if (!from || !to) {
      return xmlResponse(say('We could not complete this call. Please try again.'));
    }

    // ── Safety net: never take over a protected route ──
    if (stage === 'root') {
      if (norm(from) && (await isProtectedJobCaller(base44, from))) {
        console.log('[ivrRouter] protected caller — handing back to twilioVoiceHandler');
        return xmlResponse(redirect(url(VOICE_HANDLER)));
      }
    }

    const settings = await loadSettings(base44);
    let record = await callContext(base44, callSid);
    let caller = {
      type: record?.caller_type || 'public',
      name: record?.caller_name || '',
      first_name: '',
      email: record?.caller_email || '',
      record_id: record?.caller_record_id || '',
      record_source: record?.caller_record_source || '',
      assigned_rep: null as any,
    };

    if (!record) {
      const recognized = await recognizeCaller(base44, from);
      caller = recognized as any;
      if (!caller.first_name && caller.name) {
        caller.first_name = String(caller.name).trim().split(/\s+/)[0] || '';
      }
      if (caller.type === 'owner_admin') {
        return xmlResponse(redirect(url(VOICE_HANDLER)));
      }
      record = await upsertCall(base44, callSid, {
        from_number: e164(from),
        to_number: e164(to),
        receiving_line: receivingLine(to),
        caller_type: caller.type,
        caller_name: caller.name,
        caller_email: caller.email,
        caller_record_id: caller.record_id,
        caller_record_source: caller.record_source,
        assigned_rep_name: caller.assigned_rep?.full_name || '',
        assigned_rep_email: caller.assigned_rep?.email || '',
        outcome: 'in_progress',
        stage,
      });
    } else {
      caller.first_name =
        (caller.name || '').trim().split(/\s+/)[0] || '';
      if (!caller.first_name && caller.type !== 'public' && caller.record_id) {
        const recognized = await recognizeCaller(base44, from);
        caller.first_name = recognized.first_name;
        caller.assigned_rep = (recognized as any).assigned_rep;
        caller.name = recognized.name || caller.name;
      }
    }

    /* ───────────── prospect: the advisor leg ended ───────────── */
    if (stage === 'prospect_after') {
      const dialStatus = String(params.DialCallStatus || '').toLowerCase();
      if (dialStatus === 'completed' || dialStatus === 'answered') {
        await upsertCall(base44, callSid, { outcome: 'answered', route: 'prospect_direct' });
        return xmlResponse('');
      }
      await upsertCall(base44, callSid, {
        route: 'sales_ring',
        stage: 'prospect_after',
        outcome: 'no_answer',
      });
      return xmlResponse(redirect(url('/functions/ivrSalesRing')));
    }

    const routeToSupport = (category = 'technical_support') =>
      xmlResponse(
        redirect(url('/functions/ivrSupport', { category, from: 'router' }))
      );

    /* ───────────── recognised Media Specialist ───────────── */
    if (stage === 'root' && caller.type === 'media_specialist') {
      await upsertCall(base44, callSid, { route: 'specialist_voice', stage: 'specialist_greeting' });
      const action = url('/functions/ivrRouter', { stage: 'specialist_intent' });
      return xmlResponse(
        gatherTag({
          action,
          input: 'speech dtmf',
          speechTimeout: 'auto',
          timeout: 6,
          hints: 'support, help, callback, call me back, speak to someone',
          text: greeting(settings.greeting_specialist, caller),
        }) +
          gatherTag({
            action,
            numDigits: 1,
            timeout: 6,
            text: "I'm sorry, I didn't quite catch that. To speak with support, press 1.",
          }) +
          redirect(url('/functions/ivrSupport', { category: 'technical_support' }))
      );
    }

    if (stage === 'specialist_intent') {
      await upsertCall(base44, callSid, {
        route: 'support',
        stage,
        digits,
        speech_text: speech,
      });
      return routeToSupport('technical_support');
    }

    /* ───────────── recognised Arriv One prospect ───────────── */
    if (stage === 'root' && caller.type === 'prospect') {
      const rep = (caller as any).assigned_rep;
      const repName = rep ? rep.full_name || rep.preferred_name || '' : '';
      const repPhone = rep ? e164(rep.work_phone || rep.phone_number || rep.mobile_phone_number) : '';
      const text = String(settings.greeting_prospect || '')
        .replace(/\{first_name\}/g, caller.first_name || 'there')
        .replace(/\{rep_name\}/g, repName || 'our team');

      // A prospect with no Growth Advisor holding a number still gets the
      // personalised greeting, then the normal sales ring group.
      if (!repPhone) {
        await upsertCall(base44, callSid, { route: 'sales_ring', stage: 'prospect_no_advisor' });
        return xmlResponse(say(text) + redirect(url('/functions/ivrSalesRing')));
      }

      const action = url('/functions/ivrRouter', { stage: 'prospect_after' });
      await upsertCall(base44, callSid, {
        route: 'prospect_direct',
        stage: 'prospect_greeting',
        dialed_numbers: [repPhone],
        assigned_rep_name: repName,
        assigned_rep_email: rep?.email || '',
      });
      return xmlResponse(
        say(text) +
          `<Dial callerId="${e164(settings.public_caller_id)}" answerOnBridge="true" timeout="35" action="${action}" method="POST">` +
            `<Number>${repPhone}</Number></Dial>`
      );
    }

    /* ───────────── recognised client / B2B client ───────────── */
    if ((stage === 'root' || stage === 'client_intent') && (caller.type === 'client' || caller.type === 'b2b_client')) {
      const action = url('/functions/ivrRouter', { stage: 'client_intent' });

      if (stage === 'root') {
        await upsertCall(base44, callSid, { route: 'client_voice', stage: 'client_greeting' });
        return xmlResponse(
          gatherTag({
            action,
            input: 'speech dtmf',
            speechTimeout: 'auto',
            timeout: 6,
            hints: 'media partner, representative, account contact, technical support, sign in, booking',
            text: greeting(settings.greeting_client, caller),
          }) +
            gatherTag({
              action,
              numDigits: 1,
              timeout: 6,
              text: "I'm sorry, I didn't quite catch that. To reach your Media Partner, press 1. For technical support, press 2.",
            }) +
            redirect(url('/functions/ivrSupport', { category: 'technical_support' }))
        );
      }

      // stage === client_intent
      let choice = digits;
      let intent = '';
      if (!choice && speech) {
        const classified = await classifyIntent(base44, {
          speech,
          options: ['media_partner', 'technical_support', 'booking', 'account', 'other'],
          context: 'A recognized Arriv client is calling in.',
        });
        intent = classified?.intent || 'other';
      }

      if (intent === 'media_partner') choice = '1';
      if (intent === 'technical_support') choice = '2';
      if (intent === 'booking' || intent === 'account') choice = '3';
      if (intent === 'other' && !choice) choice = '9';

      await upsertCall(base44, callSid, {
        route: choice === '2' ? 'support' : 'client_voice',
        stage,
        digits: choice,
        speech_text: speech,
        detected_intent: intent,
      });

      if (choice === '2') return routeToSupport('technical_support');

      if (choice === '1') {
        const rep = caller.assigned_rep;
        const repPhone = rep ? e164(rep.work_phone || rep.phone_number || rep.mobile_phone_number) : '';
        if (!repPhone) {
          // No Growth Advisor on file — use the configurable sales ring, never invent an assignment.
          return xmlResponse(
            say(settings.sales_unavailable_text) + redirect(url('/functions/ivrSalesRing'))
          );
        }
        const actionUrl = url('/functions/ivrSupport', { category: 'technical_support' });
        return xmlResponse(
          `<Dial callerId="${e164(settings.public_caller_id)}" answerOnBridge="true" timeout="35" action="${actionUrl}">` +
            `<Number>${repPhone}</Number></Dial>`
        );
      }

      // Booking / account questions — point to the real portal, do not claim any change.
      const menuAction = url('/functions/ivrRouter', { stage: 'client_intent' });
      return xmlResponse(
        say(
          'You can review and manage your bookings and account by signing in to your Arriv portal. ' +
            'For help with a booking, press 1 to reach your Media Partner, or press 2 for technical support.'
        ) +
          gatherTag({ action: menuAction, numDigits: 1, timeout: 6 }) +
          redirect(url('/functions/ivrSupport', { category: 'technical_support' }))
      );
    }

    /* ───────────── general public ───────────── */
    if (stage === 'root') {
      await upsertCall(base44, callSid, { route: 'public_menu', stage: 'public_greeting' });
      const action = url('/functions/ivrRouter', { stage: 'public_intent' });
      return xmlResponse(
        gatherTag({
          action,
          numDigits: 1,
          timeout: 7,
          text: settings.greeting_public,
        }) +
          gatherTag({
            action,
            numDigits: 1,
            timeout: 7,
            text: settings.greeting_public,
          }) +
          redirect(url('/functions/ivrSalesRing'))
      );
    }

    if (stage === 'public_intent') {
      await upsertCall(base44, callSid, {
        route: digits === '2' ? 'support' : 'sales_ring',
        stage,
        digits,
      });
      if (digits === '2') return routeToSupport('technical_support');
      if (digits === '1') return xmlResponse(redirect(url('/functions/ivrSalesRing')));
      // Unrecognised key → sales, never a silent disconnect
      return xmlResponse(redirect(url('/functions/ivrSalesRing')));
    }

    return xmlResponse(redirect(url('/functions/ivrSalesRing')));
  } catch (error) {
    console.error('[ivrRouter] fatal:', (error as Error).message);
    return xmlResponse(say('A system error occurred.'));
  }
});
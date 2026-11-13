/**
 * ivrRouter — the personalised caller experience.
 *
 * Reached only for callers who are NOT in a protected route: the owner/admin
 * dial-out menu and the active-job client / Media Specialist menus stay in
 * twilioVoiceHandler and are never bypassed here. Entering this function means
 * those menus did not apply, so nothing protected can be overridden.
 *
 * Prospect precedence is decided in shared/ivr.ts (recognizeCaller) so this
 * router only ever speaks the greeting the recogniser selected.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { validateTwilioRequest } from '../../shared/twilioWebhookValidation.ts';
import {
  loadSettings,
  recognizeCaller,
  recognizeApplicant,
  isProtectedJobCaller,
  isSpeakableName,
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
  hangup,
  OWNER_FALLBACK,
} from '../../shared/ivr.ts';
import {
  loadProduction,
  publicMenuPlan,
  applicantPlan,
  specialistPlan,
  clientPlan,
} from '../../shared/productionIvr.ts';

const VOICE_HANDLER = '/functions/twilioVoiceHandler';
// Build marker: hr-followup-menu (bumped whenever the public menu changes).

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

    // Settings record plus the published IVR configuration the studio edits.
    const { settings, prod } = await loadProduction(base44);
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

    /** A configured menu destination → the function that serves it. */
    const menuDestination = (destination: string) => {
      if (destination === 'support') return routeToSupport('technical_support');
      if (destination === 'applicant') {
        return xmlResponse(redirect(url('/functions/ivrRouter', { stage: 'applicant_greeting' })));
      }
      if (destination === 'ashley') return xmlResponse(redirect(url('/functions/ivrAshley')));
      if (destination === 'voicemail') {
        return xmlResponse(redirect(url('/functions/ivrSupport', { stage: 'voicemail_prompt', category: 'general' })));
      }
      return xmlResponse(redirect(url('/functions/ivrSalesRing')));
    };

    /* ───────────── recognised Media Specialist ───────────── */
    if (stage === 'root' && caller.type === 'media_specialist') {
      await upsertCall(base44, callSid, { route: 'specialist_voice', stage: 'specialist_greeting' });
      const action = url('/functions/ivrRouter', { stage: 'specialist_intent' });
      const sp = specialistPlan(prod, settings);
      return xmlResponse(
        gatherTag({
          action,
          input: 'speech dtmf',
          speechTimeout: 'auto',
          timeout: sp.speechTimeout,
          hints: sp.hints,
          text: greeting(settings.greeting_specialist, caller),
        }) +
          gatherTag({
            action,
            numDigits: 1,
            timeout: sp.speechTimeout,
            text: sp.retryPrompt,
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
      const repFullName = rep ? rep.full_name || rep.preferred_name || '' : '';
      const repName = String(repFullName).trim().split(/\s+/)[0] || '';
      const repPhone = rep ? e164(rep.work_phone || rep.phone_number || rep.mobile_phone_number) : '';
      // A name we cannot pronounce is never spoken: the greeting simply opens
      // with "Hi, thank you for calling Arriv Estate Media..."
      const spokenName = isSpeakableName(caller.first_name)
        ? String(caller.first_name).trim()
        : '';
      let text = String(settings.greeting_prospect || '').replace(
        /\{rep_name\}/g,
        repName || 'our team'
      );
      text = spokenName
        ? text.replace(/\{first_name\}/g, spokenName)
        : text
            .replace(/Hi\s*\{first_name\}\s*,\s*/i, 'Hi, ')
            .replace(/\{first_name\}\s*,\s*/g, '')
            .replace(/\{first_name\}/g, '')
            .replace(/\s{2,}/g, ' ')
            .trim();

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
        assigned_rep_name: repFullName,
        assigned_rep_email: rep?.email || '',
      });
      return xmlResponse(
        say(text) +
          `<Dial callerId="${e164(settings.public_caller_id)}" answerOnBridge="true" timeout="${
            Number(prod.prospect.dial_timeout) || 35
          }" action="${action}" method="POST">` +
            `<Number>${repPhone}</Number></Dial>`
      );
    }

    /* ───────────── recognised client / B2B client ───────────── */
    if ((stage === 'root' || stage === 'client_intent') && (caller.type === 'client' || caller.type === 'b2b_client')) {
      const action = url('/functions/ivrRouter', { stage: 'client_intent' });

      const cp = clientPlan(prod, settings);

      if (stage === 'root') {
        await upsertCall(base44, callSid, { route: 'client_voice', stage: 'client_greeting' });
        return xmlResponse(
          gatherTag({
            action,
            input: 'speech dtmf',
            speechTimeout: 'auto',
            timeout: cp.speechTimeout,
            hints: cp.hints,
            text: greeting(settings.greeting_client, caller),
          }) +
            gatherTag({
              action,
              numDigits: 1,
              timeout: cp.speechTimeout,
              text: cp.retryPrompt,
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
        say(cp.portalMessage) +
          gatherTag({ action: menuAction, numDigits: 1, timeout: 6 }) +
          redirect(url('/functions/ivrSupport', { category: 'technical_support' }))
      );
    }

    /* ───────────── general public ───────────── */
    if (stage === 'root') {
      await upsertCall(base44, callSid, { route: 'public_menu', stage: 'public_greeting' });
      const action = url('/functions/ivrRouter', { stage: 'public_intent' });
      const pm = publicMenuPlan(prod, settings);
      return xmlResponse(
        gatherTag({
          action,
          numDigits: 1,
          timeout: pm.timeout,
          text: pm.prompt,
        }) +
          gatherTag({
            action,
            numDigits: 1,
            timeout: pm.timeout,
            text: pm.prompt,
          }) +
          redirect(url('/functions/ivrSalesRing'))
      );
    }

    if (stage === 'public_intent') {
      const pm = publicMenuPlan(prod, settings);
      const destination = digits ? pm.destinationFor(digits) : pm.noInputDestination;
      await upsertCall(base44, callSid, {
        route: destination === 'support' || destination === 'applicant' ? 'support' : 'sales_ring',
        stage,
        digits,
      });
      // An unrecognised key follows the configured invalid destination, so a
      // caller is never silently disconnected.
      return menuDestination(destination);
    }

    /* ───────────── job application follow-up (Khetha IQ) ─────────────
     * Anyone who presses 3 on the general menu is greeted by name when their
     * number matches an application on file, then connected to the owner's
     * number. The owner hears who is calling, and why, before the bridge. */
    const applicantBase = applicantPlan(prod, settings, { number: e164(from) });
    const hrNumber = e164(applicantBase.hrNumber) || e164(OWNER_FALLBACK);

    if (stage === 'applicant_greeting') {
      const applicant = await recognizeApplicant(base44, from);
      const action = url('/functions/ivrRouter', { stage: 'applicant_connect' });
      await upsertCall(base44, callSid, {
        route: 'support',
        stage: 'applicant_greeting',
        detected_intent: 'job_application_followup',
        caller_name: applicant.name || caller.name || '',
        caller_email: applicant.email || '',
        caller_record_id: applicant.record_id || '',
        caller_record_source: applicant.record_source || '',
      });
      const plan = applicantPlan(prod, settings, { ...applicant, number: e164(from) });
      const text = plan.prompt;
      return xmlResponse(
        gatherTag({ action, numDigits: 1, timeout: plan.menuTimeout, text }) +
          gatherTag({ action, numDigits: 1, timeout: plan.menuTimeout, text }) +
          redirect(action)
      );
    }

    if (stage === 'applicant_connect') {
      if (digits && digits !== '1') {
        const action = url('/functions/ivrRouter', { stage: 'applicant_connect' });
        return xmlResponse(
          gatherTag({
            action,
            numDigits: 1,
            timeout: applicantBase.menuTimeout,
            text: applicantBase.retryPrompt,
          }) + redirect(action)
        );
      }

      // Their number identifies them so the owner knows who is calling.
      const applicant = await recognizeApplicant(base44, from);
      const whisper = url('/functions/ivrHrWhisper', {
        name: applicant.name || '',
        number: e164(from),
      });
      const action = url('/functions/ivrRouter', { stage: 'applicant_after' });
      await upsertCall(base44, callSid, {
        route: 'support',
        stage: 'applicant_ring',
        detected_intent: 'job_application_followup',
        digits: digits || '',
        dialed_numbers: hrNumber ? [hrNumber] : [],
      });
      return xmlResponse(
        `<Dial callerId="${e164(settings.public_caller_id)}" answerOnBridge="true" timeout="${applicantBase.dialTimeout}" action="${action}" method="POST">` +
          `<Number url="${whisper}">${hrNumber}</Number>` +
          `</Dial>`
      );
    }

    if (stage === 'applicant_after') {
      const dialStatus = String(params.DialCallStatus || '').toLowerCase();
      if (dialStatus === 'completed' || dialStatus === 'answered') {
        await upsertCall(base44, callSid, {
          outcome: 'answered',
          route: 'support',
          stage: 'applicant_connected',
        });
        return xmlResponse('');
      }
      await upsertCall(base44, callSid, { outcome: 'no_answer', stage: 'applicant_after' });
      return xmlResponse(
        say(applicantBase.failureText) + hangup()
      );
    }

    return xmlResponse(redirect(url('/functions/ivrSalesRing')));
  } catch (error) {
    console.error('[ivrRouter] fatal:', (error as Error).message);
    return xmlResponse(say('A system error occurred.'));
  }
});
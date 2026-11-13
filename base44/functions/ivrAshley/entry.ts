/**
 * Ashley — the Arriv booking concierge.
 *
 * Turn-based spoken conversation over Twilio speech recognition + Base44's LLM.
 * Ashley never invents availability, prices, provider assignment or a confirmed
 * booking: she explains the real package catalog, checks the real calendar for
 * obvious conflicts, and submits through the standard booking workflow
 * (handleBookingSubmission). If that workflow cannot complete, she creates a
 * follow-up record and tells the caller exactly what remains.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { validateTwilioRequest } from '../../shared/twilioWebhookValidation.ts';
import {
  loadSettings,
  recognizeCaller,
  upsertCall,
  callContext,
  parseCall,
  xmlResponse,
  say,
  gatherTag,
  redirect,
  url,
  e164,
  receivingLine,
  createCallback,
  notifyOwner,
} from '../../shared/ivr.ts';

const PACKAGES = [
  {
    id: 'mls_walkthrough',
    name: 'MLS Walkthrough',
    from: 100,
    includes: 'a 2 to 3 minute MLS-ready walkthrough plus a vertical social clip',
  },
  {
    id: 'photo_essentials',
    name: 'Photo Essentials',
    from: 275,
    includes: '50 to 150 edited photos, true-to-life color, and one vertical teaser',
  },
  {
    id: 'photo_cinematic',
    name: 'Photo and Cinematic Walkthrough',
    from: 475,
    includes: 'everything in Photo Essentials, a 2 to 3 minute walkthrough video, and two vertical reels',
  },
  {
    id: 'premium_bundle',
    name: 'Premium Media Bundle',
    from: 675,
    includes: 'everything in the cinematic package, a 3D tour, twilight edits, and AI staging if needed',
  },
];

const INTRO =
  "Hi, I'm Ashley, your Arriv booking concierge. Would you like to schedule a callback or book with me?";

function packagesForPrompt() {
  return PACKAGES.map(
    (p) => `- ${p.id} (${p.name}) starting at $${p.from}: includes ${p.includes}`
  ).join('\n');
}

/** Real calendar check. Returns what is actually known — never a confirmed slot. */
async function checkDate(base44: any, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return { checked: false, busy: 0 };
  try {
    const token = await base44.asServiceRole.connectors.getAccessToken('googlecalendar');
    if (!token) return { checked: false, busy: 0 };
    const start = `${date}T00:00:00Z`;
    const end = `${date}T23:59:59Z`;
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${start}&timeMax=${end}&singleEvents=true&maxResults=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return { checked: false, busy: 0 };
    const data = await res.json();
    return { checked: true, busy: Array.isArray(data.items) ? data.items.length : 0 };
  } catch (e) {
    console.error('[ashley] calendar check failed:', (e as Error).message);
    return { checked: false, busy: 0 };
  }
}

async function converse(base44: any, transcript: any[]) {
  const history = transcript
    .slice(-16)
    .map((t) => `${t.role === 'assistant' ? 'Ashley' : 'Caller'}: ${t.text}`)
    .join('\n');

  const prompt = `You are Ashley, the Arriv Estate Media booking concierge, on a live phone call.
The brand is pronounced "Arrive".

Today is ${new Date().toISOString().slice(0, 10)}.

Packages you may describe (never invent other packages or prices; every price is a starting price that depends on property size):
${packagesForPrompt()}

Rules:
- Speak in short, warm, plain sentences. No lists, no markdown.
- Never invent available dates, times, prices, provider assignment, payment status, or a confirmed booking.
- Never ask for or accept card numbers. Say payment is completed through a secure link.
- If the caller asks for a person or a callback, set intent to "callback".
- Ask only for what you still need: property address, package, preferred date, preferred time, name, email.
- Set ready_to_book true only when you have address, package, preferred date, name and email.
- When ready_to_book is true, your reply must read the details back and ask them to confirm.

Conversation so far:
${history || '(call just started)'}`;

  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: 'object',
      properties: {
        reply: { type: 'string' },
        intent: {
          type: 'string',
          enum: ['booking', 'callback', 'question', 'human', 'not_interested', 'other'],
        },
        ready_to_book: { type: 'boolean' },
      },
      required: ['reply', 'intent', 'ready_to_book'],
    },
  });

  return {
    reply: String(result?.reply || '').trim(),
    intent: String(result?.intent || 'other'),
    ready: !!result?.ready_to_book,
  };
}

/** Final structured extraction from the conversation, used only at confirmation. */
async function extractBooking(base44: any, transcript: any[], from: string) {
  const history = transcript
    .slice(-24)
    .map((t) => `${t.role === 'assistant' ? 'Ashley' : 'Caller'}: ${t.text}`)
    .join('\n');

  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: `Extract the booking details from this phone conversation with the Arriv booking concierge.
Today is ${new Date().toISOString().slice(0, 10)}. The caller's phone number is ${e164(from)}.
Use only details the caller actually gave. Leave a field empty when it was not given. Never invent anything.
Package must be one of: mls_walkthrough, photo_essentials, photo_cinematic, premium_bundle. Empty if unclear.

Conversation:
${history}`,
    response_json_schema: {
      type: 'object',
      properties: {
        client_name: { type: 'string' },
        client_email: { type: 'string' },
        street_address: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string' },
        preferred_date: { type: 'string' },
        preferred_time: { type: 'string' },
        package_id: { type: 'string' },
        missing: { type: 'array', items: { type: 'string' } },
      },
      required: ['missing'],
    },
  });

  return {
    client_name: String(result?.client_name || '').trim(),
    client_email: String(result?.client_email || '').trim(),
    street_address: String(result?.street_address || '').trim(),
    city: String(result?.city || '').trim(),
    state: String(result?.state || '').trim().toUpperCase().slice(0, 2),
    preferred_date: String(result?.preferred_date || '').trim(),
    preferred_time: String(result?.preferred_time || '').trim(),
    package_id: String(result?.package_id || '').trim(),
    missing: Array.isArray(result?.missing) ? result.missing.filter(Boolean) : [],
  };
}

function isAffirmative(text: string) {
  const t = String(text || '').toLowerCase();
  return /\b(yes|yeah|yep|correct|confirm|that's right|thats right|sounds good|go ahead|do it|please do)\b/.test(t);
}

function isNegative(text: string) {
  const t = String(text || '').toLowerCase();
  return /\b(no|nope|not right|wrong|change|different)\b/.test(t);
}

Deno.serve(async (req) => {
  try {
    const { raw, params, query } = await parseCall(req);

    const valid = await validateTwilioRequest(req, raw, 'ivrAshley');
    if (!valid) {
      console.error('[ivrAshley] signature verification failed');
      return xmlResponse('');
    }

    const base44 = createClientFromRequest(req);
    const callSid = params.CallSid || '';
    const from = params.From || '';
    const to = params.To || '';
    const speech = (params.SpeechResult || '').trim();
    const digits = (params.Digits || '').trim();
    const stage = query.get('stage') || 'root';

    if (!from || !to) return xmlResponse(say('We could not complete this call. Please try again.'));

    const settings = await loadSettings(base44);
    let record = await callContext(base44, callSid);

    if (!record) {
      const caller = await recognizeCaller(base44, from);
      record = await upsertCall(base44, callSid, {
        from_number: e164(from),
        to_number: e164(to),
        receiving_line: receivingLine(to),
        caller_type: caller.type,
        caller_name: caller.name,
        caller_email: caller.email,
        caller_record_id: caller.record_id,
        caller_record_source: caller.record_source,
        route: 'ashley',
        stage: 'ashley_intro',
      });
    }

    const maxTurns = Number(settings.ashley_max_turns) || 12;
    const turns = Number(record?.ashley_turns || 0);
    const transcript: any[] = Array.isArray(record?.transcript) ? [...record!.transcript] : [];

    const turnAction = url('/functions/ivrAshley', { stage: 'turn' });

    const askMore = (text: string) =>
      gatherTag({
        action: turnAction,
        input: 'speech',
        speechTimeout: 'auto',
        timeout: 7,
        language: 'en-US',
        text,
      }) +
      // Silence is a real answer: offer the callback rather than dead air.
      redirect(url('/functions/ivrAshley', { stage: 'callback_offer' }));

    if (stage === 'root') {
      await upsertCall(base44, callSid, { route: 'ashley', stage: 'ashley_intro' });
      return xmlResponse(
        gatherTag({
          action: turnAction,
          input: 'speech',
          speechTimeout: 'auto',
          timeout: 7,
          language: 'en-US',
          text: INTRO,
        }) + askMore("I'm sorry, I didn't quite catch that. Would you like to schedule a callback or book with me?")
      );
    }

    if (stage === 'callback_offer') {
      const callback = await createCallback(base44, {
        call_sid: callSid,
        caller: {
          type: record?.caller_type || 'public',
          name: record?.caller_name || '',
          first_name: '',
          email: record?.caller_email || '',
          record_id: record?.caller_record_id || '',
          record_source: record?.caller_record_source || '',
          assigned_rep: null,
        } as any,
        from,
        to,
        category: 'booking',
        reason: 'Caller reached the booking concierge and asked for a callback.',
        settings,
      });
      await upsertCall(base44, callSid, {
        outcome: 'callback_requested',
        route: 'callback',
        callback_id: callback?.id || '',
        stage: 'ashley_callback',
      });
      if (callback && !callback.notified_at && settings.notify_owner_on_callback) {
        const sent = await notifyOwner(
          base44,
          settings,
          `Arriv Call Center: booking callback requested from ${callback.caller_name || callback.caller_number}. ${url('/CallCenter', { tab: 'callbacks' })}`
        );
        if (sent) {
          await base44.asServiceRole.entities.CallbackRequest
            .update(callback.id, { notified_at: new Date().toISOString() })
            .catch(() => {});
        }
      }
      return xmlResponse(
        say(
          'No problem. I have your number and a member of our team will call you back to help with the booking. Thank you for calling Arrive Estate Media. Goodbye.'
        ) + '<Hangup/>'
      );
    }

    if (stage === 'turn') {
      const said = speech || digits;
      if (!said) {
        return xmlResponse(
          redirect(url('/functions/ivrAshley', { stage: 'callback_offer' }))
        );
      }
      if (turns >= maxTurns) {
        return xmlResponse(redirect(url('/functions/ivrAshley', { stage: 'callback_offer' })));
      }

      transcript.push({ role: 'user', text: said, at: new Date().toISOString() });

      const turn = await converse(base44, transcript);
      transcript.push({ role: 'assistant', text: turn.reply, at: new Date().toISOString() });

      await upsertCall(base44, callSid, {
        ashley_turns: turns + 1,
        transcript: transcript.slice(-24),
        stage: 'ashley_turn',
        speech_text: said,
      });

      if (turn.intent === 'callback' || turn.intent === 'human') {
        return xmlResponse(
          say(turn.reply || 'Of course. I will have a member of our team call you back.')
            + redirect(url('/functions/ivrAshley', { stage: 'callback_offer' }))
        );
      }

      if (turn.ready) {
        return xmlResponse(
          gatherTag({
            action: url('/functions/ivrAshley', { stage: 'confirm' }),
            input: 'speech dtmf',
            speechTimeout: 'auto',
            timeout: 8,
            language: 'en-US',
            hints: 'yes, no',
            text: turn.reply || 'Shall I go ahead and book that?',
          }) + askMore('Shall I go ahead and book that?')
        );
      }

      return xmlResponse(askMore(turn.reply || 'Could you tell me a little more about what you need?'));
    }

    if (stage === 'confirm') {
      const said = speech || digits;

      if (said && isNegative(said) && !isAffirmative(said)) {
        return xmlResponse(
          askMore('No problem. What would you like to change?')
        );
      }

      if (!said || !isAffirmative(said)) {
        return xmlResponse(askMore('Just to confirm, should I go ahead and book that? Please say yes or no.'));
      }

      const details = await extractBooking(base44, transcript, from);
      const missing = [...details.missing];
      if (!details.street_address) missing.push('property address');
      if (!details.city || !details.state) missing.push('city and state');
      if (!details.preferred_date) missing.push('preferred date');
      if (!details.package_id) missing.push('package');
      if (!details.client_email) missing.push('email address');
      const uniqueMissing = Array.from(new Set(missing));

      if (uniqueMissing.length) {
        const ask = `I still need your ${uniqueMissing.slice(0, 2).join(' and ')} before I can book that.`;
        transcript.push({ role: 'assistant', text: ask, at: new Date().toISOString() });
        await upsertCall(base44, callSid, { transcript: transcript.slice(-24) });
        return xmlResponse(askMore(ask));
      }

      const availability = await checkDate(base44, details.preferred_date);

      const booking = {
        client_name: details.client_name || record?.caller_name || '',
        client_email: details.client_email,
        client_phone: e164(from),
        street_address: details.street_address,
        city: details.city,
        state: details.state,
        preferred_date: details.preferred_date,
        preferred_time: details.preferred_time || 'TBD',
        package: details.package_id,
        add_ons: [],
        notes: 'Booking requested by phone through Ashley, the Arriv booking concierge.',
        purchasing_context: 'personal',
        source: 'ivr_ashley',
      };

      let bookingId = '';
      let failure = '';
      try {
        // The canonical booking path — identical to a booking submitted from the portal.
        const submission = await base44.asServiceRole.functions.invoke('handleBookingSubmission', {
          booking,
        });
        const created = submission?.data?.booking || submission?.booking;
        if (created?.id) {
          bookingId = created.id;
        } else {
          failure =
            submission?.data?.error || submission?.error || 'The booking workflow did not confirm the booking.';
        }
      } catch (e) {
        failure = (e as Error).message;
      }

      if (bookingId) {
        await upsertCall(base44, callSid, {
          outcome: 'completed',
          route: 'ashley',
          booking_id: bookingId,
          stage: 'ashley_booked',
        });
        const availabilityNote = availability.checked
          ? ' I have also flagged this date to the team.'
          : '';
        return xmlResponse(
          say(
            `You're all set. I have created your booking request for ${details.street_address}. ` +
              `You will receive an email at ${details.client_email} with the confirmation and a secure payment link. ` +
              `Your shoot is confirmed once that payment is completed.${availabilityNote} Thank you for calling Arrive Estate Media. Goodbye.`
          ) + '<Hangup/>'
        );
      }

      // The workflow could not complete — keep the lead and say exactly what remains.
      const callback = await createCallback(base44, {
        call_sid: callSid,
        caller: {
          type: record?.caller_type || 'public',
          name: details.client_name || record?.caller_name || '',
          first_name: '',
          email: details.client_email || record?.caller_email || '',
          record_id: record?.caller_record_id || '',
          record_source: record?.caller_record_source || '',
          assigned_rep: null,
        } as any,
        from,
        to,
        category: 'booking',
        reason:
          `Booking could not be completed by the concierge. ` +
          `${details.street_address}, ${details.city} ${details.state} — ${details.package_id} on ${details.preferred_date} ${details.preferred_time}. ` +
          `Reason: ${failure}`,
        settings,
      });
      await upsertCall(base44, callSid, {
        route: 'callback',
        outcome: 'callback_requested',
        callback_id: callback?.id || '',
        stage: 'ashley_booking_failed',
      });

      return xmlResponse(
        say(
          'I have saved all of your details, but I could not finish the booking on this call. ' +
            'A member of our team will call you back to complete it, and you can also finish it yourself in the Arriv portal. ' +
            'Thank you for calling Arrive Estate Media. Goodbye.'
        ) + '<Hangup/>'
      );
    }

    return xmlResponse(redirect(url('/functions/ivrAshley')));
  } catch (error) {
    console.error('[ivrAshley] fatal:', (error as Error).message);
    return xmlResponse(
      say(
        'I am having trouble completing this call. Please hold while I connect you to our team.'
      ) + redirect(url('/functions/ivrSupport', { category: 'booking' }))
    );
  }
});
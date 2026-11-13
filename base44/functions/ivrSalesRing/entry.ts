/**
 * ivrSalesRing — simultaneous sales ring group with staged fallback.
 *
 * Stage 1  every eligible Growth Advisor's primary business number, rung together
 * Stage 2  their configured cellphone numbers
 * Stage 3  the owner fallback number
 * Stage 4  Ashley, the AI booking concierge
 *
 * Numbers are dialed once per call: anything already rung is excluded, so the
 * same number is never dialed twice and one representative answering stops the
 * other legs automatically (a single <Dial> with several <Number> nouns).
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { validateTwilioRequest } from '../../shared/twilioWebhookValidation.ts';
import {
  loadSettings,
  salesDirectory,
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
  LINE_855,
  LINE_706,
} from '../../shared/ivr.ts';
import { loadProduction, salesRingPlan } from '../../shared/productionIvr.ts';

// Loop guard: never dial an Arriv Twilio line, and never dial a number twice.
const SELF_NUMBERS = [norm(LINE_855), norm(LINE_706)];

function dedupe(numbers: string[], already: string[]): string[] {
  const seen = new Set((already || []).map((n) => norm(n)).filter(Boolean));
  const out: string[] = [];
  for (const raw of numbers) {
    const n = e164(raw);
    const key = norm(n);
    if (!key || seen.has(key) || SELF_NUMBERS.includes(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

function dialGroup(numbers: string[], opts: { callerId: string; timeout: number; action: string; accept?: string }) {
  const children = numbers
    .map(
      (n) =>
        `<Number${opts.accept ? ` url="${opts.accept}"` : ''}>${n}</Number>`
    )
    .join('');
  return (
    `<Dial callerId="${opts.callerId}" answerOnBridge="true" timeout="${opts.timeout}" action="${opts.action}" method="POST">` +
    children +
    `</Dial>`
  );
}

Deno.serve(async (req) => {
  try {
    const { raw, params, query } = await parseCall(req);

    const valid = await validateTwilioRequest(req, raw, 'ivrSalesRing');
    if (!valid) {
      console.error('[ivrSalesRing] signature verification failed');
      return xmlResponse('');
    }

    const base44 = createClientFromRequest(req);
    const callSid = params.CallSid || '';
    const from = params.From || '';
    const to = params.To || '';
    const stage = query.get('stage') || 'ring1';
    const digits = (params.Digits || '').trim();

    const { settings, prod } = await loadProduction(base44);
    const ringPlan = salesRingPlan(prod, settings);
    const record = await callContext(base44, callSid);
    const callerId = e164(settings.public_caller_id);
    const already: string[] = Array.isArray(record?.dialed_numbers) ? record!.dialed_numbers : [];

    /* ── optional agent acceptance so a phone voicemail cannot claim the call ── */
    if (stage === 'accept') {
      if (!settings.agent_acceptance_required) return xmlResponse('');
      if (digits === '1') return xmlResponse('');
      return xmlResponse(
        gatherTag({
          action: url('/functions/ivrSalesRing', { stage: 'accept' }),
          numDigits: 1,
          timeout: 6,
          text: ringPlan.acceptPrompt,
        }) + '<Hangup/>'
      );
    }

    /* ── if a leg already connected, the call is over — end cleanly ── */
    const dialStatus = params.DialCallStatus || '';
    if (stage !== 'ring1' && (dialStatus === 'completed' || dialStatus === 'answered')) {
      await upsertCall(base44, callSid, { outcome: 'answered', route: 'sales_ring' });
      return xmlResponse('');
    }

    if (!record) {
      await upsertCall(base44, callSid, {
        from_number: e164(from),
        to_number: e164(to),
        receiving_line: receivingLine(to),
        route: 'sales_ring',
        stage,
      });
    }

    const directory = await salesDirectory(base44, settings);
    const ownerFallback = e164(settings.owner_fallback_number);

    const acceptUrl = settings.agent_acceptance_required
      ? url('/functions/ivrSalesRing', { stage: 'accept' })
      : '';

    /* ── stage 1: primary business numbers ── */
    if (stage === 'ring1') {
      const primaries = dedupe(directory.map((d) => d.primary), already);
      const targets = primaries.length ? primaries : [];
      if (targets.length) {
        const action = url('/functions/ivrSalesRing', { stage: 'ring2' });
        await upsertCall(base44, callSid, {
          route: 'sales_ring',
          stage: 'ring1',
          dialed_numbers: [...already, ...targets],
        });
        return xmlResponse(
          dialGroup(targets, {
            callerId,
            timeout: Number(settings.stage1_timeout) || 18,
            action,
            accept: acceptUrl,
          })
        );
      }
      return xmlResponse(redirect(url('/functions/ivrSalesRing', { stage: 'ring2' })));
    }

    /* ── stage 2: cellphone fallbacks ── */
    if (stage === 'ring2') {
      const cells = dedupe(directory.map((d) => d.cell), already);
      if (cells.length) {
        const action = url('/functions/ivrSalesRing', { stage: 'ring3' });
        await upsertCall(base44, callSid, {
          stage: 'ring2',
          dialed_numbers: [...already, ...cells],
        });
        return xmlResponse(
          dialGroup(cells, {
            callerId,
            timeout: Number(settings.stage2_timeout) || 18,
            action,
            accept: acceptUrl,
          })
        );
      }
      return xmlResponse(redirect(url('/functions/ivrSalesRing', { stage: 'ring3' })));
    }

    /* ── stage 3: owner fallback ── */
    if (stage === 'ring3') {
      const ownerTargets = dedupe([ownerFallback], already);
      if (ownerTargets.length) {
        const action = url('/functions/ivrSalesRing', { stage: 'ring4' });
        await upsertCall(base44, callSid, {
          stage: 'ring3',
          dialed_numbers: [...already, ...ownerTargets],
        });
        return xmlResponse(
          dialGroup(ownerTargets, {
            callerId,
            timeout: Number(settings.stage3_timeout) || 20,
            action,
            accept: acceptUrl,
          })
        );
      }
      return xmlResponse(redirect(url('/functions/ivrSalesRing', { stage: 'ring4' })));
    }

    /* ── stage 4: nobody answered ── */
    await upsertCall(base44, callSid, { stage: 'ring4' });
    if (settings.ashley_enabled) {
      return xmlResponse(redirect(url('/functions/ivrAshley')));
    }
    if (settings.voicemail_enabled) {
      return xmlResponse(
        say(settings.sales_unavailable_text) +
          redirect(url('/functions/ivrSupport', { stage: 'voicemail_prompt', category: 'sales' }))
      );
    }
    return xmlResponse(
      say(ringPlan.finalNoAnswerText) +
        '<Hangup/>'
    );
  } catch (error) {
    console.error('[ivrSalesRing] fatal:', (error as Error).message);
    return xmlResponse(say('A system error occurred.'));
  }
});
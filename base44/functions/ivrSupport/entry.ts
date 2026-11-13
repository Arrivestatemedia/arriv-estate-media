/**
 * ivrSupport — the support overflow IVR shared by every caller type.
 *
 * Press 1 creates a callback, press 2 records a technical-support voicemail.
 * A caller is never silently disconnected: every branch ends with a spoken
 * confirmation, a live transfer, or a repeat of the menu.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { secrets } from 'base44:runtime';
import { validateTwilioRequest } from '../../shared/twilioWebhookValidation.ts';
import { attemptAssistTicket } from '../../shared/ivrAssist.ts';
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
  norm,
  receivingLine,
  createCallback,
  saveVoicemail,
  notifyOwner,
} from '../../shared/ivr.ts';
import { loadProduction, supportPlan } from '../../shared/productionIvr.ts';

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

Deno.serve(async (req) => {
  try {
    const { raw, params, query } = await parseCall(req);

    const valid = await validateTwilioRequest(req, raw, 'ivrSupport');
    if (!valid) {
      console.error('[ivrSupport] signature verification failed');
      return xmlResponse('');
    }

    const base44 = createClientFromRequest(req);
    const callSid = params.CallSid || '';
    const from = params.From || '';
    const to = params.To || '';
    const digits = (params.Digits || '').trim();
    const speech = (params.SpeechResult || '').trim();
    const stage = query.get('stage') || 'root';
    const attempt = Number(query.get('attempt') || '0');
    const category = query.get('category') || 'technical_support';

    if (!from || !to) return xmlResponse(say('We could not complete this call. Please try again.'));

    const { settings, prod } = await loadProduction(base44);
    const supportCfg = supportPlan(prod, settings);
    const record = await callContext(base44, callSid);

    let caller: any = record
      ? {
          type: record.caller_type || 'public',
          name: record.caller_name || '',
          first_name: (record.caller_name || '').split(/\s+/)[0] || '',
          email: record.caller_email || '',
          record_id: record.caller_record_id || '',
          record_source: record.caller_record_source || '',
          assigned_rep: null,
        }
      : await recognizeCaller(base44, from);

    if (!record) {
      await upsertCall(base44, callSid, {
        from_number: e164(from),
        to_number: e164(to),
        receiving_line: receivingLine(to),
        caller_type: caller.type,
        caller_name: caller.name,
        caller_email: caller.email,
        caller_record_id: caller.record_id,
        caller_record_source: caller.record_source,
        route: 'support',
        stage,
      });
    }

    const menuAction = url('/functions/ivrSupport', { stage: 'choose', category, attempt });

    /* ── support overflow menu ── */
    if (stage === 'root') {
      await upsertCall(base44, callSid, { route: 'support', stage: 'support_menu' });
      return xmlResponse(
        gatherTag({
          action: menuAction,
          numDigits: 1,
          timeout: 7,
          text: settings.support_overflow_text,
        }) +
          (attempt < Number(supportCfg.attempts)
            ? redirect(url('/functions/ivrSupport', { stage: 'root', category, attempt: attempt + 1 }))
            : redirect(url('/functions/ivrSupport', { stage: 'voicemail_prompt', category })))
      );
    }

    if (stage === 'choose') {
      if (digits === '1') {
        return xmlResponse(redirect(url('/functions/ivrSupport', { stage: 'callback_reason', category })));
      }
      if (digits === '2') {
        return xmlResponse(redirect(url('/functions/ivrSupport', { stage: 'voicemail_prompt', category })));
      }
      return xmlResponse(
        redirect(url('/functions/ivrSupport', { stage: 'root', category, attempt: attempt + 1 }))
      );
    }

    /* ── press 1: callback request ── */
    if (stage === 'callback_reason') {
      // Silence is fine — the follow-up redirect still records the callback.
      return xmlResponse(
        gatherTag({
          action: url('/functions/ivrSupport', { stage: 'callback_save', category }),
          input: 'speech',
          speechTimeout: 'auto',
          timeout: 6,
          text: supportCfg.callbackReasonPrompt,
        }) + redirect(url('/functions/ivrSupport', { stage: 'callback_save', category }))
      );
    }

    if (stage === 'callback_save') {
      const reason = speech || 'Callback requested by phone';
      const callback = await createCallback(base44, {
        call_sid: callSid,
        caller,
        from,
        to,
        category,
        reason,
        settings,
      });

      await upsertCall(base44, callSid, {
        route: 'callback',
        stage: 'callback_saved',
        speech_text: speech,
        outcome: 'callback_requested',
        callback_id: callback?.id || '',
      });

      if (callback && !callback.notified_at && settings.notify_owner_on_callback) {
        const sent = await notifyOwner(
          base44,
          settings,
          `Arriv Call Center: callback requested from ${callback.caller_name || callback.caller_number} (${category.replace('_', ' ')}). ${url('/CallCenter', { tab: 'callbacks' })}`
        );
        if (sent) {
          await base44.asServiceRole.entities.CallbackRequest
            .update(callback.id, { notified_at: new Date().toISOString() })
            .catch(() => {});
        }
      }

      return xmlResponse(
        say(supportCfg.callbackConfirmText) + '<Hangup/>'
      );
    }

    /* ── press 2: technical support voicemail ── */
    if (stage === 'voicemail_prompt') {
      await upsertCall(base44, callSid, { route: 'voicemail', stage: 'voicemail_prompt' });
      if (!settings.voicemail_enabled) {
        return xmlResponse(
          `<Dial callerId="${e164(settings.public_caller_id)}" answerOnBridge="true" timeout="${Number(settings.support_timeout) || 25}">` +
            `<Number>${e164(settings.support_number)}</Number></Dial>`
        );
      }
      return xmlResponse(
        say(settings.tech_support_prompt) +
          `<Record action="${url('/functions/ivrSupport', { stage: 'voicemail_saved', category })}" method="POST" ` +
          `maxLength="${Number(settings.voicemail_max_seconds) || 180}" timeout="5" playBeep="true" finishOnKey="#" trim="trim-silence"/>` +
          say(supportCfg.voicemailNote) +
          redirect(url('/functions/ivrSupport', { stage: 'voicemail_prompt', category }))
      );
    }

    if (stage === 'voicemail_saved') {
      const recordingUrl = params.RecordingUrl || '';
      const recordingSid = params.RecordingSid || '';
      const duration = Number(params.RecordingDuration || '0');

      if (!recordingUrl) {
        return xmlResponse(
          say('We did not receive a message. Goodbye.') + '<Hangup/>'
        );
      }

      const voicemail = await saveVoicemail(base44, {
        call_sid: callSid,
        caller,
        from,
        to,
        category,
        reason: 'Technical support voicemail',
        recordingUrl,
        recordingSid,
        duration,
      });

      // Technical support record — created for every support voicemail.
      let issue: any = null;
      if (caller && !record?.tech_issue_id) {
        try {
          const existing = await base44.asServiceRole.entities.TechSupportIssue.filter({ call_sid: callSid });
          if (Array.isArray(existing) && existing[0]) {
            issue = existing[0];
          } else {
            issue = await base44.asServiceRole.entities.TechSupportIssue.create({
              issue_id: newId('tsi'),
              call_sid: callSid,
              voicemail_id: voicemail?.voicemail_id || '',
              category: category === 'technical_support' ? 'technical_support' : category,
              summary:
                caller.type === 'media_specialist'
                  ? 'Media Specialist left a technical support voicemail.'
                  : 'Caller left a technical support voicemail.',
              caller_number: e164(from),
              caller_name: caller.name || '',
              caller_email: caller.email || '',
              client_record_id: caller.record_id || '',
              receiving_number: e164(to),
              status: 'open',
              created_at: new Date().toISOString(),
            });
          }
        } catch (e) {
          console.error('[ivrSupport] issue create failed:', (e as Error).message);
        }
      }

      if (voicemail && !voicemail.notified_at && settings.notify_owner_on_voicemail) {
        const sent = await notifyOwner(
          base44,
          settings,
          `Arriv Call Center: new voicemail from ${voicemail.caller_name || voicemail.caller_number} (${String(category).replace('_', ' ')}). ${url('/CallCenter', { tab: 'voicemails' })}`
        );
        if (sent) {
          await base44.asServiceRole.entities.CallVoicemail
            .update(voicemail.id, { notified_at: new Date().toISOString() })
            .catch(() => {});
        }
      }

      // Arriv Assist ticket — only reported as created when Assist confirms it.
      if (issue) {
        const attempt = await attemptAssistTicket(base44, secrets, {
          summary: issue.summary,
          caller_name: issue.caller_name,
          caller_email: issue.caller_email,
          caller_number: issue.caller_number,
          receiving_number: issue.receiving_number,
          category: issue.category,
        });
        try {
          await base44.asServiceRole.entities.TechSupportIssue.update(issue.id, {
            assist_available: !!attempt.available,
            assist_ticket_id: attempt.ticketId || '',
            assist_ticket_number: attempt.ticketNumber || '',
            assist_error: attempt.error || '',
            status: attempt.available ? 'ticket_created' : 'ticket_pending',
            retry_count: Number(issue.retry_count || 0) + 1,
            last_retry_at: new Date().toISOString(),
          });
        } catch (e) {
          console.error('[ivrSupport] issue update failed:', (e as Error).message);
        }

        if (attempt.available && settings.notify_owner_on_ticket) {
          await notifyOwner(
            base44,
            settings,
            `Arriv Call Center: Arriv Assist ticket ${attempt.ticketNumber} created from a technical support call. ${url('/CallCenter', { tab: 'support' })}`
          );
        }
      }

      await upsertCall(base44, callSid, {
        route: 'voicemail',
        stage: 'voicemail_saved',
        outcome: 'voicemail',
        voicemail_id: voicemail?.voicemail_id || '',
        tech_issue_id: issue?.issue_id || '',
      });

      return xmlResponse(
        say(supportCfg.voicemailThanks) + '<Hangup/>'
      );
    }

    return xmlResponse(
      redirect(url('/functions/ivrSupport', { stage: 'root', category, attempt }))
    );
  } catch (error) {
    console.error('[ivrSupport] fatal:', (error as Error).message);
    return xmlResponse(say('A system error occurred.'));
  }
});
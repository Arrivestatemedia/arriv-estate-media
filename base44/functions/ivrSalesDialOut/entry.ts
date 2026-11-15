/**
 * ivrSalesDialOut — a sales representative calls an Arriv access number from
 * their registered cellphone and places business calls through Twilio, showing
 * their assigned Arriv caller ID to the prospect.
 *
 * This is ADDITIVE. The owner dial-out menu, the in-app dialer, public/client
 * routing, voicemail capture and the published IVR configuration are untouched:
 * this function only runs on a number an administrator has pointed at it.
 *
 * Session semantics (verified by live test calls):
 *  - Prospect hangs up  → <Dial action> fires, attempt closes, rep hears the
 *    "dial another number" menu. The session stays alive.
 *  - Rep hangs up       → the parent call's status callback marks the session
 *    ended. A new session needs a new call.
 *  - No answer / busy   → same post-call menu as a hangup.
 *  - No menu input      → the menu repeats once, then the session ends.
 *
 * Every destination gets its own SalesCallAttempt and its own ActivityLog row,
 * so two prospects are never merged into one call record.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { validateTwilioRequest } from '../../shared/twilioWebhookValidation.ts';
import { loadVoiceSettings, checkCallCaps, periodKey } from '../../shared/arrivOneSettings.ts';
import {
  normalizePhone,
  parseExtensionAndNumber,
  checkDestination,
  checkDialOutLine,
  resolveIdentity,
  say,
  gather,
  hangup,
  xml,
  dialTwiml,
  attemptIdFor,
  sessionIdFor,
  withActionUrl,
  DIAL_OUT_DEFAULTS,
} from '../../shared/salesDialOut.ts';

const listOf = (v: any) => (Array.isArray(v) ? v : v?.items || []);
const twiml = (inner: string) => new Response(xml(inner), { headers: { 'Content-Type': 'text/xml' } });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reads immediately after a write can lag briefly behind it. Twilio's real
 * webhooks are seconds apart, but a retry keeps back-to-back stages from
 * creating a second session or losing a call outcome when they arrive together.
 */
async function readWithRetry(read: () => Promise<any>, attempts = 4, delay = 400) {
  for (let i = 0; i < attempts; i++) {
    const rows = listOf(await read().catch(() => []));
    if (rows[0]) return rows[0];
    if (i < attempts - 1) await sleep(delay);
  }
  return null;
}

/**
 * Exact-match read that never passes paging options to the entity layer.
 *
 * A `{ limit }` options object makes these reads come back empty inside a
 * backend function, which is what made a live dial-out session look lost on the
 * second webhook: the session existed, the read just could not see it. Plain
 * queries are returned whole and narrowed here instead.
 */
async function findOne(read: () => Promise<any>) {
  const rows = listOf(await read().catch(() => []));
  return rows[0] || null;
}

/** Recording is never attached to a cellphone sales call, so no disclosure is played. */
const RECORDING_OFF = true;

async function readBody(req: Request) {
  const raw = await req.text();
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(raw)) params[key] = value;
  return { raw, params };
}

async function persistAttempt(base44: any, payload: any, attemptId: string) {
  const existing = await findOne(() =>
    base44.asServiceRole.entities.SalesCallAttempt.filter({ attempt_id: attemptId })
  );
  if (existing) return existing;
  return await base44.asServiceRole.entities.SalesCallAttempt.create({
    attempt_id: attemptId,
    ...payload,
  });
}

/** Write the attempt into the rep's existing CRM activity history. */
async function logAttemptActivity(base44: any, attempt: any, outcomeLabel: string) {
  if (!attempt?.attempt_id) return '';
  const stored = await findOne(() =>
    base44.asServiceRole.entities.SalesCallAttempt.filter({ attempt_id: attempt.attempt_id })
  );
  // Idempotent: one activity row per attempt, even if Twilio re-delivers.
  if (attempt.activity_id || stored?.activity_id) return attempt.activity_id || stored.activity_id;
  const destination = attempt.destination || stored?.destination || '';
  const last10 = String(destination || '').replace(/\D/g, '').slice(-10);
  // Exact-match lookup so a lookup never scans the whole contact table.
  const byNormalized = last10
    ? listOf(
        await base44.asServiceRole.entities.Contact.filter({ phone_normalized: `+1${last10}` }).catch(() => [])
      )
    : [];
  const contact = byNormalized[0] || null;
  const minutes = Math.max(0, Math.round((Number(attempt.duration_seconds || 0) / 60) * 10) / 10);
  const log = await base44.asServiceRole.entities.ActivityLog.create({
    activity_type: 'call',
    contact_name:
      attempt.prospect_name || (contact ? [contact.firstname, contact.lastname].filter(Boolean).join(' ') : '') || destination,
    contact_email: contact?.email || undefined,
    company_name: contact?.company || undefined,
    activity_date: attempt.started_at || new Date().toISOString(),
    notes: `[Cellphone Dial-Out] ${outcomeLabel}`,
    duration_minutes: minutes,
    direction: 'outgoing',
    missed: /no answer|busy|failed/i.test(outcomeLabel),
    sales_member_id: attempt.rep_id,
    sales_member_email: attempt.rep_email,
  });
  await base44.asServiceRole.entities.SalesCallAttempt.updateMany(
    { attempt_id: attempt.attempt_id },
    {
      $set: {
        activity_id: log.id,
        contact_id: contact?.id || stored?.contact_id || '',
        prospect_name:
          attempt.prospect_name ||
          (contact ? [contact.firstname, contact.lastname].filter(Boolean).join(' ') : '') ||
          '',
      },
    }
  ).catch(() => {});
  return log.id;
}

const OUTCOMES: Record<string, string> = {
  completed: 'Call completed',
  'no-answer': 'No answer',
  busy: 'Line busy',
  failed: 'Call failed',
  canceled: 'Call canceled',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { raw, params } = await readBody(req);
    const valid = await validateTwilioRequest(req, raw, 'ivrSalesDialOut');
    if (!valid) {
      console.warn('[ivrSalesDialOut] signature rejected');
      return twiml(say('This request could not be verified.') + hangup());
    }

    const url = new URL(req.url);
    const stage = url.searchParams.get('stage') || 'entry';
    const callSid = params.CallSid || url.searchParams.get('session') || '';
    const from = params.From || params.Caller || '';
    const to = params.To || '';
    const settings = await loadVoiceSettings(base44);
    const appDomain = Deno.env.get('BASE44_APP_DOMAIN') || 'https://arrivestatemedia.base44.app';
    const base = `${appDomain}/functions/ivrSalesDialOut`;
    const voice = 'Polly.Joanna';

    // Session and attempt mutations key off their stable business ids rather than
    // a record id from an earlier read, so a delayed read can never split a
    // session or drop a call outcome.
    const patchSession = (patch: any) =>
      base44.asServiceRole.entities.SalesDialSession.updateMany(
        { session_id: session.session_id },
        { $set: patch }
      ).catch(() => {});
    const patchAttempt = (attemptId: string, patch: any) =>
      attemptId
        ? base44.asServiceRole.entities.SalesCallAttempt.updateMany({ attempt_id: attemptId }, { $set: patch }).catch(() => {})
        : Promise.resolve();

    // --- parent call status: the rep hung up, so the whole session ends -------
    // Keyed by CallSid so it works even if no read has caught up yet.
    if (stage === 'status') {
      const sessionId = url.searchParams.get('session') || sessionIdFor(callSid);
      const ended = params.CallStatus === 'completed' || params.CallStatus === 'busy'
        || params.CallStatus === 'failed' || params.CallStatus === 'no-answer';
      if (ended) {
        await base44.asServiceRole.entities.SalesDialSession.updateMany(
          { parent_call_sid: callSid },
          { $set: { status: 'ended', ended_at: new Date().toISOString(), termination_reason: 'rep_hangup' } }
        ).catch(() => {});
        await base44.asServiceRole.entities.SalesDialSession.updateMany(
          { session_id: sessionId },
          { $set: { status: 'ended', ended_at: new Date().toISOString(), termination_reason: 'rep_hangup' } }
        ).catch(() => {});
        // Close any attempt left open by a rep hang-up mid-call.
        await base44.asServiceRole.entities.SalesCallAttempt.updateMany(
          { session_id: sessionId, status: { $in: ['ringing', 'in_progress'] } },
          { $set: { status: 'completed', ended_at: new Date().toISOString(), disconnect_reason: 'rep_hangup' } }
        ).catch(() => {});
      }
      return new Response('', { status: 204 });
    }

    // --- prospect leg status: keep the attempt's state honest ----------------
    if (stage === 'attemptStatus') {
      const attemptId = url.searchParams.get('attempt') || '';
      if (attemptId) {
        const attempt = listOf(
          await base44.asServiceRole.entities.SalesCallAttempt.filter({ attempt_id: attemptId }).catch(() => [])
        )[0];
        const statusMap: Record<string, string> = {
          initiated: 'ringing',
          ringing: 'ringing',
          'in-progress': 'in_progress',
          answered: 'in_progress',
          completed: 'completed',
          busy: 'busy',
          'no-answer': 'no_answer',
          failed: 'failed',
        };
        const mapped = statusMap[params.CallStatus || ''];
        if (attempt && mapped) {
          await base44.asServiceRole.entities.SalesCallAttempt.update(attempt.id, { status: mapped }).catch(() => {});
        }
      }
      return new Response('', { status: 204 });
    }

    // These calls are never recorded, so no disclosure is played.
    if (stage === 'disclosure') {
      return twiml(say('', voice));
    }

    // --- resolve who is calling ---------------------------------------------
    const resolved = await resolveIdentity(base44, from);
    if (!resolved) {
      await base44.asServiceRole.entities.IvrAuditLog.create({
        action: 'sales_dial_out_rejected',
        target_type: 'sales_phone_identity',
        target_key: normalizePhone(from) || String(from),
        summary: 'Unregistered number attempted sales dial-out',
        at: new Date().toISOString(),
      }).catch(() => {});
      return twiml(
        say('This number is not registered for Arriv sales dial out. Please contact your administrator.') + hangup()
      );
    }

    const { identity, member } = resolved;
    if (!member || member.is_active === false) {
      return twiml(say('This sales account is not active. Please contact your administrator.') + hangup());
    }

    // The session belongs to one individual Media Partner line. The number that
    // was dialed must be that partner's own assigned number on both the employee
    // account and the telephony identity — a redirect alone proves nothing.
    const lineError = checkDialOutLine(url.searchParams.get('line') || to, member, identity);
    if (lineError) {
      await base44.asServiceRole.entities.IvrAuditLog.create({
        action: 'sales_dial_out_wrong_line',
        target_type: 'sales_phone_identity',
        target_key: identity.id,
        summary: `${lineError} (dialed ${to || 'unknown'})`,
        at: new Date().toISOString(),
      }).catch(() => {});
      return twiml(say(lineError) + hangup());
    }
    if (identity.telephony_status !== 'active') {
      await base44.asServiceRole.entities.IvrAuditLog.create({
        action: 'sales_dial_out_blocked',
        target_type: 'sales_phone_identity',
        target_key: identity.id,
        summary: `Dial-out blocked — telephony status ${identity.telephony_status}`,
        at: new Date().toISOString(),
      }).catch(() => {});
      return twiml(say('Sales dial out is not active for your account yet. Please contact your administrator.') + hangup());
    }
    if (!identity.extension) {
      return twiml(say('No extension has been assigned to your account yet. Please contact your administrator.') + hangup());
    }
    if (!identity.caller_id_number) {
      return twiml(say('No Arriv business caller ID has been assigned to you yet. Please contact your administrator.') + hangup());
    }

    // One session per inbound call. Later stages carry the deterministic session
    // id in the URL, so a session is never re-created because a read lagged.
    const requestedSession = url.searchParams.get('session') || '';
    const deterministicSessionId = requestedSession || sessionIdFor(callSid);
    let session = await readWithRetry(() =>
      requestedSession
        ? base44.asServiceRole.entities.SalesDialSession.filter({ session_id: requestedSession })
        : base44.asServiceRole.entities.SalesDialSession.filter({ parent_call_sid: callSid })
    );
    // A continuation may arrive before the session row is readable by id. Retry
    // once on the call it belongs to, so a bookkeeping read never drops the rep
    // back to a dead line mid-session.
    if (!session && requestedSession && callSid) {
      session = await readWithRetry(() =>
        base44.asServiceRole.entities.SalesDialSession.filter({ parent_call_sid: callSid })
      );
    }
    if (!session && callSid && !requestedSession) {
      session = await base44.asServiceRole.entities.SalesDialSession.create({
        session_id: sessionIdFor(callSid),
        rep_id: member.id,
        rep_name: member.full_name || '',
        rep_email: member.email || '',
        parent_call_sid: callSid,
        access_number: to,
        cellphone: identity.cellphone,
        status: 'active',
        attempt_count: 0,
        call_sids: [],
        started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      });
      await base44.asServiceRole.entities.SalesPhoneIdentity.update(identity.id, {
        last_session_at: new Date().toISOString(),
      }).catch(() => {});
    }
    // The caller has already been authorised above (registered cellphone, active
    // identity, own line, active telephony status). If the session row still
    // cannot be read, rebuild it for this same call rather than stranding the
    // rep in silence — the session is bookkeeping for caps and attempt
    // accounting, never the authorisation itself.
    if (!session && callSid) {
      console.warn('[ivrSalesDialOut] session row unreadable — rebuilding for', callSid);
      session = await base44.asServiceRole.entities.SalesDialSession.create({
        session_id: sessionIdFor(callSid),
        rep_id: member.id,
        rep_name: member.full_name || '',
        rep_email: member.email || '',
        parent_call_sid: callSid,
        access_number: to,
        cellphone: identity.cellphone,
        status: 'active',
        attempt_count: 0,
        call_sids: [],
        started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      }).catch(() => null);
    }
    if (!session) {
      return twiml(say('This dial session is no longer available. Please call your line again.') + hangup());
    }
    if (session.rep_id && session.rep_id !== member.id) {
      return twiml(say('This dial session does not belong to your account.') + hangup());
    }
    if (callSid && session.parent_call_sid && session.parent_call_sid !== callSid) {
      return twiml(say('This dial session has ended. Please call your line again.') + hangup());
    }
    if (session.status !== 'active') {
      return twiml(say('This dial session has ended. Please call the access number again.') + hangup());
    }
    await patchSession({
      last_activity_at: new Date().toISOString(),
    }).catch(() => {});

    const entryAction = withActionUrl(base, { stage: 'dial', session: session.session_id });
    const menuAction = withActionUrl(base, { stage: 'choice', session: session.session_id });

    // --- the rep's menu ------------------------------------------------------
    if (stage === 'entry' || stage === 'menu') {
      const digitsSoFar = String(params.Digits || '');
      if (digitsSoFar === '2') {
        return twiml(
          say(
            'Your voicemail messages are available in Arriv One under Call Center, Voicemails. To place a call, press 1.',
            voice
          ) + gather(menuAction, settings.dial_out_menu_text, { voice })
        );
      }
      if (digitsSoFar === '1') {
        return twiml(gather(entryAction, settings.dial_out_prompt, { voice, timeout: DIAL_OUT_DEFAULTS.entry_timeout }));
      }
      if (digitsSoFar) {
        return twiml(
          say("Sorry, that wasn't a valid choice.", voice) + gather(menuAction, settings.dial_out_menu_text, { voice })
        );
      }
      return twiml(
        `${gather(menuAction, settings.dial_out_menu_text, { voice })}${say(
          'We did not receive any input. Goodbye.',
          voice
        )}${hangup()}`
      );
    }

    // --- menu choice after a call -------------------------------------------
    if (stage === 'choice') {
      const choice = String(params.Digits || '');
      if (choice === '1') {
        return twiml(gather(entryAction, settings.dial_out_prompt, { voice, timeout: DIAL_OUT_DEFAULTS.entry_timeout }));
      }
      await patchSession({
        status: 'ended',
        ended_at: new Date().toISOString(),
        termination_reason: 'rep_ended',
      }).catch(() => {});
      return twiml(say('Session ended. Thank you.', voice) + hangup());
    }

    // --- parse extension + destination --------------------------------------
    if (stage === 'dial') {
      const entered = String(params.Digits || '');
      const parsed = parseExtensionAndNumber(entered);

      if (parsed.error || parsed.extension !== String(identity.extension)) {
        await base44.asServiceRole.entities.IvrAuditLog.create({
          action: 'sales_dial_out_bad_extension',
          target_type: 'sales_phone_identity',
          target_key: identity.id,
          summary: `Entered extension ${parsed.extension || '(none)'} did not match the registered rep`,
          at: new Date().toISOString(),
        }).catch(() => {});
        return twiml(
          say(settings.dial_out_bad_entry_text, voice) + gather(entryAction, settings.dial_out_prompt, { voice })
        );
      }

      const policyError = checkDestination(parsed.destination, settings);
      if (policyError) {
        return twiml(say(policyError, voice) + gather(entryAction, settings.dial_out_prompt, { voice }));
      }

      if (Number(session.attempt_count || 0) >= DIAL_OUT_DEFAULTS.max_attempts_per_session) {
        await patchSession({
          status: 'expired',
          ended_at: new Date().toISOString(),
          termination_reason: 'attempt_cap',
        }).catch(() => {});
        return twiml(say('This session has reached its call limit. Please call again later.', voice) + hangup());
      }

      const capError = checkCallCaps(identity, settings, 1);
      if (capError) {
        await patchSession({
          status: 'ended',
          ended_at: new Date().toISOString(),
          termination_reason: 'cap_reached',
        }).catch(() => {});
        return twiml(say(capError, voice) + hangup());
      }

      // Recording is off for cellphone sales calling, so there is no consent gate
      // and no recording instruction is ever attached to the prospect leg.
      const finalDestination = normalizePhone(url.searchParams.get('dest') || '') || parsed.destination;
      const consentValue = 'not_asked';

      const index = Number(session.attempt_count || 0) + 1;
      const attemptId = attemptIdFor(callSid, index);
      const attempt = await persistAttempt(base44, {
        session_id: session.session_id,
        rep_id: member.id,
        rep_name: member.full_name || '',
        rep_email: member.email || '',
        destination: finalDestination,
        from_number: identity.caller_id_number,
        call_method: 'cell_ivr',
        status: 'ringing',
        started_at: new Date().toISOString(),
        recording_consent: consentValue,
      }, attemptId);

      await patchSession({
        attempt_count: index,
        call_sids: [...(session.call_sids || []), attemptId],
        last_activity_at: new Date().toISOString(),
      }).catch(() => {});

      const afterAction = withActionUrl(base, {
        stage: 'after',
        session: session.session_id,
        attempt: attemptId,
        dest: finalDestination,
      });
      const attemptStatusUrl = withActionUrl(base, {
        stage: 'attemptStatus',
        session: session.session_id,
        attempt: attemptId,
      });

      return twiml(
        dialTwiml({
          destination: finalDestination,
          callerId: identity.caller_id_number,
          actionUrl: afterAction,
          statusCallbackUrl: attemptStatusUrl,
          // Ring timeout only. Connected-call length is governed by the daily and
          // monthly usage caps, never by the per-call setting.
          timeoutSeconds: 35,
          record: '',
        })
      );
    }

    // --- post-call: prospect hung up, or never answered ----------------------
    if (stage === 'after') {
      let attemptId = url.searchParams.get('attempt') || '';
      const dialStatus = params.DialCallStatus || 'completed';
      const duration = Number(params.DialCallDuration || 0);
      let attempts = listOf(
        await base44.asServiceRole.entities.SalesCallAttempt.filter({ attempt_id: attemptId }).catch(() => [])
      );
      if (!attempts[0]) {
        // Fall back to this session's most recent open attempt rather than
        // silently losing the call outcome.
        const sessionAttempts = listOf(
          await base44.asServiceRole.entities.SalesCallAttempt.filter(
            { session_id: session.session_id }
          ).catch(() => [])
        );
        attempts = sessionAttempts.filter((a: any) => ['ringing', 'in_progress'].includes(a.status)).slice(0, 1);
        if (attempts[0]) attemptId = attempts[0].attempt_id;
      }
      const attempt = attempts[0];
      if (attemptId) {
        const mapped =
          dialStatus === 'completed' ? (duration > 0 ? 'answered' : 'completed')
          : dialStatus === 'no-answer' ? 'no_answer'
          : dialStatus === 'busy' ? 'busy'
          : dialStatus === 'failed' ? 'failed'
          : 'completed';
        await patchAttempt(attemptId, {
          status: mapped,
          ended_at: new Date().toISOString(),
          duration_seconds: duration,
          dial_call_status: dialStatus,
          disconnect_reason: dialStatus,
        });
        await logAttemptActivity(
          base44,
          {
            attempt_id: attemptId,
            destination: attempt?.destination || normalizePhone(url.searchParams.get('dest') || ''),
            rep_id: member.id,
            rep_name: member.full_name || '',
            rep_email: member.email || '',
            started_at: attempt?.started_at || new Date(Date.now() - duration * 1000).toISOString(),
            duration_seconds: duration,
            prospect_name: attempt?.prospect_name || '',
            contact_id: attempt?.contact_id || '',
            activity_id: attempt?.activity_id || '',
          },
          OUTCOMES[dialStatus] || 'Call ended'
        );
        await patchSession({
          minutes_used: Math.round((Number(session.minutes_used || 0) + duration / 60) * 10) / 10,
          last_activity_at: new Date().toISOString(),
        }).catch(() => {});
        // Usage is accounted to the partner who placed the call, resetting the
        // monthly counter when the calendar month changes.
        const key = periodKey();
        const usedBefore = identity.period_key === key ? Number(identity.minutes_used_this_period || 0) : 0;
        await base44.asServiceRole.entities.SalesPhoneIdentity.update(identity.id, {
          minutes_used_this_period: Math.round((usedBefore + duration / 60) * 10) / 10,
          period_key: key,
        }).catch(() => {});
      }
      return twiml(
        `${gather(menuAction, settings.dial_out_after_text, { voice })}${say(
          'We did not receive any input. Ending this session. Goodbye.',
          voice
        )}${hangup()}`
      );
    }

    // --- recording callback (Twilio) ----------------------------------------
    if (stage === 'recordingStatus') {
      const attemptId = url.searchParams.get('attempt') || '';
      const recordingSid = params.RecordingSid || '';
      const recordingUrl = params.RecordingUrl || '';
      if (attemptId && recordingUrl) {
        await patchAttempt(attemptId, {
          recording_sid: recordingSid,
          recording_status: 'requested',
        });
        // Full ingest (download → private storage → transcription → summary) runs
        // in arrivOneRecordingCallback so a slow transcription never delays Twilio.
        await base44.functions.invoke('arrivOneRecordingCallback', {
          attempt_id: attemptId,
          recording_sid: recordingSid,
          recording_url: recordingUrl,
          duration: Number(params.RecordingDuration || 0),
        }).catch((error: any) => console.error('[ivrSalesDialOut] recording invoke failed', error?.message));
      }
      return new Response('', { status: 204 });
    }

    if (stage === 'end') {
      await patchSession({
        status: 'ended',
        ended_at: new Date().toISOString(),
        termination_reason: 'rep_ended',
      }).catch(() => {});
      return twiml(say('Session ended. Thank you.', voice) + hangup());
    }

    return twiml(say('Unexpected call state. Goodbye.', voice) + hangup());
  } catch (error: any) {
    console.error('ivrSalesDialOut failed:', error);
    return twiml(say('We could not complete that. Please try again shortly.') + hangup());
  }
});
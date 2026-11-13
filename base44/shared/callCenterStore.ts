/**
 * Call center records and owner alerts.
 *
 * Every phone event is written once, keyed on the Twilio identifiers, so a
 * redelivered webhook never produces a second call log, callback, voicemail or
 * support case. Records are written before any notification is attempted: a
 * failed text never loses the caller's request.
 */

import { normalizeE164, displayNumber } from './phoneNumber.ts';

function asArray(result: any): any[] {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  return Array.isArray(result.items) ? result.items : [];
}

export function callId(prefix: string): string {
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}

export async function getCall(base44: any, callSid: string) {
  if (!callSid) return null;
  try {
    return asArray(await base44.asServiceRole.entities.InboundCall.filter({ call_sid: callSid }, { limit: 1 }))[0] || null;
  } catch (_) {
    return null;
  }
}

async function ensureCall(base44: any, callSid: string, seed: any) {
  let record = await getCall(base44, callSid);
  if (record) return record;
  try {
    record = await base44.asServiceRole.entities.InboundCall.create({
      call_sid: callSid,
      from_number: normalizeE164(seed.from) || String(seed.from || ''),
      to_number: normalizeE164(seed.to) || String(seed.to || ''),
      caller_type: seed.caller_type || 'unknown',
      caller_name: seed.caller_name || '',
      caller_email: seed.caller_email || '',
      related_job_id: seed.related_job_id || '',
      related_signup_id: seed.related_signup_id || '',
      related_contact_id: seed.related_contact_id || '',
      related_organization_id: seed.related_organization_id || '',
      route: seed.route || 'unknown',
      stage: seed.stage || '',
      menu_path: seed.digit ? [String(seed.digit)] : [],
      outcome: 'in_progress',
      started_at: new Date().toISOString(),
      events: [{ type: 'call_started', at: new Date().toISOString(), note: seed.route || '' }],
    });
  } catch (error) {
    console.error('InboundCall create failed:', (error as Error).message);
    return null;
  }
  return record;
}

/**
 * Records the path a call took. Called at each decision point so the Call Center
 * can show the route actually taken, not a reconstruction.
 */
export async function trackCall(
  base44: any,
  callSid: string,
  seed: any,
  patch: {
    route?: string;
    stage?: string;
    digit?: string;
    outcome?: string;
    dial_status?: string;
    event?: string;
    extra?: Record<string, any>;
    caller?: any;
  } = {}
) {
  if (!callSid) return null;
  const record = await ensureCall(base44, callSid, seed);
  if (!record) return null;

  // Repeat deliveries of the same step must not grow the trail endlessly.
  const events = Array.isArray(record.events) ? [...record.events] : [];
  if (patch.event) {
    const note = `${patch.event}${patch.dial_status ? `:${patch.dial_status}` : ''}`;
    const duplicate = events.some(
      (entry: any) =>
        entry?.type === patch.event &&
        entry?.note === (patch.dial_status || '') &&
        entry?.stage === patch.stage
    );
    if (!duplicate) {
      events.push({
        type: patch.event,
        at: new Date().toISOString(),
        note: patch.dial_status || '',
        ...(patch.stage ? { stage: patch.stage } : {}),
      } as any);
    }
  }

  const menuPath = Array.isArray(record.menu_path) ? [...record.menu_path] : [];
  if (patch.digit && menuPath[menuPath.length - 1] !== String(patch.digit)) {
    menuPath.push(String(patch.digit));
  }

  const data: Record<string, any> = {
    events,
    menu_path: menuPath.slice(-40),
  };
  if (patch.route) data.route = patch.route;
  if (patch.stage !== undefined) data.stage = patch.stage;
  if (patch.outcome) data.outcome = patch.outcome;
  if (patch.dial_status) data.dial_status = patch.dial_status;
  if (patch.extra) Object.assign(data, patch.extra);
  if (patch.caller) {
    data.caller_type = patch.caller.type === 'growth_advisor' ? 'media_specialist' : patch.caller.type;
    data.caller_name = patch.caller.name || record.caller_name || '';
    data.caller_email = patch.caller.email || record.caller_email || '';
    data.related_signup_id = patch.caller.signup_id || record.related_signup_id || '';
    data.related_contact_id = patch.caller.contact_id || record.related_contact_id || '';
    data.related_organization_id = patch.caller.organization_id || record.related_organization_id || '';
  }

  try {
    return await base44.asServiceRole.entities.InboundCall.update(record.id, data);
  } catch (error) {
    console.error('InboundCall update failed:', (error as Error).message);
    return record;
  }
}

/** Turns Twilio's DialCallStatus into a call outcome. */
export function outcomeForDial(dialStatus: string): 'answered' | 'missed' | 'abandoned' | 'in_progress' {
  const status = String(dialStatus || '').toLowerCase();
  if (status === 'completed') return 'answered';
  if (status === 'no-answer' || status === 'busy' || status === 'failed') return 'missed';
  if (status === 'canceled') return 'abandoned';
  return 'in_progress';
}

export async function createCallbackOnce(
  base44: any,
  input: {
    callSid: string;
    from: string;
    to: string;
    name?: string;
    reason?: string;
    category?: string;
    source?: string;
    caller?: any;
    assigned?: { email?: string; name?: string; member_id?: string } | null;
    notes?: string;
  }
) {
  if (input.callSid) {
    const existing = asArray(
      await base44.asServiceRole.entities.CallbackRequest.filter({ call_sid: input.callSid }, { limit: 1 })
    )[0];
    if (existing) return { created: false, record: existing };
  }

  const record = await base44.asServiceRole.entities.CallbackRequest.create({
    callback_id: callId('cb'),
    name: input.name || input.caller?.name || '',
    phone: normalizeE164(input.from) || String(input.from || ''),
    reason: input.reason || '',
    category: input.category || 'general',
    source: input.caller?.type === 'media_specialist' || input.caller?.type === 'growth_advisor'
      ? 'media_specialist'
      : input.caller?.type === 'client'
      ? 'client'
      : input.caller?.type === 'b2b_client'
      ? 'b2b_client'
      : 'unknown',
    call_sid: input.callSid || '',
    received_on_number: normalizeE164(input.to) || String(input.to || ''),
    related_signup_id: input.caller?.signup_id || '',
    related_contact_id: input.caller?.contact_id || '',
    related_organization_id: input.caller?.organization_id || '',
    assigned_to_email: input.assigned?.email || '',
    assigned_to_name: input.assigned?.name || '',
    assigned_to_member_id: input.assigned?.member_id || '',
    status: 'pending',
    priority: 'normal',
    notes: input.notes || '',
    requested_at: new Date().toISOString(),
  });
  return { created: true, record };
}

export async function createVoicemailOnce(
  base44: any,
  input: {
    callSid: string;
    recordingSid: string;
    recordingUrl: string;
    duration: number;
    from: string;
    to: string;
    caller?: any;
    category: string;
    relatedJobId?: string;
  }
) {
  if (input.recordingSid) {
    const existing = asArray(
      await base44.asServiceRole.entities.VoicemailMessage.filter(
        { recording_sid: input.recordingSid },
        { limit: 1 }
      )
    )[0];
    if (existing) return { created: false, record: existing };
  }

  const record = await base44.asServiceRole.entities.VoicemailMessage.create({
    voicemail_id: callId('vm'),
    recording_sid: input.recordingSid || '',
    recording_url: input.recordingUrl || '',
    recording_duration: Number(input.duration || 0),
    call_sid: input.callSid || '',
    from_number: normalizeE164(input.from) || String(input.from || ''),
    received_on_number: normalizeE164(input.to) || String(input.to || ''),
    caller_name: input.caller?.name || '',
    caller_type:
      input.caller?.type === 'growth_advisor' ? 'media_specialist' : input.caller?.type || 'unknown',
    category: input.category || 'general',
    related_signup_id: input.caller?.signup_id || '',
    related_contact_id: input.caller?.contact_id || '',
    related_organization_id: input.caller?.organization_id || '',
    related_job_id: input.relatedJobId || input.caller?.job_id || '',
    status: 'new',
    created_at: new Date().toISOString(),
  });
  return { created: true, record };
}

export async function createSupportCase(
  base44: any,
  input: {
    callSid: string;
    voicemailId: string;
    from: string;
    to: string;
    caller?: any;
    issueCategory?: string;
    summary?: string;
  }
) {
  const record = await base44.asServiceRole.entities.SupportCase.create({
    case_id: callId('sc'),
    call_sid: input.callSid || '',
    voicemail_id: input.voicemailId || '',
    from_number: normalizeE164(input.from) || String(input.from || ''),
    received_on_number: normalizeE164(input.to) || String(input.to || ''),
    caller_name: input.caller?.name || '',
    caller_type: input.caller?.type === 'growth_advisor'
      ? 'media_specialist'
      : input.caller?.type === 'owner'
      ? 'unknown'
      : input.caller?.type || 'unknown',
    issue_category: input.issueCategory || 'other',
    summary: input.summary || '',
    related_contact_id: input.caller?.contact_id || '',
    related_organization_id: input.caller?.organization_id || '',
    status: 'pending_ticket',
    submission_attempts: 0,
    created_at: new Date().toISOString(),
  });
  return record;
}

/**
 * Owner SMS alert. Sends through the existing Twilio account only, and never
 * includes voicemail contents or account details.
 */
export async function notifyOwner(base44: any, settings: any, message: string) {
  if (settings?.notifications?.owner_sms === false) return { sent: false, reason: 'DISABLED' };

  const to =
    normalizeE164(settings?.notifications?.notification_number) ||
    normalizeE164(Deno.env.get('OWNER_PHONE_NUMBER')) ||
    '';
  const from =
    normalizeE164(Deno.env.get('TWILIO_CALLING_PHONE_NUMBER')) ||
    normalizeE164(Deno.env.get('TWILIO_PHONE_NUMBER')) ||
    '';
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');

  if (!to || !from || !accountSid || !authToken) {
    return { sent: false, reason: 'TWILIO_NOT_CONFIGURED' };
  }

  try {
    const body = new URLSearchParams({ To: to, From: from, Body: message.slice(0, 480) });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      console.error('Owner alert failed:', error?.message || res.status);
      return { sent: false, reason: error?.message || `HTTP ${res.status}` };
    }
    return { sent: true };
  } catch (error) {
    console.error('Owner alert error:', (error as Error).message);
    return { sent: false, reason: (error as Error).message };
  }
}

export function labelForCaller(caller: any): string {
  if (!caller) return 'Caller';
  if (caller.name) return caller.name;
  return displayNumber(caller.from) || 'Caller';
}
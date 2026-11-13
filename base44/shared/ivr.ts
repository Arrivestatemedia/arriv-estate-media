/**
 * Shared call-center / IVR engine for Arriv Estate Media.
 *
 * Used by ivrRouter, ivrSupport, ivrSalesRing, ivrAshley, ivrCallEvents and
 * callCenterAdmin. Nothing here changes the protected routing that already
 * lives in twilioVoiceHandler.
 */

import { ivrVoiceReady, ivrVoiceUrl } from './ivrVoice.ts';

export const APP_BASE = 'https://arrivestatemedia.base44.app';
export const LINE_855 = '+18557654306';
export const LINE_706 = '+17069128967';
export const OWNER_FALLBACK = '+14047891107';

const BRAND_VOICE = 'Polly.Joanna';

/* ───────────────────────── numbers ───────────────────────── */

export function norm(value: unknown): string {
  if (!value) return '';
  let d = String(value).replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length === 10 ? d : '';
}

export function e164(value: unknown): string {
  const d = norm(value);
  return d ? `+1${d}` : '';
}

export function receivingLine(to: unknown): string {
  const n = norm(to);
  if (n === norm(LINE_855)) return '855';
  if (n === norm(LINE_706)) return '706';
  return n ? 'other' : '';
}

/* ───────────────────────── TwiML ───────────────────────── */

export function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * The brand is rendered "Arriv" everywhere, but every spoken line must sound
 * like "Arrive". Applied at speech time only — stored text keeps the spelling.
 */
export function speakable(text: unknown): string {
  return String(text ?? '').replace(/\bArriv\b/gi, 'Arrive');
}

/**
 * One spoken line. With an ElevenLabs voice configured the line is served as
 * audio from ivrVoice; otherwise Twilio's own voice speaks it. Nothing about
 * the surrounding menu, digits or routing depends on which one is used.
 */
export function say(text: unknown, voice = BRAND_VOICE): string {
  const spoken = speakable(text);
  if (ivrVoiceReady()) {
    return `<Play>${escapeXml(ivrVoiceUrl(APP_BASE, spoken))}</Play>`;
  }
  return `<Say voice="${voice}">${escapeXml(spoken)}</Say>`;
}

export function xmlResponse(body: string, status = 200): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

export function redirect(target: string): string {
  return `<Redirect method="POST">${escapeXml(target)}</Redirect>`;
}

export function hangup(): string {
  return '<Hangup/>';
}

export function url(path: string, params: Record<string, string | number | undefined> = {}): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const query = qs.toString();
  return `${APP_BASE}${path}${query ? `?${query}` : ''}`;
}

export function gatherTag(opts: {
  action: string;
  text?: string;
  numDigits?: number;
  input?: string;
  timeout?: number;
  speechTimeout?: string;
  hints?: string;
  language?: string;
}): string {
  const attrs = [
    opts.input ? `input="${opts.input}"` : '',
    opts.numDigits ? `numDigits="${opts.numDigits}"` : '',
    `action="${escapeXml(opts.action)}"`,
    'method="POST"',
    `timeout="${opts.timeout ?? 6}"`,
    opts.speechTimeout ? `speechTimeout="${opts.speechTimeout}"` : '',
    opts.hints ? `hints="${escapeXml(opts.hints)}"` : '',
    opts.language ? `language="${opts.language}"` : '',
    opts.numDigits ? 'finishOnKey=""' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return `<Gather ${attrs}>${opts.text ? say(opts.text) : ''}</Gather>`;
}

/* ───────────────────────── request parsing ───────────────────────── */

export async function parseCall(req: Request) {
  const raw = await req.text();
  let params: Record<string, string> = {};
  try {
    if (raw.trim().startsWith('{')) {
      const json = JSON.parse(raw);
      params = Object.fromEntries(
        Object.entries(json).map(([k, v]) => [k, v == null ? '' : String(v)])
      );
    } else {
      params = Object.fromEntries(new URLSearchParams(raw));
    }
  } catch (_) {
    params = {};
  }
  const query = new URL(req.url).searchParams;
  return { raw, params, query };
}

/* ───────────────────────── settings ───────────────────────── */

export const DEFAULT_SETTINGS = {
  settings_key: 'default',
  sales_rep_member_ids: [] as string[],
  stage1_timeout: 18,
  stage2_timeout: 18,
  stage3_timeout: 20,
  owner_fallback_number: OWNER_FALLBACK,
  support_number: OWNER_FALLBACK,
  support_timeout: 25,
  public_caller_id: LINE_855,
  agent_acceptance_required: false,
  ashley_enabled: true,
  ashley_max_turns: 12,
  ashley_booking_enabled: true,
  callback_assignment: 'owner',
  greeting_specialist: 'Hi {first_name}, thank you for being the best part of Arriv. How can we help you today?',
  greeting_client: 'Hi {first_name}, thank you for being the best part of Arriv. How can we help you today?',
  greeting_prospect: 'Hi {first_name}, thank you for calling Arriv Estate Media. Please hold for {rep_name}.',
  greeting_public:
    'Thank you for calling Arriv Estate Media. To book media for your property, press 1. For assistance signing up or booking through our portal, press 2.',
  support_overflow_text:
    "Thank you for calling Arriv. Unfortunately, we're experiencing a high call volume. Please press 1 to request a callback or press 2 to leave a voicemail.",
  tech_support_prompt:
    "Sorry for the issues you're experiencing. Please leave a detailed message explaining what you're trying to accomplish, and we'll get back with you as soon as possible.",
  sales_unavailable_text: 'One moment while we connect you.',
  voicemail_enabled: true,
  voicemail_max_seconds: 180,
  notify_owner_on_voicemail: true,
  notify_owner_on_callback: true,
  notify_owner_on_ticket: true,
  notify_number: '',
};

export async function loadSettings(base44: any) {
  try {
    const rows = await base44.asServiceRole.entities.CallCenterSetting.filter({ settings_key: 'default' });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row) return { ...DEFAULT_SETTINGS, ...row };
  } catch (e) {
    console.error('[ivr] settings load failed:', e?.message);
  }
  return { ...DEFAULT_SETTINGS };
}

/* ───────────────────────── caller recognition ───────────────────────── */

export type Caller = {
  type: 'owner_admin' | 'media_specialist' | 'client' | 'b2b_client' | 'prospect' | 'public' | 'unknown';
  name: string;
  first_name: string;
  email: string;
  record_id: string;
  record_source: string;
  assigned_rep: any;
};

function emptyCaller(): Caller {
  return {
    type: 'public',
    name: '',
    first_name: '',
    email: '',
    record_id: '',
    record_source: '',
    assigned_rep: null,
  };
}

function firstFrom(name: string) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

/**
 * True when a stored value is something a person can actually be greeted by.
 * A phone number, a digits-only string or an empty value is never spoken as a
 * name — the greeting drops the name instead.
 */
export function isSpeakableName(value: string): boolean {
  const v = String(value || '').trim();
  if (!v) return false;
  return /[A-Za-z\u00C0-\u024F]/.test(v);
}

/** First candidate that is a real spoken name, otherwise ''. */
function speakableFirst(...candidates: any[]) {
  for (const candidate of candidates) {
    const first = firstFrom(candidate);
    if (isSpeakableName(first)) return first;
  }
  return '';
}

/** Phone spellings a stored record may use for the same number. */
function phoneVariants(from: string): string[] {
  const d = norm(from);
  if (!d) return [];
  return [`+1${d}`, d, `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`, `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`];
}

async function matchByPhone(entity: any, from: string, extra: Record<string, string> = {}) {
  const variants = phoneVariants(from);
  for (const phone of variants) {
    try {
      const rows = await entity.filter({ ...extra, phone_number: phone });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row) return row;
    } catch (_) {
      /* try next spelling */
    }
    try {
      const rows = await entity.filter({ ...extra, phone: phone });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row) return row;
    } catch (_) {
      /* try next spelling */
    }
  }
  return null;
}

/**
 * Every CRM contact carrying this number, across the spellings a record may
 * use. A caller can legitimately have more than one record (older dialer
 * logging created one per call), so recognition has to look at all of them
 * instead of taking whichever row the database happens to return first.
 */
async function contactsForNumber(base44: any, from: string) {
  const found: any[] = [];
  const seen = new Set<string>();
  for (const phone of phoneVariants(from)) {
    try {
      const rows = await base44.asServiceRole.entities.Contact.filter({ phone });
      for (const row of Array.isArray(rows) ? rows : []) {
        if (row?.id && !seen.has(row.id)) {
          seen.add(row.id);
          found.push(row);
        }
      }
    } catch (_) {
      /* try next spelling */
    }
  }
  return found;
}

/**
 * How much a record is worth trusting for recognition. A real name beats a
 * placeholder record named after the phone number, an explicit Growth Advisor
 * beats none, and the rep who added the contact (owner) still counts.
 */
function contactRank(contact: any): number {
  const named =
    isSpeakableName(contact?.firstname) || isSpeakableName(contact?.full_name) ? 10 : 0;
  const assigned = contact?.sales_member_id ? 4 : 0;
  const owned = contact?.owner_id ? 2 : 0;
  const enriched = contact?.email ? 1 : 0;
  return named + assigned + owned + enriched;
}

function contactTimestamp(contact: any): number {
  return Date.parse(contact?.updated_date || contact?.created_date || '') || 0;
}

/**
 * The single CRM contact recognition should treat as this caller: the best
 * ranked record, newest first on a tie. Deterministic for the same data.
 */
async function bestContactForNumber(base44: any, from: string) {
  const rows = await contactsForNumber(base44, from);
  if (!rows.length) return null;
  return rows.sort(
    (a, b) => contactRank(b) - contactRank(a) || contactTimestamp(b) - contactTimestamp(a)
  )[0];
}

function authorisedNumbers(): string[] {
  return [Deno.env.get('OWNER_PHONE_NUMBER'), Deno.env.get('ADMIN_PHONE'), Deno.env.get('BRADLEY_PHONE')]
    .filter(Boolean)
    .map((n) => norm(n))
    .filter(Boolean);
}

const PROSPECT_STAGES = ['subscriber', 'lead', 'mql', 'sql', 'opportunity'];
const PROSPECT_STATUSES = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'OPEN_DEAL',
  'ATTEMPTED_TO_CONTACT',
  'CONNECTED',
  'BAD_TIMING',
  'UNQUALIFIED',
];

/**
 * A CRM contact is a sales prospect only when the record itself says so.
 * A contact with no lifecycle stage and no lead status keeps the existing
 * client treatment, so no existing caller's experience changes.
 */
function looksLikeProspect(contact: any): boolean {
  const stage = String(contact?.lifecycle_stage || '').trim().toLowerCase();
  const status = String(contact?.lead_status || '').trim().toUpperCase();
  if (stage === 'customer') return false;
  return PROSPECT_STAGES.includes(stage) || PROSPECT_STATUSES.includes(status);
}

/**
 * Identify the caller from existing profile records only.
 * Recognition never unlocks account actions — it only selects the greeting.
 */
export async function recognizeCaller(base44: any, from: string): Promise<Caller> {
  const caller = emptyCaller();
  const callerNorm = norm(from);
  if (!callerNorm) return caller;

  if (authorisedNumbers().includes(callerNorm)) {
    return { ...caller, type: 'owner_admin', name: 'Owner', first_name: '' };
  }

  // Media Specialist — contractor profile lives in PendingSignup
  const specialist = await matchByPhone(
    base44.asServiceRole.entities.PendingSignup,
    from,
    { user_type: 'media_partner' }
  );
  if (specialist) {
    return {
      ...caller,
      type: 'media_specialist',
      name: isSpeakableName(specialist.full_name) ? specialist.full_name : '',
      first_name: speakableFirst(specialist.full_name),
      email: specialist.email || '',
      record_id: specialist.id,
      record_source: 'PendingSignup',
    };
  }

  // Client — customer profile in PendingSignup
  const client = await matchByPhone(base44.asServiceRole.entities.PendingSignup, from, { user_type: 'client' });
  if (client) {
    const rep = await assignedRepFor(base44, client.email);
    const isB2B = await hasOrganization(base44, client.email);
    return {
      ...caller,
      type: isB2B ? 'b2b_client' : 'client',
      name: isSpeakableName(client.full_name) ? client.full_name : '',
      first_name: speakableFirst(client.full_name),
      email: client.email || '',
      record_id: client.id,
      record_source: 'PendingSignup',
      assigned_rep: rep,
    };
  }

  // CRM contact — a customer profile, or a prospect still in the Arriv One pipeline
  const contact = await bestContactForNumber(base44, from);
  if (contact) {
    const rep = await assignedRepFor(base44, contact.email, contact.sales_member_id, contact.owner_id);
    const isProspect =
      looksLikeProspect(contact) || (await isAdvisorOwnedProspect(base44, from, contact, rep));
    const displayName = [contact.firstname, contact.lastname].filter(Boolean).join(' ').trim();
    return {
      ...caller,
      type: isProspect ? 'prospect' : 'client',
      name: isSpeakableName(displayName) ? displayName : '',
      first_name: speakableFirst(contact.firstname, displayName, contact.full_name),
      email: contact.email || '',
      record_id: contact.id,
      record_source: 'Contact',
      assigned_rep: rep,
    };
  }

  return caller;
}

/** One SalesTeamMember by id, or null. */
async function memberById(base44: any, id?: string) {
  if (!id) return null;
  try {
    const rows = await base44.asServiceRole.entities.SalesTeamMember.filter({ id });
    return Array.isArray(rows) ? rows[0] || null : null;
  } catch (_) {
    return null;
  }
}

/**
 * The Growth Advisor on file for a caller, if one is actually assigned.
 * Resolution order is deterministic: the contact's sales_member_id, then the
 * contact's owning rep (owner_id holds the local SalesTeamMember id for
 * prospecting records), then the rep on any contact sharing the email.
 */
async function assignedRepFor(base44: any, email: string, memberId?: string, ownerId?: string) {
  try {
    const direct = await memberById(base44, memberId);
    if (direct) return direct;

    const owner = await memberById(base44, ownerId);
    if (owner) return owner;

    if (!email) return null;
    const contacts = await base44.asServiceRole.entities.Contact.filter({ email });
    const contact = Array.isArray(contacts) ? contacts[0] : null;
    if (contact?.sales_member_id) {
      const row = await memberById(base44, contact.sales_member_id);
      if (row) return row;
    }
  } catch (e) {
    console.error('[ivr] assigned rep lookup failed:', e?.message);
  }
  return null;
}

/**
 * Deterministic prospect precedence for a CRM contact that does not carry an
 * explicit prospect lifecycle stage or lead status.
 *
 * A contact qualifies only when ALL of these hold:
 *  - an active Growth Advisor is assigned to it (sales_member_id or owner_id),
 *  - it is not marked as a customer (lifecycle_stage 'customer'),
 *  - the caller has no customer relationship on file (no client account, no
 *    job, no booking against this number or email).
 *
 * Media Specialist and client profiles are matched before this rule, so a
 * caller with one of those profiles can never be reclassified as a prospect.
 * Every other caller keeps exactly the client treatment it had before.
 */
async function isAdvisorOwnedProspect(base44: any, from: string, contact: any, rep: any) {
  if (!rep || rep.is_active === false) return false;
  if (String(contact?.lifecycle_stage || '').trim().toLowerCase() === 'customer') return false;
  return !(await hasCustomerRelationship(base44, from, contact?.email));
}

/** True when the caller already has a real customer relationship on file. */
async function hasCustomerRelationship(base44: any, from: string, email: string) {
  const queries: Promise<any>[] = [];
  if (email) queries.push(base44.asServiceRole.entities.PendingSignup.filter({ email }));
  for (const phone of phoneVariants(from)) {
    queries.push(base44.asServiceRole.entities.Job.filter({ client_phone: phone }));
    queries.push(base44.asServiceRole.entities.Booking.filter({ client_phone: phone }));
  }
  try {
    const results = await Promise.allSettled(queries);
    return results.some(
      (r) => r.status === 'fulfilled' && Array.isArray(r.value) && r.value.length > 0
    );
  } catch (e) {
    console.error('[ivr] relationship check failed:', e?.message);
    return false;
  }
}

async function hasOrganization(base44: any, email: string) {
  try {
    if (!email) return false;
    const rows = await base44.asServiceRole.entities.B2BOrganizationMember.filter({
      user_email: email,
      status: 'active',
    });
    return Array.isArray(rows) && rows.length > 0;
  } catch (_) {
    return false;
  }
}

/** True when the existing active-job menus in twilioVoiceHandler own this caller. */
export async function isProtectedJobCaller(base44: any, from: string): Promise<boolean> {
  const callerNorm = norm(from);
  if (!callerNorm) return false;
  if (authorisedNumbers().includes(callerNorm)) return true;
  try {
    const booked = await base44.asServiceRole.entities.Job.filter({ status: 'booked' });
    const inProg = await base44.asServiceRole.entities.Job.filter({ status: 'in_progress' });
    const jobs = [...(Array.isArray(booked) ? booked : []), ...(Array.isArray(inProg) ? inProg : [])];
    return jobs.some(
      (j) =>
        (j.client_phone && norm(j.client_phone) === callerNorm) ||
        (j.booked_by_phone && norm(j.booked_by_phone) === callerNorm) ||
        (j.backup_booked_by_phone && norm(j.backup_booked_by_phone) === callerNorm)
    );
  } catch (e) {
    console.error('[ivr] protected caller check failed:', e?.message);
    return false;
  }
}

/* ───────────────────────── call records ───────────────────────── */

export async function callContext(base44: any, callSid: string) {
  if (!callSid) return null;
  try {
    const rows = await base44.asServiceRole.entities.CallRecord.filter({ call_sid: callSid });
    return (Array.isArray(rows) ? rows[0] : null) || null;
  } catch (e) {
    console.error('[ivr] call lookup failed:', e?.message);
    return null;
  }
}

export async function upsertCall(base44: any, callSid: string, patch: Record<string, any> = {}) {
  if (!callSid) return null;
  const existing = await callContext(base44, callSid);
  try {
    if (existing) {
      return await base44.asServiceRole.entities.CallRecord.update(existing.id, {
        ...patch,
        updated_date: new Date().toISOString(),
      });
    }
    return await base44.asServiceRole.entities.CallRecord.create({
      call_sid: callSid,
      outcome: 'in_progress',
      started_at: new Date().toISOString(),
      ...patch,
    });
  } catch (e) {
    console.error('[ivr] call write failed:', e?.message);
    return null;
  }
}

export async function logCallEvent(base44: any, record: any, type: string, note = '') {
  if (!record) return;
  try {
    const events = Array.isArray(record.events) ? record.events : [];
    events.push({ type, note, at: new Date().toISOString() });
    await base44.asServiceRole.entities.CallRecord.update(record.id, { events: events.slice(-40) });
  } catch (_) {
    /* audit trail is best-effort, never breaks a call */
  }
}

/* ───────────────────────── sales directory ───────────────────────── */

export type SalesTarget = {
  member_id: string;
  name: string;
  email: string;
  primary: string;
  cell: string;
};

/** Eligible Growth Advisors with their configured business and cell numbers. */
export async function salesDirectory(base44: any, settings: any): Promise<SalesTarget[]> {
  const ids: string[] = Array.isArray(settings?.sales_rep_member_ids) ? settings.sales_rep_member_ids : [];
  let members: any[] = [];
  try {
    if (ids.length) {
      const rows = await base44.asServiceRole.entities.SalesTeamMember.filter({ is_active: true });
      const all = Array.isArray(rows) ? rows : [];
      members = all.filter((m) => ids.includes(m.id));
    } else {
      const rows = await base44.asServiceRole.entities.SalesTeamMember.filter({ is_active: true });
      members = (Array.isArray(rows) ? rows : []).filter(
        (m) => m.role === 'growth_advisor' || m.role === 'admin' || m.role === 'sales_rep'
      );
    }
  } catch (e) {
    console.error('[ivr] sales directory failed:', e?.message);
  }
  return members
    .map((m) => ({
      member_id: m.id,
      name: m.full_name || m.preferred_name || '',
      email: m.email || '',
      primary: e164(m.work_phone || m.phone_number || ''),
      cell: e164(m.mobile_phone_number || ''),
    }))
    .filter((m) => m.primary || m.cell);
}

/* ───────────────────────── speech understanding ───────────────────────── */

export async function classifyIntent(
  base44: any,
  opts: { speech: string; options: string[]; context?: string }
): Promise<{ intent: string; confidence: number } | null> {
  const speech = String(opts.speech || '').trim();
  if (!speech) return null;
  const prompt = `You classify what a caller said to Arriv Estate Media's phone system.

Caller said: "${speech}"
${opts.context ? `Context: ${opts.context}` : ''}

Choose exactly one intent from this list: ${opts.options.join(', ')}.
If the caller wants a person, says "support", "help", "someone", "representative", "human", or asks to be called back, use the closest matching intent from the list.
If nothing fits, answer "other".
Return JSON only.`;
  try {
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          intent: { type: 'string', enum: opts.options },
          confidence: { type: 'number' },
        },
        required: ['intent', 'confidence'],
      },
    });
    if (result?.intent && opts.options.includes(result.intent)) {
      return { intent: result.intent, confidence: Number(result.confidence) || 0 };
    }
    return null;
  } catch (e) {
    console.error('[ivr] intent classification failed:', e?.message);
    return null;
  }
}

/* ───────────────────────── notifications ───────────────────────── */

async function twilioSms(to: string, body: string) {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = e164(Deno.env.get('TWILIO_CALLING_PHONE_NUMBER'));
  const dest = e164(to);
  if (!sid || !token || !from || !dest) return false;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${sid}:${token}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: dest, From: from, Body: body }),
    });
    if (!res.ok) console.error('[ivr] sms failed:', res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.error('[ivr] sms error:', e?.message);
    return false;
  }
}

export async function ownerAlertNumber(settings: any) {
  return e164(settings?.notify_number) || e164(settings?.owner_fallback_number) || e164(OWNER_FALLBACK);
}

/** Short, non-sensitive alert with a link into the Call Center. */
export async function notifyOwner(base44: any, settings: any, message: string) {
  const to = await ownerAlertNumber(settings);
  return twilioSms(to, message);
}

/* ───────────────────────── callback requests ───────────────────────── */

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function createCallback(
  base44: any,
  opts: {
    call_sid: string;
    caller: Caller;
    from: string;
    to: string;
    category: string;
    reason?: string;
    settings: any;
    source?: string;
  }
) {
  const existing = await base44.asServiceRole.entities.CallbackRequest
    .filter({ call_sid: opts.call_sid })
    .catch(() => []);
  const already = Array.isArray(existing) ? existing[0] : null;
  if (already) return already;

  const settings = opts.settings || (await loadSettings(base44));
  let assignedName = '';
  let assignedEmail = '';
  let assignedMemberId = '';
  let rule = settings.callback_assignment || 'owner';

  if (rule === 'client_owner' && opts.caller.assigned_rep) {
    assignedName = opts.caller.assigned_rep.full_name || '';
    assignedEmail = opts.caller.assigned_rep.email || '';
    assignedMemberId = opts.caller.assigned_rep.id || '';
  } else if (rule === 'round_robin') {
    const reps = await salesDirectory(base44, settings);
    if (reps.length) {
      const pick = reps[0];
      assignedName = pick.name;
      assignedEmail = pick.email;
      assignedMemberId = pick.member_id;
    }
  }
  if (!assignedMemberId) {
    rule = 'owner';
    assignedName = 'Owner';
  }

  try {
    return await base44.asServiceRole.entities.CallbackRequest.create({
      request_id: newId('cbr'),
      call_sid: opts.call_sid,
      caller_number: e164(opts.from),
      caller_name: opts.caller.name,
      caller_email: opts.caller.email,
      caller_type: opts.caller.type,
      client_record_id: opts.caller.record_id,
      category: opts.category,
      reason: opts.reason || '',
      status: 'pending',
      priority: opts.category === 'technical_support' ? 'high' : 'normal',
      assigned_to_name: assignedName,
      assigned_to_email: assignedEmail,
      assigned_to_member_id: assignedMemberId,
      assignment_rule: rule,
      receiving_number: e164(opts.to),
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[ivr] callback create failed:', e?.message);
    return null;
  }
}

/* ───────────────────────── voicemail ───────────────────────── */

/** Copy the Twilio recording into private storage so playback is access-controlled. */
async function storeRecording(base44: any, recordingUrl: string) {
  if (!recordingUrl) return '';
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  try {
    const res = await fetch(`${recordingUrl}.mp3`, {
      headers: { Authorization: 'Basic ' + btoa(`${sid}:${token}`) },
    });
    if (!res.ok) {
      console.error('[ivr] recording download failed:', res.status);
      return '';
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const file = new File([bytes], `voicemail-${Date.now()}.mp3`, { type: 'audio/mpeg' });
    const uploaded = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });
    return uploaded?.file_uri || '';
  } catch (e) {
    console.error('[ivr] recording store failed:', e?.message);
    return '';
  }
}

export async function saveVoicemail(
  base44: any,
  opts: {
    call_sid: string;
    caller: Caller;
    from: string;
    to: string;
    category: string;
    reason?: string;
    recordingUrl: string;
    recordingSid: string;
    duration: number;
  }
) {
  const existing = await base44.asServiceRole.entities.CallVoicemail
    .filter({ call_sid: opts.call_sid })
    .catch(() => []);
  const already = Array.isArray(existing) ? existing[0] : null;
  if (already) return already;

  const fileUri = await storeRecording(base44, opts.recordingUrl);

  try {
    return await base44.asServiceRole.entities.CallVoicemail.create({
      voicemail_id: newId('cvm'),
      call_sid: opts.call_sid,
      recording_sid: opts.recordingSid,
      recording_duration: opts.duration || 0,
      recording_file_uri: fileUri,
      caller_number: e164(opts.from),
      caller_name: opts.caller.name,
      caller_email: opts.caller.email,
      caller_type: opts.caller.type,
      client_record_id: opts.caller.record_id,
      category: opts.category,
      reason: opts.reason || '',
      receiving_number: e164(opts.to),
      status: 'unreviewed',
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[ivr] voicemail create failed:', e?.message);
    return null;
  }
}
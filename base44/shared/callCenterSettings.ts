/**
 * Call center settings.
 *
 * One record (settings_key = 'default') drives the live telephone system. Every
 * destination, timeout and switch is read from it, so a new Growth Advisor is
 * added from the Call Center interface without a code change. Sensible defaults
 * come from the existing secrets, never from a hardcoded phone number.
 */

import { dialable, normalizeE164 } from './phoneNumber.ts';

export const SETTINGS_KEY = 'default';

export const DEFAULT_GREETINGS = {
  public:
    'Thank you for calling Arrive Estate Media. To book media for your property, press 1. For assistance signing up or booking through our portal, press 2.',
  support_overflow:
    'Thank you for calling Arrive. Unfortunately, we\u2019re experiencing a high call volume. Please press 1 to request a callback or press 2 to leave a voicemail.',
  technical_message:
    'Sorry for the issues you\u2019re experiencing. Please leave a detailed message explaining what you\u2019re trying to accomplish, and we\u2019ll get back with you as soon as possible.',
};

export function personalGreeting(fullName: string): string {
  const first = String(fullName || '').trim().split(/\s+/)[0];
  const lead = first ? `Hi ${first}, ` : 'Hi, ';
  return `${lead}thank you for being the best part of Arrive. How can we help you today?`;
}

function asArray(result: any): any[] {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  return Array.isArray(result.items) ? result.items : [];
}

export function defaultSettings() {
  return {
    settings_key: SETTINGS_KEY,
    owner_caller_id: dialable(Deno.env.get('TWILIO_CALLING_PHONE_NUMBER')) || '',
    owner_fallback_number: dialable(Deno.env.get('OWNER_PHONE_NUMBER')) || '',
    sales_reps: [],
    stage_enabled: { primary: true, cell: true, owner: true, ai: true },
    stage_timeouts: { primary: 18, cell: 18, owner: 20 },
    support_destination_number: '',
    support_overflow_enabled: true,
    voicemail_enabled: true,
    callback_enabled: true,
    callback_assignment: 'owner',
    ai_booking_enabled: true,
    greeting_overrides: {},
    notifications: { owner_sms: true, notification_number: dialable(Deno.env.get('OWNER_PHONE_NUMBER')) || '' },
  };
}

function mergeSettings(record: any) {
  const base = defaultSettings();
  if (!record) return base;
  return {
    ...base,
    ...record,
    stage_enabled: { ...base.stage_enabled, ...(record.stage_enabled || {}) },
    stage_timeouts: { ...base.stage_timeouts, ...(record.stage_timeouts || {}) },
    notifications: { ...base.notifications, ...(record.notifications || {}) },
    greeting_overrides: { ...(record.greeting_overrides || {}) },
    sales_reps: Array.isArray(record.sales_reps) ? record.sales_reps : [],
  };
}

/** Loads the live settings, falling back to defaults when the record does not exist yet. */
export async function loadCallCenterSettings(base44: any, options: { createIfMissing?: boolean } = {}) {
  let record: any = null;
  try {
    const found = await base44.asServiceRole.entities.CallCenterSettings.filter({ settings_key: SETTINGS_KEY });
    record = asArray(found)[0] || null;
  } catch (error) {
    console.error('Call center settings lookup failed:', (error as Error).message);
  }

  if (!record && options.createIfMissing) {
    try {
      record = await base44.asServiceRole.entities.CallCenterSettings.create(defaultSettings());
    } catch (error) {
      console.error('Call center settings create failed:', (error as Error).message);
    }
  }

  const settings = mergeSettings(record);
  // The owner fallback is the last human stage; if nothing is configured the
  // existing owner secret is used so the caller is never left with silence.
  if (!settings.owner_fallback_number) {
    settings.owner_fallback_number = dialable(Deno.env.get('OWNER_PHONE_NUMBER')) || '';
  }
  return settings;
}

export function greeting(settings: any, key: 'public' | 'support_overflow' | 'technical_message'): string {
  const override = String(settings?.greeting_overrides?.[key] || '').trim();
  return override || DEFAULT_GREETINGS[key];
}

export function ownerCallerId(settings: any): string {
  return (
    dialable(settings?.owner_caller_id) ||
    dialable(Deno.env.get('TWILIO_CALLING_PHONE_NUMBER')) ||
    dialable(Deno.env.get('TWILIO_PHONE_NUMBER')) ||
    ''
  );
}

export function ownerFallbackNumber(settings: any): string {
  return dialable(settings?.owner_fallback_number) || dialable(Deno.env.get('OWNER_PHONE_NUMBER')) || '';
}

export function supportDestination(settings: any): string {
  return dialable(settings?.support_destination_number) || ownerFallbackNumber(settings);
}

export function notificationNumber(settings: any): string {
  return (
    dialable(settings?.notifications?.notification_number) ||
    dialable(Deno.env.get('OWNER_PHONE_NUMBER')) ||
    ''
  );
}

export function eligibleReps(settings: any): Array<{
  sales_member_id: string;
  name: string;
  primary_number: string;
  cell_number: string;
}> {
  const reps = Array.isArray(settings?.sales_reps) ? settings.sales_reps : [];
  const eligible = reps.filter((rep: any) => rep && rep.eligible !== false);
  const source = eligible.length
    ? eligible
    : [
        {
          sales_member_id: '',
          name: 'Arriv Sales',
          primary_number: ownerFallbackNumber(settings),
          cell_number: '',
        },
      ];
  return source.map((rep: any) => ({
    sales_member_id: rep.sales_member_id || '',
    name: rep.name || '',
    primary_number: normalizeE164(rep.primary_number),
    cell_number: normalizeE164(rep.cell_number),
  }));
}

/**
 * The numbers to ring for one stage, de-duplicated.
 * `already` prevents the owner (or any shared number) being dialled twice across
 * stages, which is what stops a duplicate connection and a ringing phone that
 * belongs to someone already tried.
 */
export function stageNumbers(
  settings: any,
  stage: 'primary' | 'cell' | 'owner',
  already: string[] = []
): string[] {
  const tried = new Set((already || []).map((n) => normalizeE164(n)).filter(Boolean));
  let candidates: string[] = [];
  if (stage === 'primary' || stage === 'cell') {
    if (settings?.stage_enabled?.[stage] === false) return [];
    candidates = eligibleReps(settings)
      .map((rep) => (stage === 'primary' ? rep.primary_number : rep.cell_number))
      .filter(Boolean);
  } else if (stage === 'owner') {
    if (settings?.stage_enabled?.owner === false) return [];
    candidates = [ownerFallbackNumber(settings)].filter(Boolean);
  }
  const unique: string[] = [];
  for (const number of candidates) {
    const e164 = normalizeE164(number);
    if (!e164 || tried.has(e164)) continue;
    tried.add(e164);
    unique.push(e164);
  }
  return unique;
}

export function stageTimeout(settings: any, stage: 'primary' | 'cell' | 'owner'): number {
  const value = Number(settings?.stage_timeouts?.[stage]);
  const fallback = stage === 'owner' ? 20 : 18;
  return Number.isFinite(value) && value >= 5 && value <= 60 ? value : fallback;
}
/**
 * productionIvr — the single configuration layer for the LIVE Arriv IVR.
 *
 * Every prompt, keypad target, timeout, destination and whisper that used to be
 * written into the production call handlers lives here with the exact value it
 * had, so a call behaves identically until an administrator changes something.
 *
 * Two stores, no overlap:
 *   • CallCenterSetting  — the settings the handlers have always read (greetings,
 *                          ring timeouts, voicemail flags, notifications).
 *   • ProductionIvrConfig — everything that used to be hardcoded (menus, keypad
 *                          targets, applicant script, owner line, job menus).
 *
 * A live call reads `CallCenterSetting` + `ProductionIvrConfig.published`.
 * The studio edits a draft; only a publish moves draft → published.
 */

import { loadSettings } from './ivr.ts';

/* Settings the studio may edit that are stored on the existing settings record. */
export const MIRRORED_SETTINGS = [
  'public_caller_id',
  'greeting_public',
  'greeting_specialist',
  'greeting_client',
  'greeting_prospect',
  'stage1_timeout',
  'stage2_timeout',
  'stage3_timeout',
  'owner_fallback_number',
  'support_number',
  'support_timeout',
  'agent_acceptance_required',
  'ashley_enabled',
  'ashley_max_turns',
  'ashley_booking_enabled',
  'callback_assignment',
  'support_overflow_text',
  'tech_support_prompt',
  'sales_unavailable_text',
  'voicemail_enabled',
  'voicemail_max_seconds',
  'notify_owner_on_voicemail',
  'notify_owner_on_callback',
  'notify_owner_on_ticket',
  'notify_number',
  'sales_rep_member_ids',
] as const;

/** Exactly what the production handlers do today. */
export const PRODUCTION_DEFAULTS = {
  public_menu: {
    timeout: 7,
    options: { '1': 'sales_ring', '2': 'support', '3': 'applicant' },
    invalid_destination: 'sales_ring',
    no_input_destination: 'sales_ring',
  },
  specialist: {
    hints: 'support, help, callback, call me back, speak to someone',
    retry_prompt: "I'm sorry, I didn't quite catch that. To speak with support, press 1.",
    speech_timeout: 6,
  },
  client: {
    hints: 'media partner, representative, account contact, technical support, sign in, booking',
    retry_prompt:
      "I'm sorry, I didn't quite catch that. To reach your Media Partner, press 1. For technical support, press 2.",
    portal_message:
      'You can review and manage your bookings and account by signing in to your Arriv portal. For help with a booking, press 1 to reach your Media Partner, or press 2 for technical support.',
    speech_timeout: 6,
  },
  prospect: {
    dial_timeout: 35,
  },
  applicant: {
    greeting_named:
      'Hi {first_name}, thank you for following up on your application. Press one to speak to Human Resources.',
    greeting_unknown:
      'Hi, thank you for following up on your application. Press one to speak to Human Resources.',
    retry_prompt: 'Press one to speak to Human Resources.',
    menu_timeout: 8,
    dial_timeout: 30,
    hr_number: '',
    failure_text:
      "Sorry, we couldn't reach Human Resources just now. Please try again shortly. Goodbye.",
    whisper_named:
      'Call from {name}, {number}. {first_name} is calling to follow up on a job application, regarding a job interview. Connecting now.',
    whisper_unknown:
      'Call from {number}. This caller is not in the applicant records, and is calling regarding a job interview. Connecting now.',
    whisper_voice: 'Polly.Joanna',
  },
  owner_admin: {
    menu_prompt: 'Welcome. To dial out from the company number, press 1. To reach support, press 2.',
    menu_timeout: 8,
    dial_prompt: 'Enter the 10 digit number you want to reach, followed by the pound key.',
    dial_timeout: 20,
    invalid_text: 'Invalid number entered. Goodbye.',
    no_entry_text: 'No number entered. Goodbye.',
    support_fallback_text: 'Connecting you to support.',
    outbound_timeout: 30,
    phone_rules: [
      {
        number: '+14047891107',
        label: 'Owner line',
        enabled: true,
        greeting: '',
        bypass_menu: false,
        notes: '',
      },
    ],
  },
  active_job: {
    specialist_prompt:
      'Thank you for calling Arrive Estate Media. To reach your client, press 1. To reach support, press 2.',
    client_prompt:
      'Thank you for calling Arrive Estate Media. To reach your media specialist, press 1. To reach support, press 2.',
    support_fallback_text: 'Connecting you to support.',
    bridge_timeout: 45,
    menu_timeout: 8,
  },
  support: {
    attempts: 1,
    callback_reason_prompt: 'Please briefly tell us what you need help with, and we will call you back.',
    callback_confirm_text:
      'Thank you. Your callback request has been received, and a member of our team will call you back as soon as possible. Goodbye.',
    voicemail_note: 'We did not receive a message.',
    voicemail_thanks:
      'Thank you. Your message has been recorded and our team will get back with you as soon as possible. Goodbye.',
  },
  sales_ring: {
    accept_prompt: 'Press 1 to accept this call.',
    final_no_answer_text:
      'Thank you for calling Arrive Estate Media. No one is available right now. Please call back shortly. Goodbye.',
  },
};

export type ProductionConfig = typeof PRODUCTION_DEFAULTS;

const isObject = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Defaults first, saved values on top — never a missing key at call time. */
export function mergeProduction(saved: any): ProductionConfig {
  const merge = (base: any, patch: any): any => {
    if (!isObject(base)) return patch === undefined ? base : patch;
    const out: any = { ...base };
    if (!isObject(patch)) return out;
    Object.keys(patch).forEach((key) => {
      const baseValue = base[key];
      const patchValue = patch[key];
      out[key] = isObject(baseValue) && isObject(patchValue) ? merge(baseValue, patchValue) : patchValue;
    });
    return out;
  };
  return merge(PRODUCTION_DEFAULTS, saved || {});
}

/** Everything a live call needs: the settings record plus published overrides. */
export async function loadProduction(base44: any) {
  const settings = await loadSettings(base44);
  let published: any = {};
  let version = 0;
  try {
    const rows = await base44.asServiceRole.entities.ProductionIvrConfig.filter({
      settings_key: 'default',
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row) {
      published = row.published || {};
      version = Number(row.version || 0);
    }
  } catch (e) {
    console.error('[productionIvr] config load failed:', e?.message);
  }
  return { settings, prod: mergeProduction(published), version };
}

export function normNumber(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

/* ───────────────────────── spoken-script plans ─────────────────────────
 * The handlers build their TwiML from these, and the studio's test panel
 * renders the very same plans — a preview can never drift from the call.
 */

export function publicMenuPlan(prod: ProductionConfig, settings: any) {
  const menu = prod.public_menu;
  const options = menu.options || {};
  return {
    prompt: String(settings.greeting_public || ''),
    timeout: Number(menu.timeout) || 7,
    destinationFor: (digit: string) => options[digit] || menu.invalid_destination || 'sales_ring',
    invalidDestination: menu.invalid_destination,
    noInputDestination: menu.no_input_destination,
  };
}

export function applicantPlan(prod: ProductionConfig, settings: any, applicant: any) {
  const a = prod.applicant;
  const first = String(applicant?.first_name || '').trim();
  const prompt = first
    ? String(a.greeting_named).replace(/\{first_name\}/g, first)
    : String(a.greeting_unknown);
  const hr = String(a.hr_number || '').trim() || String(settings.owner_fallback_number || '');
  return {
    prompt,
    retryPrompt: String(a.retry_prompt || ''),
    menuTimeout: Number(a.menu_timeout) || 8,
    dialTimeout: Number(a.dial_timeout) || 30,
    hrNumber: hr,
    failureText: String(a.failure_text || ''),
    whisper: applicantWhisper(prod, applicant),
    whisperVoice: String(a.whisper_voice || 'Polly.Joanna'),
  };
}

export function applicantWhisper(prod: ProductionConfig, applicant: any) {
  const a = prod.applicant;
  const name = String(applicant?.name || '').trim();
  const first = String(applicant?.first_name || '').trim();
  const number = String(applicant?.number || '').trim();
  const template = name ? a.whisper_named : a.whisper_unknown;
  return String(template || '')
    .replace(/\{name\}/g, name)
    .replace(/\{first_name\}/g, first)
    .replace(/\{number\}/g, number);
}

export function ownerPhoneRules(prod: ProductionConfig) {
  return (prod.owner_admin.phone_rules || [])
    .filter((r: any) => r && r.enabled !== false && normNumber(r.number))
    .map((r: any) => ({ ...r, key: normNumber(r.number) }));
}

export function ownerMenuPlan(prod: ProductionConfig, from: string) {
  const rule = ownerPhoneRules(prod).find((r: any) => r.key === normNumber(from)) || null;
  const o = prod.owner_admin;
  return {
    rule,
    menuPrompt: String((rule && rule.greeting) || o.menu_prompt || ''),
    menuTimeout: Number(o.menu_timeout) || 8,
    dialPrompt: String(o.dial_prompt || ''),
    dialTimeout: Number(o.dial_timeout) || 20,
    invalidText: String(o.invalid_text || ''),
    noEntryText: String(o.no_entry_text || ''),
    supportFallbackText: String(o.support_fallback_text || ''),
    outboundTimeout: Number(o.outbound_timeout) || 30,
    bypassMenu: !!rule?.bypass_menu,
  };
}

export function activeJobPlan(prod: ProductionConfig) {
  const j = prod.active_job;
  return {
    specialistPrompt: String(j.specialist_prompt || ''),
    clientPrompt: String(j.client_prompt || ''),
    supportFallbackText: String(j.support_fallback_text || ''),
    bridgeTimeout: Number(j.bridge_timeout) || 45,
    menuTimeout: Number(j.menu_timeout) || 8,
  };
}

export function specialistPlan(prod: ProductionConfig, settings: any) {
  return {
    greeting: String(settings.greeting_specialist || ''),
    hints: String(prod.specialist.hints || ''),
    retryPrompt: String(prod.specialist.retry_prompt || ''),
    speechTimeout: Number(prod.specialist.speech_timeout) || 6,
  };
}

export function clientPlan(prod: ProductionConfig, settings: any) {
  return {
    greeting: String(settings.greeting_client || ''),
    hints: String(prod.client.hints || ''),
    retryPrompt: String(prod.client.retry_prompt || ''),
    portalMessage: String(prod.client.portal_message || ''),
    speechTimeout: Number(prod.client.speech_timeout) || 6,
  };
}

export function supportPlan(prod: ProductionConfig, settings: any) {
  return {
    overflowText: String(settings.support_overflow_text || ''),
    attempts: Number(prod.support.attempts) || 1,
    callbackReasonPrompt: String(prod.support.callback_reason_prompt || ''),
    callbackConfirmText: String(prod.support.callback_confirm_text || ''),
    voicemailNote: String(prod.support.voicemail_note || ''),
    voicemailThanks: String(prod.support.voicemail_thanks || ''),
    techPrompt: String(settings.tech_support_prompt || ''),
    voicemailMaxSeconds: Number(settings.voicemail_max_seconds) || 180,
  };
}

export function salesRingPlan(prod: ProductionConfig, settings: any) {
  return {
    acceptPrompt: String(prod.sales_ring.accept_prompt || ''),
    acceptRequired: !!settings.agent_acceptance_required,
    finalNoAnswerText: String(prod.sales_ring.final_no_answer_text || ''),
    stage1Timeout: Number(settings.stage1_timeout) || 18,
    stage2Timeout: Number(settings.stage2_timeout) || 18,
    stage3Timeout: Number(settings.stage3_timeout) || 20,
    ownerFallback: String(settings.owner_fallback_number || ''),
    ashleyEnabled: !!settings.ashley_enabled,
    voicemailEnabled: !!settings.voicemail_enabled,
    unavailableText: String(settings.sales_unavailable_text || ''),
  };
}

/**
 * Every surface the studio can point at, with the value a live call would use
 * right now and which production function reads it. This is the inventory the
 * "Live IVR" section renders, so a control is only listed when a real handler
 * consumes it.
 */
export function productionInventory(prod: ProductionConfig, settings: any) {
  const p = publicMenuPlan(prod, settings);
  const a = applicantPlan(prod, settings, {});
  const o = ownerMenuPlan(prod, '');
  const j = activeJobPlan(prod);
  const s = specialistPlan(prod, settings);
  const c = clientPlan(prod, settings);
  const sup = supportPlan(prod, settings);
  const sr = salesRingPlan(prod, settings);

  const row = (group: string, label: string, value: string, where: string, editable: string) => ({
    group,
    label,
    value: String(value || '').slice(0, 240),
    where,
    editable,
  });

  return [
    row('Public menu', 'Greeting and keypad prompt', p.prompt, 'ivrRouter → public_greeting', 'settings.greeting_public'),
    row('Public menu', 'Keypad timeout (seconds)', String(p.timeout), 'ivrRouter', 'public_menu.timeout'),
    row('Public menu', 'Press 1 →', p.destinationFor('1'), 'ivrRouter', 'public_menu.options.1'),
    row('Public menu', 'Press 2 →', p.destinationFor('2'), 'ivrRouter', 'public_menu.options.2'),
    row('Public menu', 'Press 3 →', p.destinationFor('3'), 'ivrRouter', 'public_menu.options.3'),
    row('Public menu', 'Unrecognised key →', p.invalidDestination, 'ivrRouter', 'public_menu.invalid_destination'),
    row('Public menu', 'No input →', p.noInputDestination, 'ivrRouter', 'public_menu.no_input_destination'),
    row('Job applicants', 'Greeting (recognised applicant)', a.prompt, 'ivrRouter → applicant_greeting', 'applicant.greeting_named'),
    row('Job applicants', 'Greeting (unknown caller)', prod.applicant.greeting_unknown, 'ivrRouter', 'applicant.greeting_unknown'),
    row('Job applicants', 'Repeat prompt', a.retryPrompt, 'ivrRouter', 'applicant.retry_prompt'),
    row('Job applicants', 'Destination number', a.hrNumber, 'ivrRouter → applicant_connect', 'applicant.hr_number'),
    row('Job applicants', 'Dial timeout (seconds)', String(a.dialTimeout), 'ivrRouter', 'applicant.dial_timeout'),
    row('Job applicants', 'Private announcement (recognised)', a.whisper, 'ivrHrWhisper', 'applicant.whisper_named'),
    row('Job applicants', 'Private announcement (unknown)', applicantWhisper(prod, {}), 'ivrHrWhisper', 'applicant.whisper_unknown'),
    row('Job applicants', 'Nobody answered', a.failureText, 'ivrRouter → applicant_after', 'applicant.failure_text'),
    row('Owner line', 'Authorised numbers', ownerPhoneRules(prod).map((r: any) => r.label + ' ' + r.number).join(', ') || 'environment only', 'twilioVoiceHandler', 'owner_admin.phone_rules'),
    row('Owner line', 'Dial-out menu prompt', o.menuPrompt, 'twilioVoiceHandler → menu=admin', 'owner_admin.menu_prompt'),
    row('Owner line', 'Destination prompt', o.dialPrompt, 'twilioVoiceHandler → menu=admin_dial', 'owner_admin.dial_prompt'),
    row('Owner line', 'Invalid number text', o.invalidText, 'twilioVoiceHandler', 'owner_admin.invalid_text'),
    row('Owner line', 'Menu fallback text', o.supportFallbackText, 'twilioVoiceHandler', 'owner_admin.support_fallback_text'),
    row('Owner line', 'Outbound call timeout', String(o.outboundTimeout), 'twilioVoiceHandler', 'owner_admin.outbound_timeout'),
    row('Active job', 'Media Specialist menu', j.specialistPrompt, 'twilioVoiceHandler → active_job_specialist', 'active_job.specialist_prompt'),
    row('Active job', 'Client menu', j.clientPrompt, 'twilioVoiceHandler → active_job_client', 'active_job.client_prompt'),
    row('Active job', 'Bridge timeout (seconds)', String(j.bridgeTimeout), 'twilioVoiceHandler', 'active_job.bridge_timeout'),
    row('Media Specialist', 'Greeting', s.greeting, 'ivrRouter → specialist_greeting', 'settings.greeting_specialist'),
    row('Media Specialist', 'Speech hints', s.hints, 'ivrRouter', 'specialist.hints'),
    row('Media Specialist', 'Repeat prompt', s.retryPrompt, 'ivrRouter', 'specialist.retry_prompt'),
    row('Client', 'Greeting', c.greeting, 'ivrRouter → client_greeting', 'settings.greeting_client'),
    row('Client', 'Speech hints', c.hints, 'ivrRouter', 'client.hints'),
    row('Client', 'Repeat prompt', c.retryPrompt, 'ivrRouter', 'client.retry_prompt'),
    row('Client', 'Portal guidance', c.portalMessage, 'ivrRouter → client_intent', 'client.portal_message'),
    row('Prospect', 'Greeting', settings.greeting_prospect, 'ivrRouter → prospect_greeting', 'settings.greeting_prospect'),
    row('Prospect', 'Advisor dial timeout', String(prod.prospect.dial_timeout), 'ivrRouter', 'prospect.dial_timeout'),
    row('Sales ring', 'Stage 1 timeout', String(sr.stage1Timeout), 'ivrSalesRing', 'settings.stage1_timeout'),
    row('Sales ring', 'Stage 2 timeout', String(sr.stage2Timeout), 'ivrSalesRing', 'settings.stage2_timeout'),
    row('Sales ring', 'Stage 3 timeout', String(sr.stage3Timeout), 'ivrSalesRing', 'settings.stage3_timeout'),
    row('Sales ring', 'Owner fallback number', sr.ownerFallback, 'ivrSalesRing → ring3', 'settings.owner_fallback_number'),
    row('Sales ring', 'Acceptance prompt', sr.acceptPrompt, 'ivrSalesRing → accept', 'sales_ring.accept_prompt'),
    row('Sales ring', 'Nobody answered', sr.finalNoAnswerText, 'ivrSalesRing → ring4', 'sales_ring.final_no_answer_text'),
    row('Support', 'Overflow menu', sup.overflowText, 'ivrSupport → root', 'settings.support_overflow_text'),
    row('Support', 'Menu retries', String(sup.attempts), 'ivrSupport', 'support.attempts'),
    row('Support', 'Callback reason prompt', sup.callbackReasonPrompt, 'ivrSupport → callback_reason', 'support.callback_reason_prompt'),
    row('Support', 'Callback confirmation', sup.callbackConfirmText, 'ivrSupport → callback_save', 'support.callback_confirm_text'),
    row('Support', 'Voicemail prompt', sup.techPrompt, 'ivrSupport → voicemail_prompt', 'settings.tech_support_prompt'),
    row('Support', 'Voicemail thanks', sup.voicemailThanks, 'ivrSupport → voicemail_saved', 'support.voicemail_thanks'),
    row('Support', 'Voicemail max length', String(sup.voicemailMaxSeconds), 'ivrSupport', 'settings.voicemail_max_seconds'),
    row('Ashley AI', 'Enabled after sales ring', String(sr.ashleyEnabled), 'ivrSalesRing → ring4', 'settings.ashley_enabled'),
    row('Ashley AI', 'Conversation turn limit', String(settings.ashley_max_turns || 12), 'ivrAshley', 'settings.ashley_max_turns'),
    row('Notifications', 'Alert number', settings.notify_number || settings.owner_fallback_number, 'shared/ivr.ts notifyOwner', 'settings.notify_number'),
    row('Notifications', 'SMS on voicemail', String(!!settings.notify_owner_on_voicemail), 'ivrSupport', 'settings.notify_owner_on_voicemail'),
    row('Notifications', 'SMS on callback', String(!!settings.notify_owner_on_callback), 'ivrSupport', 'settings.notify_owner_on_callback'),
    row('Notifications', 'SMS on ticket', String(!!settings.notify_owner_on_ticket), 'ivrSupport', 'settings.notify_owner_on_ticket'),
  ];
}
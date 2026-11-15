/**
 * Arriv One voice / telephony settings.
 *
 * One admin-controlled record (AppSetting key "arriv_one_voice_settings") drives
 * recording, transcription, AI summaries, spend caps and retention. Anything
 * that costs money or carries a consent obligation starts switched OFF, so
 * deploying this code changes nothing until an administrator turns it on.
 */

const SETTINGS_KEY = 'arriv_one_voice_settings';

export const VOICE_SETTINGS_DEFAULTS = {
  access_number: '',
  recording_enabled: false,
  transcription_enabled: false,
  ai_summaries_enabled: true,
  coaching_enabled: true,
  consent_mode: 'affirmative_verbal',
  require_rep_attestation: true,
  dial_out_require_pin: false,
  international_calling_enabled: false,
  premium_rate_blocked: true,
  daily_session_minutes_cap: 240,
  per_call_minutes_cap: 45,
  monthly_ai_calls_cap: 1500,
  seek_ai_calls_this_period: 0,
  period_key: '',
  retention_days: 365,
  lookup_cache_days: 7,
  lookup_daily_cap: 75,
  lookup_calls_this_period: 0,
  live_search_enabled: true,
  voice_command_enabled: true,
  dial_out_menu_text:
    'Arriv sales dial out. To place a call from your sales number, press 1. To check your voicemail, press 2.',
  dial_out_prompt: 'Please enter your extension, followed by the ten digit phone number you wish to call.',
  dial_out_after_text:
    'Your call has ended. To dial another number, press 1. To end your session, press 2.',
  dial_out_bad_entry_text: "I'm sorry, I didn't get a valid extension and number. Please try again.",
  updated_by: '',
  updated_at: '',
};

const listOf = (v: any) => (Array.isArray(v) ? v : v?.items || []);

export async function loadVoiceSettings(base44: any) {
  const rows = listOf(
    await base44.asServiceRole.entities.AppSetting.filter({ key: SETTINGS_KEY }).catch(() => [])
  );
  let saved: any = {};
  try {
    saved = rows[0]?.value ? JSON.parse(rows[0].value) : {};
  } catch {
    saved = {};
  }
  return { ...VOICE_SETTINGS_DEFAULTS, ...saved };
}

export async function saveVoiceSettings(base44: any, patch: any, actor: string) {
  const current = await loadVoiceSettings(base44);
  const allowed = Object.keys(VOICE_SETTINGS_DEFAULTS);
  const next: any = { ...current };
  for (const [key, value] of Object.entries(patch || {})) {
    if (allowed.includes(key) && value !== undefined) next[key] = value;
  }
  next.updated_by = actor || next.updated_by || '';
  next.updated_at = new Date().toISOString();

  const rows = listOf(
    await base44.asServiceRole.entities.AppSetting.filter({ key: SETTINGS_KEY }).catch(() => [])
  );
  const payload = { key: SETTINGS_KEY, value: JSON.stringify(next) };
  if (rows[0]) await base44.asServiceRole.entities.AppSetting.update(rows[0].id, payload);
  else await base44.asServiceRole.entities.AppSetting.create(payload);
  return next;
}

/** Recording is only ever legitimate with the flag on AND recorded consent. */
export function recordingAllowed(settings: any, consent: string) {
  return settings?.recording_enabled === true && consent === 'consented';
}

/** Transcription must never touch audio that was not lawfully recorded. */
export function transcriptionAllowed(settings: any, consent: string) {
  return (
    settings?.transcription_enabled === true &&
    settings?.recording_enabled === true &&
    consent === 'consented'
  );
}

export function periodKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Call caps are evaluated before a call is placed, never after, so a runaway
 * session cannot run up spend. Returns a plain reason when blocked.
 */
export function checkCallCaps(identity: any, settings: any, minutes = 1) {
  const key = periodKey();
  const used = identity?.period_key === key ? Number(identity?.minutes_used_this_period || 0) : 0;
  const repCap = Number(identity?.monthly_minutes_cap || 0);
  if (repCap > 0 && used + minutes > repCap) {
    return 'This rep has reached their monthly dial-out limit.';
  }
  const dailyCap = Number(settings?.daily_session_minutes_cap || 0);
  if (dailyCap > 0 && minutes > dailyCap) {
    return 'That call would exceed the daily dial-out limit.';
  }
  return null;
}

export function estimateCosts(settings: any) {
  // Published Twilio list prices (US), used only for order-of-magnitude display.
  // Every line is labelled in the admin UI as an estimate, not a billed figure.
  return {
    inbound_access_per_minute_usd: 0.0085,
    outbound_us_per_minute_usd: 0.014,
    recording_per_minute_usd: 0.0025,
    storage_per_gb_month_usd: 0.1,
    transcription_per_minute_usd: 0.0045,
    ai_summary_per_call_usd: 0.01,
    lookup_per_search_usd: 0.02,
    note: 'Estimates from published US list pricing. Verify against the Twilio, storage and AI invoices.',
  };
}
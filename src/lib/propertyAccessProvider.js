/**
 * Frontend Property Access Provider Resolver
 *
 * Mirrors base44/shared/propertyAccessProvider.ts for use in React components.
 *
 * DMV (DC, Maryland, Virginia)          → SENTRILOCK / SentriConnect
 * Explicitly configured Supra markets    → SUPRA / eKEY
 * Any other unconfigured state/market    → UNKNOWN (provider-neutral message)
 *
 * ── Markets currently configured for SUPRA ──
 *   Georgia (GA)
 *
 * For an individual JOB, provider is ALWAYS determined by PROPERTY LOCATION.
 * A Media Specialist's home address never overrides a job's property state.
 */

export const PROVIDER_SENTRILOCK = 'SENTRILOCK';
export const PROVIDER_SUPRA = 'SUPRA';
export const PROVIDER_UNKNOWN = 'UNKNOWN';

const DMV_STATES = new Set([
  'dc',
  'd.c.',
  'district of columbia',
  'washington dc',
  'washington, dc',
  'md',
  'maryland',
  'va',
  'virginia',
]);

// ── Explicitly configured Supra markets ──
// Only states confirmed by Arriv to use Supra should appear here.
// Currently configured: Georgia (GA).
const SUPRA_STATES = new Set([
  'ga',
  'georgia',
]);

export function normalizeState(state) {
  if (!state) return '';
  return String(state).trim().toLowerCase();
}

export function isDmvState(state) {
  return DMV_STATES.has(normalizeState(state));
}

export function isSupraState(state) {
  return SUPRA_STATES.has(normalizeState(state));
}

export function getPropertyAccessProvider(jobOrProperty) {
  if (!jobOrProperty) return PROVIDER_UNKNOWN;
  const state = jobOrProperty?.state || '';
  if (isDmvState(state)) return PROVIDER_SENTRILOCK;
  if (isSupraState(state)) return PROVIDER_SUPRA;
  return PROVIDER_UNKNOWN;
}

// Public configuration — these are public guide URLs, not secrets.
export const SENTRILOCK_ACCESS_GUIDE_URL = 'https://app.arrivestatemedia.com/r/sl1k';
export const SUPRA_ACCESS_GUIDE_URL = 'https://app.arrivestatemedia.com/r/pa7k';

// Official SentriConnect app store links
export const SENTRICONNECT_IOS_URL =
  'https://apps.apple.com/us/app/sentriconnect/id1211378236';
export const SENTRICONNECT_ANDROID_URL =
  'https://play.google.com/store/apps/details?id=com.sentriconnect.sentriconnect&hl=en_US';

// Official SentriKey Real Estate app store links (for listing agents)
export const SENTRIKEY_IOS_URL =
  'https://apps.apple.com/us/app/sentrikey-real-estate/id459298336';
export const SENTRIKEY_ANDROID_URL =
  'https://play.google.com/store/apps/details?id=com.sentrilock.sentrikey&hl=en_US';
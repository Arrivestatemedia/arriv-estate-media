/**
 * Frontend Property Access Provider Resolver
 *
 * Mirrors base44/shared/propertyAccessProvider.ts for use in React components.
 * Determines SentriLock (DMV) vs Supra (existing markets) from a job/property state.
 *
 * For an individual JOB, provider is ALWAYS determined by PROPERTY LOCATION.
 * A Media Specialist's home address never overrides a job's property state.
 */

export const PROVIDER_SENTRILOCK = 'SENTRILOCK';
export const PROVIDER_SUPRA = 'SUPRA';

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

export function normalizeState(state) {
  if (!state) return '';
  return String(state).trim().toLowerCase();
}

export function isDmvState(state) {
  return DMV_STATES.has(normalizeState(state));
}

export function getPropertyAccessProvider(jobOrProperty) {
  if (!jobOrProperty) return PROVIDER_SUPRA;
  const state = jobOrProperty?.state || '';
  return isDmvState(state) ? PROVIDER_SENTRILOCK : PROVIDER_SUPRA;
}

// Public configuration — these are public guide URLs, not secrets.
export const SENTRILOCK_ACCESS_GUIDE_URL =
  'https://drive.google.com/file/d/1Ap8EWP_Su2Wxl15Hn0URV_aJaq99OopT/view?usp=drive_link';
export const SUPRA_ACCESS_GUIDE_URL = 'https://bit.ly/3OdUc80';

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
/**
 * Canonical Property Access Provider Resolver
 *
 * Determines which property-access provider (SentriLock or Supra) applies
 * to a given job or property based on its state.
 *
 * DMV (DC, Maryland, Virginia) → SENTRILOCK / SentriConnect
 * All other markets → SUPRA / eKEY (existing workflow)
 *
 * Every property-access feature should consume this resolver — never
 * duplicate state/provider logic elsewhere.
 */

export const PROVIDER_SENTRILOCK = 'SENTRILOCK';
export const PROVIDER_SUPRA = 'SUPRA';

const DMV_STATES = new Set<string>([
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

export function normalizeState(state: string | undefined | null): string {
  if (!state) return '';
  return String(state).trim().toLowerCase();
}

export function isDmvState(state: string | undefined | null): boolean {
  return DMV_STATES.has(normalizeState(state));
}

/**
 * Resolve the property-access provider for a job or property object.
 * Expects a `state` field (2-letter abbreviation or full state name).
 * Returns PROVIDER_SENTRILOCK for DMV, PROVIDER_SUPRA for all other markets.
 */
export function getPropertyAccessProvider(jobOrProperty: { state?: string } | null | undefined): string {
  if (!jobOrProperty) return PROVIDER_SUPRA;
  const state = jobOrProperty.state || '';
  return isDmvState(state) ? PROVIDER_SENTRILOCK : PROVIDER_SUPRA;
}

/**
 * Get the access guide URL for the resolved provider.
 * Reads from environment secrets with hardcoded fallbacks.
 */
export function getAccessGuideUrl(provider: string): string {
  if (provider === PROVIDER_SENTRILOCK) {
    return (
      Deno.env.get('SENTRILOCK_ACCESS_GUIDE_URL') ||
      'https://drive.google.com/file/d/1Ap8EWP_Su2Wxl15Hn0URV_aJaq99OopT/view?usp=drive_link'
    );
  }
  return Deno.env.get('SUPRA_ACCESS_GUIDE_URL') || 'https://bit.ly/3OdUc80';
}
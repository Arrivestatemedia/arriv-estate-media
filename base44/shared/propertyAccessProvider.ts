/**
 * Canonical Property Access Provider Resolver
 *
 * Determines which property-access provider applies to a given job or property
 * based on its state.
 *
 * DMV (DC, Maryland, Virginia)          → SENTRILOCK / SentriConnect
 * Explicitly configured Supra markets    → SUPRA / eKEY
 * Any other unconfigured state/market    → UNKNOWN (provider-neutral message)
 *
 * ── Markets currently configured for SUPRA ──
 *   Georgia (GA)
 *
 * Do NOT infer new Supra markets. Add a state to SUPRA_STATES only when Arriv
 * has explicitly confirmed that market uses Supra.
 *
 * Every property-access feature should consume this resolver — never
 * duplicate state/provider logic elsewhere.
 */

export const PROVIDER_SENTRILOCK = 'SENTRILOCK';
export const PROVIDER_SUPRA = 'SUPRA';
export const PROVIDER_UNKNOWN = 'UNKNOWN';

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

// ── Explicitly configured Supra markets ──
// Only states confirmed by Arriv to use Supra should appear here.
// Currently configured: Georgia (GA).
const SUPRA_STATES = new Set<string>([
  'ga',
  'georgia',
]);

export function normalizeState(state: string | undefined | null): string {
  if (!state) return '';
  return String(state).trim().toLowerCase();
}

export function isDmvState(state: string | undefined | null): boolean {
  return DMV_STATES.has(normalizeState(state));
}

export function isSupraState(state: string | undefined | null): boolean {
  return SUPRA_STATES.has(normalizeState(state));
}

/**
 * Resolve the property-access provider for a job or property object.
 * Expects a `state` field (2-letter abbreviation or full state name).
 *
 * Returns PROVIDER_SENTRILOCK for DMV, PROVIDER_SUPRA for explicitly
 * configured Supra markets, and PROVIDER_UNKNOWN for any state/market
 * Arriv has not yet configured.
 */
export function getPropertyAccessProvider(jobOrProperty: { state?: string } | null | undefined): string {
  if (!jobOrProperty) return PROVIDER_UNKNOWN;
  const state = jobOrProperty.state || '';
  if (isDmvState(state)) return PROVIDER_SENTRILOCK;
  if (isSupraState(state)) return PROVIDER_SUPRA;
  return PROVIDER_UNKNOWN;
}

/**
 * Get the access guide URL for the resolved provider.
 * Returns an empty string for PROVIDER_UNKNOWN (no provider-specific guide).
 *
 * These are PUBLIC configuration values, not credentials — they are
 * world-readable guide documents, not secrets.
 */
export function getAccessGuideUrl(provider: string): string {
  if (provider === PROVIDER_SENTRILOCK) {
    return (
      Deno.env.get('SENTRILOCK_ACCESS_GUIDE_URL') ||
      'https://app.arrivestatemedia.com/r/sl1k'
    );
  }
  if (provider === PROVIDER_SUPRA) {
    return Deno.env.get('SUPRA_ACCESS_GUIDE_URL') || 'https://app.arrivestatemedia.com/r/pa7k';
  }
  // PROVIDER_UNKNOWN — no provider-specific guide
  return '';
}
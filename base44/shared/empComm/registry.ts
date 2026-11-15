/**
 * Provider registry.
 *
 * The Email Hub, calendar and AI command layer only ever talk to this registry,
 * never to Google or Microsoft directly. Adding a provider means adding one
 * adapter and registering it here — no CRM or AI code changes.
 */

import { googleAdapter } from './google.ts';
import { microsoftAdapter } from './microsoft.ts';

const ADAPTERS = {
  google: googleAdapter,
  microsoft: microsoftAdapter,
};

/** Advertised to the connection screen so a newly supported provider needs no UI change. */
export function providerCatalog() {
  return Object.values(ADAPTERS).map((adapter) => ({
    key: adapter.key,
    label: adapter.label,
    capabilities: adapter.capabilities,
  }));
}

export function adapterFor(provider: string) {
  const adapter = ADAPTERS[String(provider || '').toLowerCase()];
  if (!adapter) throw new Error('That mailbox provider is not supported.');
  return adapter;
}

export function isSupportedProvider(provider: string) {
  return !!ADAPTERS[String(provider || '').toLowerCase()];
}

/** Explicit unsupported answer instead of a silent substitute. */
export function requireCapability(adapter: any, capability: string) {
  if (adapter?.capabilities?.[capability]) return null;
  return (
    adapter?.capabilities?.unsupported?.[capability] ||
    `${adapter?.label || 'This provider'} does not support ${capability} through Arriv One.`
  );
}
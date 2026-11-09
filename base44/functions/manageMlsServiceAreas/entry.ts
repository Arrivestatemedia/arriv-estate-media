import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { verifyAdmin } from '../../shared/adminAuth.ts';
import {
  MLS_SERVICE_REGIONS_KEY,
  DEFAULT_MLS_SERVICE_REGIONS,
  loadMlsServiceRegions,
  normalizeServiceRegion,
} from '../../shared/mlsRegions.ts';
import {
  MLS_PROVIDERS_KEY,
  MLS_PROVIDER_DEFAULTS,
  loadMlsProviders,
  certificationPassed,
} from '../../shared/mlsProviders.ts';

/**
 * manageMlsServiceAreas
 * Administrators maintain the map that routes a property to an MLS — never the customer.
 *
 * Two settings are managed here because they answer the same question (may this address be
 * published, and through whom):
 *   `mls_service_regions` — which areas belong to which provider, and whether that coverage is verified
 *   `mls_providers`       — whether a provider is enabled and which certification tests it has passed
 *
 * Bright Media Sync only becomes reachable for a customer when its region is enabled AND verified
 * AND the provider is enabled AND every certification test has been recorded as passed.
 */
async function saveSetting(base44: any, key: string, value: string) {
  const existing = await base44.asServiceRole.entities.AppSetting.filter({ key }, undefined, 1);
  if (existing?.[0]?.id) {
    await base44.asServiceRole.entities.AppSetting.update(existing[0].id, { value });
  } else {
    await base44.asServiceRole.entities.AppSetting.create({ key, value });
  }
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { action = 'list', regions, provider_id, enabled, certification, actor } = body || {};

    const auth = await verifyAdmin(base44, body, new URL(req.url));
    if (!auth.authorized) return Response.json({ error: auth.error || 'Forbidden' }, { status: 403 });
    const actorEmail = auth.actorEmail || auth.actor || actor || 'admin';

    if (action === 'save_regions') {
      if (!Array.isArray(regions) || regions.length === 0) {
        return Response.json({ error: 'At least one service area is required' }, { status: 400 });
      }
      const knownProviderIds = new Set(Object.keys(MLS_PROVIDER_DEFAULTS));
      const cleaned = regions.map((raw: any) => normalizeServiceRegion(raw, null)).map((region) => {
        if (!knownProviderIds.has(region.provider_id)) {
          throw new Error(`Unknown provider "${region.provider_id}" on ${region.label || region.id}`);
        }
        if (!region.id) throw new Error('Every service area needs an id');
        if (region.verified && !region.verified_by) {
          return { ...region, verified_by: actorEmail, verified_at: new Date().toISOString() };
        }
        return region;
      });
      const ids = cleaned.map((r) => r.id);
      if (new Set(ids).size !== ids.length) {
        return Response.json({ error: 'Two service areas share the same id' }, { status: 400 });
      }
      await saveSetting(base44, MLS_SERVICE_REGIONS_KEY, JSON.stringify(cleaned));
      return Response.json({ success: true, regions: await loadMlsServiceRegions(base44) });
    }

    if (action === 'reset_regions') {
      const existing = await base44.asServiceRole.entities.AppSetting.filter({ key: MLS_SERVICE_REGIONS_KEY }, undefined, 1);
      if (existing?.[0]?.id) await base44.asServiceRole.entities.AppSetting.delete(existing[0].id);
      return Response.json({ success: true, regions: DEFAULT_MLS_SERVICE_REGIONS });
    }

    if (action === 'set_provider') {
      const id = String(provider_id || '').trim();
      if (!MLS_PROVIDER_DEFAULTS[id]) return Response.json({ error: 'Unknown MLS provider' }, { status: 400 });

      const existing = await base44.asServiceRole.entities.AppSetting.filter({ key: MLS_PROVIDERS_KEY }, undefined, 1);
      let overrides: Record<string, any> = {};
      try {
        const raw = existing?.[0]?.value;
        if (raw) overrides = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch { overrides = {}; }

      const current = overrides[id] || {};
      overrides[id] = {
        ...current,
        ...(enabled !== undefined ? { enabled: enabled === true } : {}),
        ...(certification && typeof certification === 'object'
          ? { certification: { ...(current.certification || {}), ...certification } }
          : {}),
      };
      await saveSetting(base44, MLS_PROVIDERS_KEY, JSON.stringify(overrides));

      const providers = await loadMlsProviders(base44);
      return Response.json({ success: true, provider: providers[id], providers: Object.values(providers) });
    }

    // action === 'list'
    const [configuredRegions, providers] = await Promise.all([
      loadMlsServiceRegions(base44),
      loadMlsProviders(base44),
    ]);

    return Response.json({
      regions: configuredRegions,
      defaults: DEFAULT_MLS_SERVICE_REGIONS,
      providers: Object.values(providers).map((p) => ({
        ...p,
        certification_passed: certificationPassed(p),
        live_for_customers: p.enabled && certificationPassed(p),
      })),
      actor: actorEmail,
    });
  } catch (error: any) {
    console.error('manageMlsServiceAreas error:', error);
    return Response.json({ error: error?.message || 'Could not update MLS service areas' }, { status: 500 });
  }
}
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';
import { ALL_CANONICAL } from '../../shared/studioLibraryDefaults.ts';

// Hourly sync: pulls the latest library catalog from the canonical Arriv Studio
// backend (when ARRIV_STUDIO_BASE_URL is configured) and updates the local cache.
// If Studio is not yet configured, this is a no-op — the canonical defaults
// seeded by getStudioLibraries remain the source of truth.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    // Admin-only — this is a scheduled maintenance function
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const studioBaseUrl = secrets.get('ARRIV_STUDIO_BASE_URL');
    const ssoSecret = secrets.get('ARRIV_STUDIO_SSO_SECRET');

    // If Studio backend isn't configured yet, ensure canonical defaults are seeded
    if (!studioBaseUrl) {
      const existing = await base44.asServiceRole.entities.StudioLibraryAsset.list('-updated_date', 200);
      if (!existing || existing.length === 0) {
        const now = new Date().toISOString();
        const records = ALL_CANONICAL.map((a) => ({
          asset_type: a.asset_type,
          studio_id: a.studio_id,
          name: a.name,
          source: a.source || null,
          status: a.status || 'available',
          category: a.category || null,
          description: a.description || null,
          tags: a.tags || [],
          metadata: a.metadata || {},
          last_synced_at: now,
        }));
        await base44.asServiceRole.entities.StudioLibraryAsset.bulkCreate(records);
      }
      return Response.json({
        synced: false,
        reason: 'ARRIV_STUDIO_BASE_URL not configured — canonical defaults remain active',
        count: (existing || []).length,
      });
    }

    // Probe common API paths to find the correct libraries endpoint
    const base = studioBaseUrl.replace(/\/$/, '');
    const headers = { 'Content-Type': 'application/json' };
    if (ssoSecret) {
      headers['X-Arriv-Studio-Secret'] = ssoSecret;
      headers['Authorization'] = `Bearer ${ssoSecret}`;
    }

    const candidatePaths = [
      '/functions/getStudioLibraries',
      '/functions/getLibraries',
      '/functions/getLibraryAssets',
      '/functions/listLibraries',
      '/functions/listStudioLibraries',
      '/functions/getStudioAssets',
      '/functions/getPresenters',
      '/functions/getVoices',
      '/functions/getMusic',
      '/functions/getStudioLibrary',
      '/functions/getAllLibraries',
      '/functions/getLibraryCatalog',
      '/functions/getStudioCatalog',
      '/functions/getAssets',
      '/functions/listAssets',
    ];

    let studioData = null;
    let foundPath = null;
    let probeResults = [];

    for (const path of candidatePaths) {
      try {
        const res = await fetch(`${base}${path}`, { headers });
        const ct = res.headers.get('content-type') || '';
        probeResults.push({ path, status: res.status, contentType: ct });
        if (res.ok && ct.includes('application/json')) {
          const json = await res.json();
          // Check if this response has library data
          if (json.presenters || json.voices || json.music || Array.isArray(json)) {
            studioData = json;
            foundPath = path;
            break;
          }
        }
      } catch (e) {
        probeResults.push({ path, error: e.message });
      }
    }

    if (!studioData) {
      return Response.json({
        synced: false,
        reason: 'No libraries API endpoint found on Studio backend',
        probed: probeResults,
        base_url: base,
      });
    }
    const remoteAssets = [
      ...(studioData.presenters || []).map((p) => ({ ...p, asset_type: 'presenter' })),
      ...(studioData.voices || []).map((v) => ({ ...v, asset_type: 'voice' })),
      ...(studioData.music || []).map((m) => ({ ...m, asset_type: 'music' })),
    ];

    if (remoteAssets.length === 0) {
      return Response.json({ synced: true, count: 0, reason: 'Studio returned empty catalog' });
    }

    const now = new Date().toISOString();

    // Fetch existing cache to build a studio_id -> record map
    const existing = await base44.asServiceRole.entities.StudioLibraryAsset.list('-updated_date', 500);
    const existingMap = new Map();
    for (const rec of existing) {
      if (rec.studio_id) existingMap.set(rec.studio_id, rec);
    }

    const toCreate = [];
    const toUpdate = [];

    for (const remote of remoteAssets) {
      const local = existingMap.get(remote.studio_id);
      const payload = {
        asset_type: remote.asset_type,
        studio_id: remote.studio_id,
        name: remote.name,
        source: remote.source || null,
        status: remote.status || 'available',
        category: remote.category || null,
        description: remote.description || null,
        tags: remote.tags || [],
        metadata: remote.metadata || {},
        preview_url: remote.preview_url || null,
        audio_url: remote.audio_url || null,
        studio_version: remote.studio_version || remote.version || null,
        last_synced_at: now,
      };

      if (local) {
        // Only update if version changed or no version tracked
        if (!remote.studio_version || local.studio_version !== remote.studio_version) {
          toUpdate.push({ id: local.id, ...payload });
        }
      } else {
        toCreate.push(payload);
      }
    }

    // Detect deleted assets (in local cache but not in remote)
    const remoteIds = new Set(remoteAssets.map((a) => a.studio_id).filter(Boolean));
    const toDelete = [];
    for (const rec of existing) {
      if (rec.studio_id && !remoteIds.has(rec.studio_id)) {
        toDelete.push(rec.id);
      }
    }

    if (toCreate.length > 0) {
      await base44.asServiceRole.entities.StudioLibraryAsset.bulkCreate(toCreate);
    }
    if (toUpdate.length > 0) {
      await base44.asServiceRole.entities.StudioLibraryAsset.bulkUpdate(toUpdate);
    }
    if (toDelete.length > 0) {
      await base44.asServiceRole.entities.StudioLibraryAsset.deleteMany({ id: { $in: toDelete } });
    }

    return Response.json({
      synced: true,
      created: toCreate.length,
      updated: toUpdate.length,
      deleted: toDelete.length,
      total: remoteAssets.length,
      last_synced_at: now,
    });
  } catch (error) {
    return Response.json({ error: error.message, synced: false }, { status: 500 });
  }
}
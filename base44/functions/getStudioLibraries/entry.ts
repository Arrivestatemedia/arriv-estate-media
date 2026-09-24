import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { ALL_CANONICAL } from '../../shared/studioLibraryDefaults.ts';

// Returns the Studio Library catalog (presenters, voices, music) from the local
// cache. If the cache is empty, seeds it with canonical defaults so the UI is
// fully populated immediately. The hourly syncStudioLibraries workflow keeps
// the cache fresh from the canonical Arriv Studio backend.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    let assets = await base44.asServiceRole.entities.StudioLibraryAsset.list('-updated_date', 200);

    // Seed canonical defaults if cache is empty
    if (!assets || assets.length === 0) {
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
      assets = await base44.asServiceRole.entities.StudioLibraryAsset.list('-updated_date', 200);
    }

    const presenters = assets.filter((a) => a.asset_type === 'presenter');
    const voices = assets.filter((a) => a.asset_type === 'voice');
    const music = assets.filter((a) => a.asset_type === 'music');

    return Response.json({
      presenters,
      voices,
      music,
      last_synced_at: assets[0]?.last_synced_at || null,
      count: assets.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
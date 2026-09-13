// Admin function for tenant email provider settings.
// Currently handles inbound email forwarding enable/disable.
// Uses asServiceRole to bypass RLS when reading/writing TenantEmailConfig.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const DEFAULT_TENANT_ID = "tnt_estate_media";

async function resolveTenantEmailConfig(base44, tenantId: string) {
  try {
    const configs = await base44.asServiceRole.entities.TenantEmailConfig.filter({ tenant_id: tenantId });
    return configs && configs.length > 0 ? configs[0] : null;
  } catch {
    return null;
  }
}

function publicEmailConfig(config: any): any {
  if (!config) return null;
  return {
    tenant_id: config.tenant_id,
    inbound_enabled: !!config.inbound_enabled,
    inbound_webhook_token: config.inbound_webhook_token || "",
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, tenant_id } = body;
    const tenantId = tenant_id || DEFAULT_TENANT_ID;

    // --- Get current config ---
    if (action === 'get' || !action) {
      const config = await resolveTenantEmailConfig(base44, tenantId);
      return Response.json({ data: publicEmailConfig(config) });
    }

    // --- Enable inbound email forwarding ---
    if (action === 'enable_inbound') {
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      const existing = await resolveTenantEmailConfig(base44, tenantId);
      const updates: any = {
        inbound_enabled: true,
        inbound_webhook_token: token,
        updated_at: new Date().toISOString(),
      };
      if (existing) {
        await base44.asServiceRole.entities.TenantEmailConfig.update(existing.id, updates);
      } else {
        await base44.asServiceRole.entities.TenantEmailConfig.create({ tenant_id: tenantId, ...updates });
      }
      return Response.json({ data: publicEmailConfig(await resolveTenantEmailConfig(base44, tenantId)) });
    }

    // --- Disable inbound email forwarding ---
    if (action === 'disable_inbound') {
      const existing = await resolveTenantEmailConfig(base44, tenantId);
      if (existing) {
        await base44.asServiceRole.entities.TenantEmailConfig.update(existing.id, {
          inbound_enabled: false,
          updated_at: new Date().toISOString(),
        });
      }
      return Response.json({ data: publicEmailConfig(await resolveTenantEmailConfig(base44, tenantId)) });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
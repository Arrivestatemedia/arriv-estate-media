// Centralized Arriv One tenant config resolution for Estate Media.
// Estate Media has a single ArrivOneTenantConfig record (singleton).

export async function getTenantConfig(base44) {
  const configs = await base44.asServiceRole.entities.ArrivOneTenantConfig.list("-created_date", 10);
  return configs && configs.length > 0 ? configs[0] : null;
}

export async function isSyncEnabled(base44) {
  const cfg = await getTenantConfig(base44);
  if (!cfg) return false;
  return cfg.arriv_one_sync_enabled === true && cfg.arriv_one_sync_mode !== "disabled";
}

export async function getSyncMode(base44) {
  const cfg = await getTenantConfig(base44);
  return cfg?.arriv_one_sync_mode || "disabled";
}

export async function getCanonicalTenantId(base44) {
  const cfg = await getTenantConfig(base44);
  return cfg?.arriv_one_tenant_id || null;
}

export async function isEntityShared(base44, entityType) {
  const cfg = await getTenantConfig(base44);
  if (!cfg) return false;
  const shared = cfg.shared_entity_types || [];
  return shared.includes(entityType);
}

export function validateInboundTenant(envelope, canonicalTenantId) {
  if (!canonicalTenantId) return { valid: false, error: "No canonical tenant configured" };
  if (envelope.tenant_id !== canonicalTenantId) {
    return { valid: false, error: `Tenant mismatch: expected ${canonicalTenantId}, got ${envelope.tenant_id}` };
  }
  return { valid: true };
}

export function isTestMode(cfg) {
  return cfg?.arriv_one_sync_mode === "test";
}

export function isMigrationMode(cfg) {
  return cfg?.arriv_one_sync_mode === "migration";
}

export function isPausedMode(cfg) {
  return cfg?.arriv_one_sync_mode === "paused";
}

export function isTestRecord(envelope) {
  return envelope?.payload?._test === true || envelope?.payload?._test_record === true;
}
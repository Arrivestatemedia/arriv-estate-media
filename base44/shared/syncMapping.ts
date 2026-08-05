// Cross-app record mapping resolution for Arriv One ⇄ Estate Media sync.
// Mappings are stored by CANONICAL entity type (see syncEntityAdapters.ts).
// Local DB lookups translate canonical → estate_media_local entity name.

import { toEstateMediaLocalEntityType, isEntitySyncReady } from "./syncEntityAdapters.ts";

const normalizeEmail = (e) => (e || "").toLowerCase().trim();
const digitsOnly = (p) => (p || "").replace(/\D/g, "").slice(-10);

/**
 * Find an existing CrossAppRecordMapping by immutable_shared_id.
 * entityType is CANONICAL.
 */
export async function findMappingBySharedId(base44, tenantId, entityType, immutableSharedId) {
  const mappings = await base44.asServiceRole.entities.CrossAppRecordMapping.filter({
    tenant_id: tenantId,
    entity_type: entityType,
    immutable_shared_id: immutableSharedId,
  });
  return mappings && mappings.length > 0 ? mappings[0] : null;
}

/**
 * Find an existing mapping by remote record ID.
 * entityType is CANONICAL.
 */
export async function findMappingByRemoteId(base44, tenantId, entityType, remoteRecordId) {
  const mappings = await base44.asServiceRole.entities.CrossAppRecordMapping.filter({
    tenant_id: tenantId,
    entity_type: entityType,
    remote_record_id: remoteRecordId,
  });
  return mappings && mappings.length > 0 ? mappings[0] : null;
}

/**
 * Find an existing mapping by local record ID.
 * entityType is CANONICAL.
 */
export async function findMappingByLocalId(base44, tenantId, entityType, localRecordId) {
  const mappings = await base44.asServiceRole.entities.CrossAppRecordMapping.filter({
    tenant_id: tenantId,
    entity_type: entityType,
    local_record_id: localRecordId,
  });
  return mappings && mappings.length > 0 ? mappings[0] : null;
}

/**
 * Create a new mapping. entityType is CANONICAL.
 */
export async function createMapping(base44, { tenantId, entityType, localRecordId, remoteRecordId, immutableSharedId, origin, eventId }) {
  return await base44.asServiceRole.entities.CrossAppRecordMapping.create({
    tenant_id: tenantId,
    application: "arriv_one",
    entity_type: entityType,
    local_record_id: localRecordId,
    remote_record_id: remoteRecordId || "",
    immutable_shared_id: immutableSharedId,
    sync_status: "linked",
    last_event_id: eventId || "",
    origin: origin || "arriv_one",
  });
}

/**
 * Update a mapping after sync.
 */
export async function updateMapping(base44, mappingId, { recordVersion, eventId, syncStatus, errorState, remoteRecordId }) {
  const update = {
    last_synced_version: recordVersion,
    last_synced_at: new Date().toISOString(),
    last_event_id: eventId,
    sync_status: syncStatus || "linked",
    error_state: errorState || "",
  };
  if (remoteRecordId !== undefined) update.remote_record_id = remoteRecordId;
  return await base44.asServiceRole.entities.CrossAppRecordMapping.update(mappingId, update);
}

/**
 * Mark a mapping as archived (not deleted) when a remote delete is received.
 */
export async function archiveMapping(base44, mappingId, reason) {
  return await base44.asServiceRole.entities.CrossAppRecordMapping.update(mappingId, {
    sync_status: "stale",
    error_state: reason || "Remote record deleted — mapping archived",
    last_synced_at: new Date().toISOString(),
  });
}

/**
 * Natural-key matching for safe local record resolution.
 * entityType is CANONICAL. Translates to local entity name for DB access.
 * Returns existing local record if a safe match is found, or null.
 */
export async function naturalKeyMatch(base44, entityType, payload) {
  const localType = toEstateMediaLocalEntityType(entityType);

  if (localType === "Contact") {
    const email = normalizeEmail(payload.email);
    const phone = digitsOnly(payload.phone);
    if (!email && !phone) return null;
    const all = await base44.asServiceRole.entities.Contact.list("-created_date", 5000);
    if (email) {
      const byEmail = all.find((c) => normalizeEmail(c.email) === email);
      if (byEmail) return byEmail;
    }
    if (phone.length >= 10) {
      const byPhone = all.find((c) => digitsOnly(c.phone) === phone);
      if (byPhone) return byPhone;
    }
    return null;
  }
  if (localType === "SalesTeamMember") {
    const email = normalizeEmail(payload.email);
    if (!email) return null;
    const all = await base44.asServiceRole.entities.SalesTeamMember.list("-created_date", 500);
    return all.find((m) => normalizeEmail(m.email) === email) || null;
  }
  return null;
}

/**
 * Check for ambiguous natural-key matches (multiple records matching).
 * entityType is CANONICAL. Returns true if ambiguous.
 */
export async function isAmbiguousMatch(base44, entityType, payload) {
  const localType = toEstateMediaLocalEntityType(entityType);

  if (localType === "Contact") {
    const email = normalizeEmail(payload.email);
    const phone = digitsOnly(payload.phone);
    const all = await base44.asServiceRole.entities.Contact.list("-created_date", 5000);
    let count = 0;
    if (email) count += all.filter((c) => normalizeEmail(c.email) === email).length;
    if (phone.length >= 10) count += all.filter((c) => digitsOnly(c.phone) === phone).length;
    return count > 1;
  }
  return false;
}
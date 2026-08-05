// Cross-app record mapping resolution for Arriv One ⇄ Estate Media sync.

const normalizeEmail = (e) => (e || "").toLowerCase().trim();
const digitsOnly = (p) => (p || "").replace(/\D/g, "").slice(-10);

/**
 * Find an existing CrossAppRecordMapping by immutable_shared_id.
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
 * Create a new mapping.
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
export async function updateMapping(base44, mappingId, { recordVersion, eventId, syncStatus, errorState }) {
  return await base44.asServiceRole.entities.CrossAppRecordMapping.update(mappingId, {
    last_synced_version: recordVersion,
    last_synced_at: new Date().toISOString(),
    last_event_id: eventId,
    sync_status: syncStatus || "linked",
    error_state: errorState || "",
  });
}

/**
 * Natural-key matching for safe local record resolution.
 * Returns existing local record if a safe match is found, or null.
 */
export async function naturalKeyMatch(base44, entityType, payload) {
  if (entityType === "Contact") {
    const email = normalizeEmail(payload.email);
    const phone = digitsOnly(payload.phone);
    if (!email && !phone) return null;
    const all = await base44.asServiceRole.entities.Contact.list("-created_date", 5000);
    if (email) {
      const byEmail = all.find(c => normalizeEmail(c.email) === email);
      if (byEmail) return byEmail;
    }
    if (phone.length >= 10) {
      const byPhone = all.find(c => digitsOnly(c.phone) === phone);
      if (byPhone) return byPhone;
    }
    return null;
  }
  if (entityType === "SalesTeamMember") {
    const email = normalizeEmail(payload.email);
    if (!email) return null;
    const all = await base44.asServiceRole.entities.SalesTeamMember.list("-created_date", 500);
    return all.find(m => normalizeEmail(m.email) === email) || null;
  }
  return null;
}

/**
 * Check for ambiguous natural-key matches (multiple records matching).
 * Returns true if ambiguous, meaning a conflict should be created.
 */
export async function isAmbiguousMatch(base44, entityType, payload) {
  if (entityType === "Contact") {
    const email = normalizeEmail(payload.email);
    const phone = digitsOnly(payload.phone);
    const all = await base44.asServiceRole.entities.Contact.list("-created_date", 5000);
    let count = 0;
    if (email) count += all.filter(c => normalizeEmail(c.email) === email).length;
    if (phone.length >= 10) count += all.filter(c => digitsOnly(c.phone) === phone).length;
    return count > 1;
  }
  return false;
}
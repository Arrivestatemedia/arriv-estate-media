// Append-only IntegrationAuditLog writer. Ordinary users must not modify or delete audit logs;
// only service-role backend functions call this module.

export async function writeAuditLog(base44, entry) {
  const {
    actor,
    action,
    entityType,
    entityId,
    beforeValues,
    afterValues,
    sourceApplication = "arriv_one",
    destinationApplication,
    requestId,
    sessionMetadata,
    result = "success",
  } = entry;

  return base44.asServiceRole.entities.IntegrationAuditLog.create({
    event_id: "evt_" + crypto.randomUUID(),
    actor: actor || "system",
    action,
    entity_type: entityType,
    entity_id: entityId,
    before_values: beforeValues || null,
    after_values: afterValues || null,
    source_application: sourceApplication,
    destination_application: destinationApplication || null,
    timestamp: new Date().toISOString(),
    request_id: requestId || null,
    session_metadata: sessionMetadata || null,
    result,
  });
}
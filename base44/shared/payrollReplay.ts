// Replay protection: store and reject duplicate request IDs.
// Retention window matches the freshness window (5 min) plus a safety margin; records older
// than expires_at can be purged by a scheduled cleanup.

const RETENTION_MS = 10 * 60 * 1000; // 10 minutes

export async function isReplay(base44, requestId, sourceApplicationId, endpoint) {
  if (!requestId) return { replay: true, reason: "missing_request_id" };
  const existing = await base44.asServiceRole.entities.ProcessedRequest.filter({
    request_id: requestId,
  });
  if (existing && existing.length) {
    return { replay: true, reason: "duplicate_request_id" };
  }
  return { replay: false };
}

export async function markProcessed(base44, requestId, sourceApplicationId, endpoint) {
  const now = new Date();
  return base44.asServiceRole.entities.ProcessedRequest.create({
    request_id: requestId,
    source_application_id: sourceApplicationId || null,
    endpoint: endpoint || null,
    processed_at: now.toISOString(),
    expires_at: new Date(now.getTime() + RETENTION_MS).toISOString(),
  });
}
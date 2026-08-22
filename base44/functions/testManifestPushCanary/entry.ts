import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";
import {
  SCHEMA_VERSION,
  signEnvelope,
  generateEventId,
  generateIdempotencyKey,
  generateNonce,
} from "../../shared/syncEnvelope.ts";
import { SIGNATURE_VERSION } from "../../shared/syncEntityAdapters.ts";
import { getTenantConfig } from "../../shared/syncTenantConfig.ts";
import { computeChecksum } from "../../shared/manifestPushHandler.ts";

// Manifest push canary — tests the end-to-end push delivery path.
// Uses label_overrides (harmless, non-business-impacting) as the canary type.
//
// Tests:
//   1. Push delivery (AO → EM receive → ProductManifestLocal → getActiveManifest)
//   2. Idempotency (replay same event → no duplicate)
//   3. Stale version (older version → rejected)
//   4. Checksum mismatch (tampered payload → rejected)
//   5. Cross-tenant rejection
//
// All canary manifests are marked with manifest_id starting "canary_" for easy cleanup.
// This function does NOT send SMS/email/voice/video or create any business side effects.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action || "push"; // "push" | "cleanup" | "test_all"

    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const cfg = await getTenantConfig(base44);
    if (!cfg) {
      return Response.json({ error: "No tenant config" }, { status: 503 });
    }

    const tenantId = cfg.arriv_one_tenant_id;

    if (action === "cleanup") {
      return await cleanupCanary(base44);
    }

    if (action === "push") {
      const version = body?.version || "1.0.0";
      const result = await pushCanary(base44, cfg, tenantId, version, false);
      return Response.json({ success: true, action: "push", ...result });
    }

    if (action === "test_all") {
      const results = {};

      // 1. Push canary v1
      results.push_v1 = await pushCanary(base44, cfg, tenantId, "1.0.0", false);

      // 2. Verify getActiveManifest resolves to canary
      results.active_manifest = await verifyActiveManifest(base44, tenantId);

      // 3. Idempotency — replay same event
      results.idempotency = await pushCanary(base44, cfg, tenantId, "1.0.0", false, results.push_v1.event_id);

      // 4. Stale version — push v0.9 (should be rejected)
      results.stale_version = await pushCanary(base44, cfg, tenantId, "0.9.0", false);

      // 5. Checksum mismatch — tampered payload
      results.checksum_mismatch = await pushCanary(base44, cfg, tenantId, "1.1.0", true);

      // 6. Cross-tenant rejection
      results.cross_tenant = await pushCanary(base44, cfg, "tnt_other_tenant", "1.0.0", false);

      // 7. Count canary manifests
      const canaryCount = await countCanary(base44);

      // 8. Cleanup
      const cleanup = await cleanupCanary(base44);

      return Response.json({
        success: true,
        action: "test_all",
        results,
        canary_count_before_cleanup: canaryCount,
        cleanup,
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("testManifestPushCanary error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

async function pushCanary(base44, cfg, tenantId, version, tamperChecksum, reuseEventId) {
  const canaryPayload = {
    labels: { test_canary: `Canary Test Label v${version}` },
    description: `Canary test manifest v${version} — safe to delete`,
  };
  const checksum = await computeChecksum(JSON.stringify(canaryPayload));
  const manifestId = `canary_label_overrides_${version}`;
  const eventId = reuseEventId || generateEventId();
  const now = new Date().toISOString();
  const sigNonce = generateNonce();
  const sharedId = manifestId;
  const idempotencyKey = generateIdempotencyKey(sharedId, now, "create");

  const manifestData = {
    manifest_id: manifestId,
    entry_type: "label_overrides",
    version,
    checksum: tamperChecksum ? "deadbeef0000000000000000000000000000000000000000000000000000dead" : checksum,
    payload: canaryPayload,
    scope: "tenant",
    compatible_with_min: "7.0.0",
    compatible_with_max: "8.0.0",
    published_at: now,
    created_by: "canary_test",
  };

  const envelope = {
    event_id: eventId,
    event_type: "manifest.published",
    schema_version: SCHEMA_VERSION,
    signature_version: SIGNATURE_VERSION,
    source_application: "arriv_one",
    destination_application: "estate_media",
    tenant_id: tenantId,
    entity_type: "ProductManifest",
    entity_id: manifestId,
    immutable_shared_id: sharedId,
    operation: "create",
    occurred_at: now,
    source_updated_at: now,
    record_version: 1,
    idempotency_key: idempotencyKey,
    correlation_id: "",
    causation_id: "",
    origin_event_id: "",
    payload: manifestData,
    signature_timestamp: now,
    signature_nonce: sigNonce,
  };
  const signature = await signEnvelope(envelope, "ESTATE_MEDIA_ARRIV_ONE_SYNC_INBOUND_SECRET");
  envelope.signature = signature;

  // Call receiveArrivOneSyncEvent via HTTP fetch (full HTTP path including HMAC verification)
  const appDomain = secrets.get("BASE44_APP_DOMAIN") || "";
  const endpoint = `https://${appDomain}/api/functions/receiveArrivOneSyncEvent`;
  const fetchResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(envelope),
  });
  const responseData = await fetchResponse.json().catch(() => ({ status: fetchResponse.status, error: "Non-JSON response" }));

  return {
    event_id: eventId,
    manifest_id: manifestId,
    version,
    tampered: tamperChecksum,
    tenant: tenantId,
    response: responseData,
  };
}

async function verifyActiveManifest(base44, tenantId) {
  const result = await base44.functions.invoke("getActiveManifest", {
    entry_type: "label_overrides",
    runtime_path: "canary_test",
  });
  const data = result?.data || result;
  return {
    manifest_id: data?.manifest_id,
    version: data?.version,
    fallback_used: data?.fallback_used,
    source: data?.source,
  };
}

async function countCanary(base44) {
  const manifests = await base44.asServiceRole.entities.ProductManifestLocal.filter({
    manifest_type: "label_overrides",
  });
  return manifests.filter((m) => m.manifest_id?.startsWith("canary_")).length;
}

async function cleanupCanary(base44) {
  const manifests = await base44.asServiceRole.entities.ProductManifestLocal.filter({
    manifest_type: "label_overrides",
  });
  const canary = manifests.filter((m) => m.manifest_id?.startsWith("canary_"));
  for (const m of canary) {
    await base44.asServiceRole.entities.ProductManifestLocal.delete(m.id);
  }

  // Also clean up canary SyncInbox entries
  const inbox = await base44.asServiceRole.entities.SyncInbox.filter({
    entity_type: "ProductManifest",
  });
  const canaryInbox = inbox.filter((i) => i.payload?.manifest_id?.startsWith("canary_"));
  for (const i of canaryInbox) {
    await base44.asServiceRole.entities.SyncInbox.delete(i.id);
  }

  return { cleaned_manifests: canary.length, cleaned_inbox: canaryInbox.length };
}
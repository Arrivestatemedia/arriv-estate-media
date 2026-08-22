import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantConfig } from "../../shared/syncTenantConfig.ts";
import { MANIFEST_ENTRY_TYPES, EM_RUNTIME_VERSION } from "../../shared/manifestFallbacks.ts";
import { fetchManifestVersions, fetchManifestContent } from "../../shared/manifestPullClient.ts";
import { storeManifest, computeChecksum } from "../../shared/manifestPushHandler.ts";
import { invalidateManifestCache, compareVersions, getStoredVersion, getActiveVersion } from "../../shared/manifestRuntime.ts";

// Manifest pull reconciliation — self-healing for missed pushes.
//
// Push is PRIMARY. This pull is RECONCILIATION / SELF-HEALING:
//   1. Fetch expected canonical versions from AO (HMAC)
//   2. Compare expected vs local stored/active
//   3. For MISSING or STALE manifests, fetch full content from AO (HMAC)
//   4. Store using the same shared storeManifest logic as the push handler
//   5. Invalidate cache
//   6. Return reconciliation report
//
// This function does NOT send SMS/email/voice/video. It only reads from AO and stores locally.
// It does NOT create outbound EM→AO events (no ping-pong).

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // Admin-only — reconciliation is a privileged operation
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const cfg = await getTenantConfig(base44);
    if (!cfg) {
      return Response.json({ error: "No tenant config found" }, { status: 503 });
    }
    if (!cfg.arriv_one_manifest_endpoint) {
      return Response.json({ error: "No manifest endpoint configured" }, { status: 503 });
    }

    const tenantId = cfg.arriv_one_tenant_id;
    const reconciliationId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    // Record reconciliation start
    await recordAuditLog(base44, tenantId, "reconciliation_started", "success", {
      reconciliation_id: reconciliationId,
      started_at: startedAt,
      triggered_by: "manual",
    });

    // 1. Fetch expected canonical versions from AO
    const versionsResult = await fetchManifestVersions(cfg, tenantId, MANIFEST_ENTRY_TYPES);
    if (!versionsResult.ok) {
      await recordAuditLog(base44, tenantId, "reconciliation_failed", "warning", {
        reconciliation_id: reconciliationId,
        error: versionsResult.error,
      });
      return Response.json({
        success: false,
        reconciliation_id: reconciliationId,
        error: `Failed to fetch expected versions: ${versionsResult.error}`,
      }, { status: 502 });
    }

    const remoteVersions = versionsResult.data;
    const report = [];
    let fetched = 0;
    let stored = 0;
    let skipped = 0;
    let errors = 0;

    // 2. Compare expected vs local for each manifest type
    for (const entryType of MANIFEST_ENTRY_TYPES) {
      const remoteInfo = remoteVersions[entryType];
      const expectedVersion = remoteInfo?.version || null;

      // Get local stored/active versions
      const localStoredVersion = await getStoredVersion(base44, tenantId, entryType);
      const localActiveVersion = await getActiveVersion(base44, tenantId, entryType);

      const entryReport = {
        entry_type: entryType,
        expected_version: expectedVersion,
        stored_version: localStoredVersion,
        active_version: localActiveVersion,
        action: "no_op",
        result: "skipped",
      };

      // If AO has no production manifest for this type, leave as NOT_CONFIGURED
      if (!expectedVersion) {
        entryReport.result = "not_configured_on_ao";
        report.push(entryReport);
        skipped++;
        continue;
      }

      // If local already has the expected version, no-op (converged)
      if (localStoredVersion === expectedVersion) {
        entryReport.action = "already_current";
        entryReport.result = "converged";
        report.push(entryReport);
        skipped++;
        continue;
      }

      // MISSING or STALE — fetch full content from AO
      entryReport.action = "fetch_and_store";
      fetched++;

      try {
        const contentResult = await fetchManifestContent(cfg, tenantId, entryType);
        if (!contentResult.ok) {
          entryReport.result = "fetch_failed";
          entryReport.error = contentResult.error;
          report.push(entryReport);
          errors++;
          await recordAuditLog(base44, tenantId, "reconciliation_fetch_failed", "warning", {
            reconciliation_id: reconciliationId,
            entry_type: entryType,
            expected_version: expectedVersion,
            error: contentResult.error,
          });
          continue;
        }

        const manifest = contentResult.data;
        const {
          version,
          checksum,
          payload,
          manifest_id,
          scope = "tenant",
          compatible_with_min,
          compatible_with_max,
          published_at,
          created_by,
        } = manifest;

        if (!version || !checksum) {
          entryReport.result = "invalid_manifest_response";
          entryReport.error = "Missing version or checksum in AO response";
          report.push(entryReport);
          errors++;
          continue;
        }

        // Verify checksum (payload integrity)
        const computedChecksum = await computeChecksum(JSON.stringify(payload || {}));
        if (computedChecksum !== checksum) {
          entryReport.result = "checksum_mismatch";
          entryReport.error = "Computed checksum does not match AO checksum";
          report.push(entryReport);
          errors++;
          await recordAuditLog(base44, tenantId, "reconciliation_checksum_mismatch", "warning", {
            reconciliation_id: reconciliationId,
            entry_type: entryType,
            version,
          });
          continue;
        }

        // Check for duplicate (idempotency)
        const recordTenantId = scope === "global" ? "global" : tenantId;
        const existing = await base44.asServiceRole.entities.ProductManifestLocal.filter({
          tenant_id: recordTenantId,
          manifest_type: entryType,
          manifest_version: version,
          scope: scope,
        });
        const duplicate = existing.find((m) => m.checksum === checksum);
        if (duplicate) {
          entryReport.action = "duplicate_found";
          entryReport.result = "idempotent_no_op";
          report.push(entryReport);
          skipped++;
          continue;
        }

        // Stale version protection
        const existingApplied = await base44.asServiceRole.entities.ProductManifestLocal.filter({
          tenant_id: recordTenantId,
          manifest_type: entryType,
          scope: scope,
          apply_status: "applied",
        });
        if (existingApplied.length > 0) {
          const highestStored = existingApplied
            .sort((a, b) => compareVersions(b.manifest_version, a.manifest_version))[0];
          if (compareVersions(version, highestStored.manifest_version) < 0) {
            // Stale — store as pending_review
            await storeManifest(base44, {
              tenantId, entryType, version, checksum, payload,
              manifestId: manifest_id, scope, compatibleWithMin: compatible_with_min,
              compatibleWithMax: compatible_with_max, publishedAt: published_at,
              createdBy: created_by, applyStatus: "pending_review",
            });
            entryReport.action = "stored_stale_pending_review";
            entryReport.result = "stale_version";
            report.push(entryReport);
            stored++;
            continue;
          }
        }

        // Compatibility validation
        let applyStatus = "applied";
        let compatible = true;
        if (compatible_with_min && compareVersions(EM_RUNTIME_VERSION, compatible_with_min) < 0) {
          applyStatus = "incompatible";
          compatible = false;
        }
        if (compatible_with_max && compareVersions(EM_RUNTIME_VERSION, compatible_with_max) > 0) {
          applyStatus = "incompatible";
          compatible = false;
        }

        // Store the manifest
        await storeManifest(base44, {
          tenantId, entryType, version, checksum, payload,
          manifestId: manifest_id, scope, compatibleWithMin: compatible_with_min,
          compatibleWithMax: compatible_with_max, publishedAt: published_at,
          createdBy: created_by, applyStatus,
        });

        // Invalidate cache
        invalidateManifestCache(tenantId, entryType);

        entryReport.result = compatible ? "stored_and_activated" : "stored_incompatible";
        entryReport.apply_status = applyStatus;
        report.push(entryReport);
        stored++;

        await recordAuditLog(base44, tenantId, "reconciliation_manifest_stored", compatible ? "success" : "warning", {
          reconciliation_id: reconciliationId,
          entry_type: entryType,
          version,
          manifest_id: manifest_id,
          apply_status: applyStatus,
          scope,
        });
      } catch (fetchError) {
        entryReport.result = "error";
        entryReport.error = fetchError.message;
        report.push(entryReport);
        errors++;
      }
    }

    const completedAt = new Date().toISOString();

    await recordAuditLog(base44, tenantId, "reconciliation_completed", "success", {
      reconciliation_id: reconciliationId,
      started_at: startedAt,
      completed_at: completedAt,
      fetched,
      stored,
      skipped,
      errors,
    });

    return Response.json({
      success: true,
      reconciliation_id: reconciliationId,
      started_at: startedAt,
      completed_at: completedAt,
      tenant_id: tenantId,
      em_runtime_version: EM_RUNTIME_VERSION,
      total_types: MANIFEST_ENTRY_TYPES.length,
      fetched,
      stored,
      skipped,
      errors,
      report,
    });
  } catch (error) {
    console.error("reconcileArrivOneManifests error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

async function recordAuditLog(base44, tenantId, action, result, metadata) {
  try {
    await base44.asServiceRole.entities.IntegrationAuditLog.create({
      event_id: crypto.randomUUID(),
      actor: "manifest_reconciliation",
      action,
      entity_type: "ProductManifest",
      entity_id: metadata.reconciliation_id || "",
      source_application: "arriv_one",
      destination_application: "arriv_estate_media",
      timestamp: new Date().toISOString(),
      result,
      session_metadata: {
        tenant_id: tenantId,
        ...metadata,
      },
    });
  } catch {
    // non-critical
  }
}
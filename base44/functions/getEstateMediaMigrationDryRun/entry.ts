// Read-only, admin-only migration payload dry-run for Estate Media → Arriv One.
// Generates migration payloads for all eligible production records and validates
// them against the Arriv One envelope/schema contract WITHOUT transmitting.
//
// Reports validation errors by category. Returns counts and sanitized examples only.
// Does NOT dump sensitive production payload contents.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantConfig } from "../../shared/syncTenantConfig.ts";
import { isTestArtifact } from "../../shared/syncTestArtifactFilter.ts";
import { ENTITY_ADAPTERS, INITIAL_SHARED_ENTITIES, getEventType } from "../../shared/syncEntityAdapters.ts";
import { buildOutboundPayload, FIELD_AUTHORITY, GLOBAL_NEVER_SYNC } from "../../shared/syncFieldAuthority.ts";
// Re-import to ensure bundler picks up the newly exported GLOBAL_NEVER_SYNC
import { generateIdempotencyKey, generateEventId, generateNonce, SCHEMA_VERSION, SOURCE_APPLICATION, DESTINATION_APPLICATION } from "../../shared/syncEnvelope.ts";
import { SIGNATURE_VERSION } from "../../shared/syncEntityAdapters.ts";

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const cfg = await getTenantConfig(base44);
    if (!cfg) return Response.json({ error: "No tenant config" }, { status: 400 });
    const tenantId = cfg.arriv_one_tenant_id;

    const validationErrors = {
      missing_immutable_shared_id: 0,
      missing_record_version: 0,
      invalid_record_version: 0,
      missing_source_updated_at: 0,
      unknown_canonical_entity: 0,
      sensitive_field_not_stripped: 0,
      field_authority_violation: 0,
      missing_idempotency_key: 0,
      missing_dependency_reference: 0,
      payload_too_large: 0,
      schema_validation_risk: 0,
    };

    const validatedPayloads = [];
    let totalEligible = 0;
    let totalGenerated = 0;
    let totalExcluded = 0;
    const perEntity = {};

    for (const canonicalType of INITIAL_SHARED_ENTITIES) {
      const adapter = ENTITY_ADAPTERS[canonicalType];
      const localEntity = adapter.estate_media_local;
      const records = await base44.asServiceRole.entities[localEntity].list("-created_date", 5000);
      const productionRecords = records.filter(r => !isTestArtifact(r));

      // Skip Recognition subtypes (ManagerNote with is_recognition=true)
      const eligibleRecords = productionRecords.filter(r => {
        if (canonicalType === "ManagerNote" && r.is_recognition === true) return false;
        return true;
      });

      let entityGenerated = 0;
      let entityExcluded = 0;

      for (const r of eligibleRecords) {
        totalEligible++;

        // Validate immutable_shared_id
        const sharedId = r.immutable_shared_id || "";
        if (!sharedId) {
          validationErrors.missing_immutable_shared_id++;
          // For dry-run, generate a placeholder to continue validation
        }

        // Validate record_version
        const recordVersion = r.record_version;
        if (recordVersion === undefined || recordVersion === null) {
          validationErrors.missing_record_version++;
        } else if (!Number.isInteger(recordVersion) || recordVersion < 1) {
          validationErrors.invalid_record_version++;
        }

        // Validate source_updated_at
        const sourceUpdatedAt = r.updated_date || r.created_date || "";
        if (!sourceUpdatedAt) {
          validationErrors.missing_source_updated_at++;
        }

        // Build outbound payload (strips sensitive fields)
        const payload = buildOutboundPayload(canonicalType, r);

        // Verify sensitive fields were stripped
        const rules = FIELD_AUTHORITY[canonicalType] || {};
        const neverFields = new Set([...(rules.neverSync || []), ...GLOBAL_NEVER_SYNC]);
        for (const f of neverFields) {
          if (payload[f] !== undefined) {
            validationErrors.sensitive_field_not_stripped++;
          }
        }

        // Verify field authority — no Arriv One-authoritative fields in outbound payload
        for (const f of (rules.arrivOneAuthoritative || [])) {
          if (payload[f] !== undefined) {
            validationErrors.field_authority_violation++;
          }
        }

        // Generate idempotency key
        const effectiveSharedId = sharedId || `em-${r.id}`;
        const idempotencyKey = generateIdempotencyKey(effectiveSharedId, sourceUpdatedAt, "create");
        if (!idempotencyKey) {
          validationErrors.missing_idempotency_key++;
        }

        // Generate event type
        const eventType = getEventType(canonicalType, "create", []);

        // Payload size check
        const payloadSize = new TextEncoder().encode(JSON.stringify(payload)).length;
        if (payloadSize > 256 * 1024) {
          validationErrors.payload_too_large++;
        }

        // Schema validation risk
        if (canonicalType === "Contact" && !payload.email && !payload.phone) {
          validationErrors.schema_validation_risk++;
          entityExcluded++;
          totalExcluded++;
          continue;
        }

        // Build a sanitized example (first 2 records per entity, with PII redacted)
        if (entityGenerated < 2) {
          const sanitizedExample = {
            entity_type: canonicalType,
            operation: "create",
            event_type: eventType,
            immutable_shared_id: sharedId ? "[present]" : "[would_generate]",
            record_version: recordVersion ?? "[missing]",
            source_updated_at: sourceUpdatedAt ? "[present]" : "[missing]",
            idempotency_key: "[generated]",
            payload_field_count: Object.keys(payload).length,
            payload_size_bytes: payloadSize,
            sensitive_fields_stripped: [...neverFields].filter(f => r[f] !== undefined && r[f] !== null && r[f] !== ""),
            dependency_refs: {
              contact_id: r.contact_id ? "[present]" : undefined,
              sales_member_id: r.sales_member_id ? "[present]" : undefined,
              conversation_id: r.conversation_id ? "[present]" : undefined,
            },
          };
          validatedPayloads.push(sanitizedExample);
        }

        entityGenerated++;
        totalGenerated++;
      }

      perEntity[canonicalType] = {
        local_entity: localEntity,
        production_records: productionRecords.length,
        eligible: eligibleRecords.length,
        payloads_generated: entityGenerated,
        excluded: entityExcluded,
      };
    }

    return Response.json({
      success: true,
      tenant_id: tenantId,
      sync_mode: cfg.arriv_one_sync_mode,
      migration_authorized: cfg.migration_authorized || false,
      generated_at: new Date().toISOString(),
      dry_run: true,
      transmitted: false,
      per_entity: perEntity,
      validation_errors: validationErrors,
      sanitized_examples: validatedPayloads,
      summary: {
        total_eligible: totalEligible,
        total_payloads_generated: totalGenerated,
        total_excluded: totalExcluded,
        total_validation_errors: Object.values(validationErrors).reduce((a, b) => a + b, 0),
        has_blocking_errors: validationErrors.missing_immutable_shared_id > 0 || validationErrors.missing_record_version > 0 || validationErrors.sensitive_field_not_stripped > 0 || validationErrors.field_authority_violation > 0,
      },
    });
  } catch (error) {
    console.error("getEstateMediaMigrationDryRun error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
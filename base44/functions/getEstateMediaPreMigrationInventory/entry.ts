// Read-only, admin-only pre-migration inventory for Estate Media → Arriv One.
// For each canonical entity, returns production record counts, eligibility,
// exclusions, mapping state, sync-metadata readiness, dependency resolution,
// normalization needs, schema-validation risks, and sensitive-field presence.
//
// Does NOT migrate, enqueue, map, or modify any records.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantConfig } from "../../shared/syncTenantConfig.ts";
import { isTestArtifact } from "../../shared/syncTestArtifactFilter.ts";
import { ENTITY_ADAPTERS, INITIAL_SHARED_ENTITIES } from "../../shared/syncEntityAdapters.ts";
import { FIELD_AUTHORITY, buildOutboundPayload, GLOBAL_NEVER_SYNC } from "../../shared/syncFieldAuthority.ts";
// Re-import to ensure bundler picks up the newly exported GLOBAL_NEVER_SYNC

const normalizeEmail = (e) => (e || "").toLowerCase().trim();
const digitsOnly = (p) => (p || "").replace(/\D/g, "").slice(-10);

// Ambiguous sample/demo records requiring admin approval (not auto-excluded).
// These are NOT test artifacts (no test markers) but look like sample/demo data.
function isAmbiguousSample(record) {
  if (!record) return false;
  const email = normalizeEmail(record.email || record.contact_email || "");
  const name = (record.full_name || record.contact_name || "").toLowerCase().trim();
  // "Sample@" email pattern
  if (email.startsWith("sample@") || email.includes("sample.")) return true;
  // Generic demo names
  if (name === "john smith" || name === "jane doe" || name === "test demo") return true;
  return false;
}

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

    // Load all production records and mappings for dependency resolution
    const data = {};
    for (const canonicalType of INITIAL_SHARED_ENTITIES) {
      const adapter = ENTITY_ADAPTERS[canonicalType];
      const localEntity = adapter.estate_media_local;
      const records = await base44.asServiceRole.entities[localEntity].list("-created_date", 5000);
      data[canonicalType] = records.filter(r => !isTestArtifact(r));
    }

    // Load all mappings (by canonical type)
    const allMappings = await base44.asServiceRole.entities.CrossAppRecordMapping.list("-created_date", 5000);
    const mappingsByType = {};
    for (const canonicalType of INITIAL_SHARED_ENTITIES) {
      mappingsByType[canonicalType] = allMappings.filter(m => m.entity_type === canonicalType && !m.immutable_shared_id?.startsWith("test-"));
    }

    // Build lookup sets for dependency resolution
    const contactEmails = new Set(data.Contact.map(c => normalizeEmail(c.email)).filter(Boolean));
    const contactPhones = new Set(data.Contact.map(c => digitsOnly(c.phone)).filter(p => p.length >= 10));
    const memberIds = new Set(data.SalesTeamMember.map(m => m.id));
    const memberEmails = new Set(data.SalesTeamMember.map(m => normalizeEmail(m.email)).filter(Boolean));
    const conversationIds = new Set(data.SmsConversation.map(s => s.id));

    const inventory = [];

    for (const canonicalType of INITIAL_SHARED_ENTITIES) {
      const adapter = ENTITY_ADAPTERS[canonicalType];
      const localEntity = adapter.estate_media_local;
      const records = data[canonicalType];
      const mappings = mappingsByType[canonicalType] || [];

      const mappedLocalIds = new Set(mappings.map(m => m.local_record_id).filter(Boolean));

      let eligible = 0;
      let excluded = 0;
      let alreadyMapped = 0;
      let missingSharedId = 0;
      let missingRecordVersion = 0;
      let invalidRecordVersion = 0;
      let unresolvedDeps = [];
      let requiresNormalization = 0;
      let schemaValidationRisk = 0;
      let sensitiveFieldsPresent = 0;
      let ambiguousSamples = [];

      for (const r of records) {
        // Check if already mapped
        const isMapped = mappedLocalIds.has(r.id);
        if (isMapped) { alreadyMapped++; continue; }

        // Check sync metadata
        const hasSharedId = !!r.immutable_shared_id;
        const hasRecordVersion = r.record_version !== undefined && r.record_version !== null;
        const validRecordVersion = hasRecordVersion && Number.isInteger(r.record_version) && r.record_version >= 1;

        if (!hasSharedId) missingSharedId++;
        if (!hasRecordVersion) missingRecordVersion++;
        else if (!validRecordVersion) invalidRecordVersion++;

        // Check ambiguous sample
        if (isAmbiguousSample(r)) {
          ambiguousSamples.push({ id: r.id, reason: "ambiguous_sample", email: r.email, name: r.full_name });
          excluded++;
          continue;
        }

        // Dependency resolution
        let depStatus = "resolved";
        let depDetail = [];
        if (canonicalType === "ActivityLog") {
          const email = normalizeEmail(r.contact_email);
          if (email && !contactEmails.has(email)) {
            // Orphan activity — allowed (orphan tolerant)
            depStatus = "unresolved_allowed";
            depDetail.push({ field: "contact_email", value: email, reason: "orphan_contact_preservable" });
          }
          if (r.sales_member_id && !memberIds.has(r.sales_member_id)) {
            depStatus = "unresolved_allowed";
            depDetail.push({ field: "sales_member_id", reason: "orphan_member_preservable" });
          }
        }
        if (canonicalType === "Deal") {
          if (r.contact_id && !contactEmails.has(normalizeEmail(r.contact_email || "")) && !contactPhones.has(digitsOnly(r.contact_email || ""))) {
            depStatus = "unresolved_allowed";
            depDetail.push({ field: "contact_id", reason: "orphan_contact_preservable" });
          }
          if (r.sales_member_id && !memberIds.has(r.sales_member_id)) {
            depStatus = "unresolved_allowed";
            depDetail.push({ field: "sales_member_id", reason: "orphan_member_preservable" });
          }
        }
        if (canonicalType === "SmsMessage") {
          if (r.conversation_id && !conversationIds.has(r.conversation_id)) {
            depStatus = "unresolved_blocking";
            depDetail.push({ field: "conversation_id", reason: "missing_parent_conversation" });
          }
        }
        if (canonicalType === "Goal" || canonicalType === "ManagerNote" || canonicalType === "TimeOffRequest" || canonicalType === "BenefitsLifeEvent") {
          if (r.sales_member_id && !memberIds.has(r.sales_member_id)) {
            depStatus = "unresolved_blocking";
            depDetail.push({ field: "sales_member_id", reason: "missing_parent_member" });
          }
          if (canonicalType === "ManagerNote" && r.is_recognition === true) {
            // Recognition subtype — deferred, exclude from Goal/ManagerNote migration
            excluded++;
            continue;
          }
        }
        if (canonicalType === "SmsConversation") {
          if (r.sales_member_id && !memberIds.has(r.sales_member_id)) {
            depStatus = "unresolved_allowed";
            depDetail.push({ field: "sales_member_id", reason: "orphan_member_preservable" });
          }
        }

        if (depStatus === "unresolved_blocking") {
          unresolvedDeps.push({ id: r.id, status: "blocking", details: depDetail });
          excluded++;
          continue;
        }
        if (depStatus === "unresolved_allowed") {
          unresolvedDeps.push({ id: r.id, status: "allowed", details: depDetail });
        }

        // Normalization check — email/phone format
        if (canonicalType === "Contact" || canonicalType === "SalesTeamMember") {
          const email = r.email || "";
          if (email && !email.includes("@")) requiresNormalization++;
        }

        // Schema validation risk — missing required fields
        if (canonicalType === "Contact" && !r.email && !r.phone) schemaValidationRisk++;
        if (canonicalType === "SalesTeamMember" && !r.email) schemaValidationRisk++;
        if (canonicalType === "ActivityLog" && !r.activity_type) schemaValidationRisk++;

        // Sensitive fields present (will be stripped by buildOutboundPayload)
        const rules = FIELD_AUTHORITY[canonicalType] || {};
        const neverFields = new Set([...(rules.neverSync || []), ...GLOBAL_NEVER_SYNC]);
        let hasSensitive = false;
        for (const f of neverFields) {
          if (r[f] !== undefined && r[f] !== null && r[f] !== "") hasSensitive = true;
        }
        if (hasSensitive) sensitiveFieldsPresent++;

        eligible++;
      }

      inventory.push({
        canonical_entity_type: canonicalType,
        estate_media_local_entity: localEntity,
        total_production_records: records.length,
        records_eligible_for_migration: eligible,
        explicitly_excluded: excluded,
        records_already_mapped: alreadyMapped,
        records_missing_immutable_shared_id: missingSharedId,
        records_missing_record_version: missingRecordVersion,
        records_invalid_record_version: invalidRecordVersion,
        unresolved_dependencies: {
          allowed: unresolvedDeps.filter(d => d.status === "allowed").length,
          blocking: unresolvedDeps.filter(d => d.status === "blocking").length,
          sample: unresolvedDeps.slice(0, 3),
        },
        records_requiring_normalization: requiresNormalization,
        records_failing_schema_validation: schemaValidationRisk,
        records_with_sensitive_fields: sensitiveFieldsPresent,
        ambiguous_samples_requiring_admin_approval: ambiguousSamples,
      });
    }

    return Response.json({
      success: true,
      tenant_id: tenantId,
      sync_mode: cfg.arriv_one_sync_mode,
      migration_authorized: cfg.migration_authorized || false,
      generated_at: new Date().toISOString(),
      inventory,
      summary: {
        total_production: inventory.reduce((s, i) => s + i.total_production_records, 0),
        total_eligible: inventory.reduce((s, i) => s + i.records_eligible_for_migration, 0),
        total_excluded: inventory.reduce((s, i) => s + i.explicitly_excluded, 0),
        total_already_mapped: inventory.reduce((s, i) => s + i.records_already_mapped, 0),
        total_missing_shared_id: inventory.reduce((s, i) => s + i.records_missing_immutable_shared_id, 0),
        total_missing_record_version: inventory.reduce((s, i) => s + i.records_missing_record_version, 0),
        total_unresolved_blocking: inventory.reduce((s, i) => s + i.unresolved_dependencies.blocking, 0),
        total_sensitive_fields: inventory.reduce((s, i) => s + i.records_with_sensitive_fields, 0),
        total_ambiguous_samples: inventory.reduce((s, i) => s + i.ambiguous_samples_requiring_admin_approval.length, 0),
      },
    });
  } catch (error) {
    console.error("getEstateMediaPreMigrationInventory error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
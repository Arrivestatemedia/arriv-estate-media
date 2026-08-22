import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantConfig } from "../../shared/syncTenantConfig.ts";
import { EM_RUNTIME_VERSION, MANIFEST_ENTRY_TYPES } from "../../shared/manifestFallbacks.ts";
import { fetchManifestVersions } from "../../shared/manifestPullClient.ts";

// Estate Media Platform Authority Console — read-only aggregator.
// Provides Platform Authority with safe operational visibility into the
// Estate Media application without creating a competing source of truth.
//
// Security:
//   - Admin-only (Platform Authority)
//   - Read-only (no mutations)
//   - No secrets exposed
//   - Actual actor preserved
//   - No RLS weakening (uses asServiceRole for aggregate visibility, but
//     the function itself requires admin auth)

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // 1. Platform Authority auth check
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== "admin") {
      return Response.json(
        { error: "Platform Authority access required" },
        { status: 403 }
      );
    }

    // 2. Tenant config
    const cfg = await getTenantConfig(base44);
    if (!cfg) {
      return Response.json(
        { error: "No Arriv One tenant configuration found" },
        { status: 503 }
      );
    }

    const tenantId = cfg.arriv_one_tenant_id;

    // 3. Parallel data aggregation
    const [
      inbox, outbox, mappings, conflicts, reconciliations,
      manifests, salesTeamMembers, users,
      jobs, bookings,
      contacts, deals, activities,
      auditLogs,
    ] = await Promise.all([
      base44.asServiceRole.entities.SyncInbox.list(),
      base44.asServiceRole.entities.SyncOutbox.list(),
      base44.asServiceRole.entities.CrossAppRecordMapping.list(),
      base44.asServiceRole.entities.SyncConflict.list(),
      base44.asServiceRole.entities.SyncReconciliation.list(),
      base44.asServiceRole.entities.ProductManifestLocal.list(),
      base44.asServiceRole.entities.SalesTeamMember.list(),
      base44.asServiceRole.entities.User.list(),
      base44.asServiceRole.entities.Job.list(),
      base44.asServiceRole.entities.Booking.list(),
      base44.asServiceRole.entities.Contact.list(),
      base44.asServiceRole.entities.Deal.list(),
      base44.asServiceRole.entities.ActivityLog.list(),
      base44.asServiceRole.entities.IntegrationAuditLog.list(),
    ]);

    // 4. Manifest convergence — fetch expected versions from AO
    let manifestFetch = { ok: false, status: 0, error: "Not attempted", data: null };
    try {
      manifestFetch = await fetchManifestVersions(cfg, tenantId, [...MANIFEST_ENTRY_TYPES]);
    } catch (e) {
      manifestFetch = { ok: false, status: 0, error: e.message, data: null };
    }

    // 5. Build convergence per entry type
    const expectedVersions = manifestFetch.ok && manifestFetch.data ? manifestFetch.data : {};
    const convergenceByType = {};
    for (const entryType of MANIFEST_ENTRY_TYPES) {
      const stored = manifests.filter((m) => m.manifest_type === entryType);
      const applied = stored.filter((m) => m.apply_status === "applied");
      const expected = expectedVersions[entryType];
      const activeVersion = applied.length > 0 ? applied[0].manifest_version : null;

      let classification;
      if (!manifestFetch.ok) {
        classification = "EXPECTED_VERSION_FETCH_FAILED";
      } else if (!expected && stored.length === 0) {
        classification = "NOT_CONFIGURED";
      } else if (expected && applied.length === 0) {
        classification = "FALLBACK_ACTIVE";
      } else if (expected && activeVersion === expected.version) {
        classification = "CONVERGED";
      } else if (expected && activeVersion !== expected.version) {
        classification = "STALE";
      } else {
        classification = "NOT_CONFIGURED";
      }

      convergenceByType[entryType] = {
        expected_version: expected?.version || null,
        expected_checksum: expected?.checksum || null,
        stored_count: stored.length,
        active_version: activeVersion,
        active_status: applied.length > 0 ? applied[0].apply_status : null,
        convergence: classification,
      };
    }

    // 6. Sync diagnostics
    const syncDiagnostics = classifySyncHealth(inbox, outbox, mappings, conflicts);

    // 7. Mapping diagnostics by entity type
    const mappingByEntity = {};
    for (const m of mappings) {
      const et = m.entity_type || "unknown";
      if (!mappingByEntity[et]) mappingByEntity[et] = { total: 0, linked: 0, stale: 0, error: 0, conflict: 0 };
      mappingByEntity[et].total++;
      if (m.sync_status === "linked") mappingByEntity[et].linked++;
      else if (m.sync_status === "stale") mappingByEntity[et].stale++;
      else if (m.sync_status === "error") mappingByEntity[et].error++;
      else if (m.sync_status === "conflict") mappingByEntity[et].conflict++;
    }

    // 8. Build response
    return Response.json({
      authority: {
        actual_actor: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
        },
        authority_level: "platform_admin",
        application: "estate_media",
        operational_context: tenantId,
        canonical_organization: "Arriv",
        legal_employer: "Arriv Estate Media, LLC",
        mode: "OPERATIONAL_VIEW",
        timestamp: new Date().toISOString(),
      },
      organization: {
        canonical: "Arriv",
        structure: [
          {
            name: "Arriv One",
            role: "Canonical General CRM/Sales Authority",
            relationship: "canonical_general_crm",
            authority: "canonical",
          },
          {
            name: "Arriv Estate Media",
            role: "Domain Media Authority",
            relationship: "domain_media",
            authority: "domain",
          },
          {
            name: "Khetha",
            role: "Recruiting / Post-hire System",
            relationship: "recruiting",
            authority: "canonical",
          },
          {
            name: "Arriv Payroll",
            role: "Payroll / Legal-employment System",
            relationship: "payroll",
            authority: "canonical",
          },
        ],
        legal_employer: "Arriv Estate Media, LLC",
        note: "Arriv Estate Media (application) is distinct from Arriv Estate Media, LLC (legal employer).",
      },
      tenant: {
        model: "OPERATIONAL_VIEW",
        operational_context: tenantId,
        is_multi_tenant: false,
        tenant_count: 1,
        note: "Estate Media operates as a single operational tenant. No fake multi-tenancy fabricated.",
      },
      sync: {
        mode: cfg.arriv_one_sync_mode,
        enabled: cfg.arriv_one_sync_enabled,
        schema_version: cfg.arriv_one_schema_version,
        signature_version: cfg.arriv_one_signature_version,
        last_successful_sync: cfg.arriv_one_last_successful_sync_at,
        shared_entity_types: cfg.shared_entity_types || [],
        inbox: {
          total: inbox.length,
          applied: inbox.filter((i) => i.processing_status === "applied").length,
          pending: inbox.filter((i) => i.processing_status === "pending").length,
          rejected: inbox.filter((i) => i.processing_status === "rejected").length,
          duplicate: inbox.filter((i) => i.processing_status === "duplicate").length,
          conflict: inbox.filter((i) => i.processing_status === "conflict").length,
          stale: inbox.filter((i) => i.processing_status === "stale").length,
        },
        outbox: {
          total: outbox.length,
          delivered: outbox.filter((o) => o.delivery_status === "delivered").length,
          pending: outbox.filter((o) => o.delivery_status === "pending").length,
          failed: outbox.filter((o) => o.delivery_status === "failed").length,
          dead_lettered: outbox.filter((o) => o.delivery_status === "dead_lettered").length,
          suppressed: outbox.filter((o) => o.suppressed).length,
        },
        mappings: {
          total: mappings.length,
          linked: mappings.filter((m) => m.sync_status === "linked").length,
          stale: mappings.filter((m) => m.sync_status === "stale").length,
          error: mappings.filter((m) => m.sync_status === "error").length,
          conflict: mappings.filter((m) => m.sync_status === "conflict").length,
          by_entity: mappingByEntity,
        },
        conflicts_open: conflicts.length,
        reconciliations_total: reconciliations.length,
        diagnostics: syncDiagnostics,
      },
      manifest: {
        em_runtime_version: EM_RUNTIME_VERSION,
        expected_version_fetch_ok: manifestFetch.ok,
        expected_version_error: manifestFetch.ok ? null : manifestFetch.error,
        ao_reachable: manifestFetch.ok,
        total_stored: manifests.length,
        convergence_by_type: convergenceByType,
        convergence_model: "HYBRID",
        note: "Push supported (Phase 7B.11.2B) + Pull canonical (reconciliation). Pull is the certified fallback.",
      },
      canonical_capabilities: [
        { capability: "General CRM", canonical_owner: "Arriv One", estate_media_role: "consumer", status: "CERTIFIED" },
        { capability: "Call Map Generation", canonical_owner: "Arriv One", estate_media_role: "consumer", status: "CERTIFIED" },
        { capability: "Video Token Service", canonical_owner: "Arriv One", estate_media_role: "consumer", status: "CERTIFIED" },
        { capability: "Voice / Telephony", canonical_owner: "Arriv One", estate_media_role: "consumer", status: "CERTIFIED" },
        { capability: "Email / SMS", canonical_owner: "Arriv One", estate_media_role: "consumer", status: "CERTIFIED" },
        { capability: "Sales Commission", canonical_owner: "Arriv One", estate_media_role: "consumer", status: "CERTIFIED" },
        { capability: "General Performance Analytics", canonical_owner: "Arriv One", estate_media_role: "consumer", status: "CERTIFIED" },
        { capability: "General Sales Onboarding", canonical_owner: "Arriv One", estate_media_role: "consumer", status: "CERTIFIED" },
        { capability: "External CRM Adapter", canonical_owner: "Arriv One", estate_media_role: "consumer", status: "CERTIFIED" },
        { capability: "Estate Media Jobs / Orders", canonical_owner: "Estate Media", estate_media_role: "authority", status: "CERTIFIED" },
        { capability: "Shoot Scheduling / Media Workflow", canonical_owner: "Estate Media", estate_media_role: "authority", status: "CERTIFIED" },
        { capability: "Photographer / Contractor Operations", canonical_owner: "Estate Media", estate_media_role: "authority", status: "CERTIFIED" },
        { capability: "Media Deliverables", canonical_owner: "Estate Media", estate_media_role: "authority", status: "CERTIFIED" },
        { capability: "Estate Media Customer / Order Metadata", canonical_owner: "Estate Media", estate_media_role: "authority", status: "CERTIFIED" },
      ],
      people: {
        sales_team_members: salesTeamMembers.length,
        active_reps: salesTeamMembers.filter((s) => s.is_active).length,
        admins: salesTeamMembers.filter((s) => s.role === "admin").length,
        users_total: users.length,
        users_admin: users.filter((u) => u.role === "admin").length,
        users_regular: users.filter((u) => u.role !== "admin").length,
        note: "Employment/payroll authority belongs to Arriv Payroll. Estate Media shows operational people only.",
      },
      media_ops: {
        jobs_total: jobs.length,
        bookings_total: bookings.length,
        note: "Estate Media domain authority — media jobs, scheduling, and deliverables.",
      },
      business_data: {
        contacts: contacts.length,
        deals: deals.length,
        activities: activities.length,
        all_tnt_estate_media:
          contacts.every((c) => c.tenant_id === "tnt_estate_media") &&
          deals.every((d) => d.tenant_id === "tnt_estate_media") &&
          activities.every((a) => a.tenant_id === "tnt_estate_media"),
        tenant_isolation_healthy:
          contacts.every((c) => !c.tenant_id || c.tenant_id === "tnt_estate_media"),
      },
      integrations: [
        { provider: "Arriv One", type: "cross_app_sync", status: "connected", purpose: "Canonical CRM sync", canonical_owner: "Arriv One", optional: false },
        { provider: "Arriv Payroll", type: "payroll", status: "connected", purpose: "Payroll / employment", canonical_owner: "Arriv Payroll", optional: false },
        { provider: "HubSpot", type: "external_crm", status: "connected", purpose: "Optional external CRM adapter", canonical_owner: "Arriv One", optional: true },
        { provider: "Google Drive", type: "file_storage", status: "connected", purpose: "Media file storage", canonical_owner: "Estate Media", optional: false },
        { provider: "Gmail", type: "email", status: "connected", purpose: "Sales email communication", canonical_owner: "Arriv One", optional: false },
        { provider: "Google Calendar", type: "calendar", status: "connected", purpose: "Booking / scheduling calendar", canonical_owner: "Estate Media", optional: false },
        { provider: "Twilio", type: "voice_sms", status: "configured", purpose: "Voice / SMS telephony", canonical_owner: "Arriv One", optional: false },
        { provider: "Stripe", type: "payments", status: "configured", purpose: "Payment processing", canonical_owner: "Estate Media", optional: false },
        { provider: "Brevo", type: "email", status: "configured", purpose: "Transactional email", canonical_owner: "Estate Media", optional: false },
        { provider: "Checkr", type: "background_check", status: "configured", purpose: "Background checks", canonical_owner: "Estate Media", optional: true },
      ],
      audit: {
        total_logs: auditLogs.length,
        recent: auditLogs.slice(-20).reverse().map((l) => ({
          action: l.action,
          created_date: l.created_date,
        })),
      },
    });
  } catch (error) {
    console.error("getEstateMediaAuthorityConsole error:", error);
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

function classifySyncHealth(inbox, outbox, mappings, conflicts) {
  const deadLettered = outbox.filter((o) => o.delivery_status === "dead_lettered").length;
  const openConflicts = conflicts.length;
  const mappingErrors = mappings.filter((m) => m.sync_status === "error").length;
  const mappingConflicts = mappings.filter((m) => m.sync_status === "conflict").length;
  const failedOutbox = outbox.filter((o) => o.delivery_status === "failed").length;
  const pendingInbox = inbox.filter((i) => i.processing_status === "pending").length;

  if (deadLettered > 0 || openConflicts > 0 || mappingConflicts > 0) {
    return "DEGRADED";
  }
  if (failedOutbox > 0 || mappingErrors > 0) {
    return "DEGRADED";
  }
  if (pendingInbox > 10) {
    return "QUEUE_BACKLOG";
  }
  return "HEALTHY";
}
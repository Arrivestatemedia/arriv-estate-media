import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantConfig } from "../../shared/syncTenantConfig.ts";

// Debug: inspect the actual values in records and mappings to find the mismatch.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    const cfg = await getTenantConfig(base44);
    const canonicalTenantId = cfg?.arriv_one_tenant_id || null;

    // Load all SalesTeamMembers
    const members = await db.entities.SalesTeamMember.list("-created_date", 500);
    const validIds = new Set(members.map((m) => m.id));

    // Load all CrossAppRecordMappings for SalesTeamMember
    const allMappings = await db.entities.CrossAppRecordMapping.filter({ entity_type: "SalesTeamMember" });
    const stmMappings = allMappings.filter((m) => m.entity_type === "SalesTeamMember");

    // Sample Contacts with invalid owner_id
    const contacts = await db.entities.Contact.list("-created_date", 5000);
    const badContacts = contacts.filter((c) => !validIds.has(c.owner_id)).slice(0, 3);

    const contactDebug = badContacts.map((c) => {
      const mappingByRecordTenant = stmMappings.find((m) => m.remote_record_id === c.owner_id && m.tenant_id === c.tenant_id);
      const mappingByCanonicalTenant = stmMappings.find((m) => m.remote_record_id === c.owner_id && m.tenant_id === canonicalTenantId);
      const mappingAnyTenant = stmMappings.find((m) => m.remote_record_id === c.owner_id);
      return {
        contact_id: c.id,
        owner_id_raw: c.owner_id,
        contact_tenant_id: c.tenant_id,
        canonical_tenant_id: canonicalTenantId,
        mapping_found_by_record_tenant: !!mappingByRecordTenant,
        mapping_found_by_canonical_tenant: !!mappingByCanonicalTenant,
        mapping_found_any_tenant: !!mappingAnyTenant,
        mapping_local_record_id: mappingAnyTenant?.local_record_id || null,
        mapping_local_exists: mappingAnyTenant ? validIds.has(mappingAnyTenant.local_record_id) : false,
        mapping_tenant_id: mappingAnyTenant?.tenant_id || null,
      };
    });

    // Sample Deals with invalid sales_member_id
    const deals = await db.entities.Deal.list("-created_date", 5000);
    const badDeals = deals.filter((d) => !validIds.has(d.sales_member_id)).slice(0, 3);

    const dealDebug = badDeals.map((d) => {
      const mappingAnyTenant = stmMappings.find((m) => m.remote_record_id === d.sales_member_id);
      return {
        deal_id: d.id,
        sales_member_id_raw: d.sales_member_id,
        deal_tenant_id: d.tenant_id,
        mapping_found_any_tenant: !!mappingAnyTenant,
        mapping_local_record_id: mappingAnyTenant?.local_record_id || null,
        mapping_local_exists: mappingAnyTenant ? validIds.has(mappingAnyTenant.local_record_id) : false,
        mapping_tenant_id: mappingAnyTenant?.tenant_id || null,
      };
    });

    // All mappings summary
    const mappingsSummary = stmMappings.map((m) => ({
      mapping_id: m.id,
      tenant_id: m.tenant_id,
      remote_record_id: m.remote_record_id,
      local_record_id: m.local_record_id,
      local_exists: validIds.has(m.local_record_id),
      sync_status: m.sync_status,
    }));

    return Response.json({
      canonical_tenant_id: canonicalTenantId,
      total_members: members.length,
      total_stm_mappings: stmMappings.length,
      mappings_summary: mappingsSummary,
      contact_debug: contactDebug,
      deal_debug: dealDebug,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { findMappingByRemoteId } from "../../shared/syncMapping.ts";

// One-time backfill: fixes existing ActivityLog/Contact/Deal records whose
// sales_member_id (or owner_id) was written as a raw Arriv One UUID because
// the SalesTeamMember cross-app mapping was missing at sync time. Per-rep RLS
// (data.sales_member_id === {{user.data.sales_member_id}}) hides those records,
// so reps see empty tabs. This re-resolves each bad reference via mapping, or
// via sales_member_email for ActivityLog, and writes the correct local ID.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;
    const normalizeEmail = (e) => (e || "").toLowerCase().trim();

    // Load all local SalesTeamMembers -> valid ID set + email index
    const members = await db.entities.SalesTeamMember.list("-created_date", 500);
    const validIds = new Set(members.map((m) => m.id));
    const byEmail = {};
    for (const m of members) {
      const e = normalizeEmail(m.email);
      if (e && !byEmail[e]) byEmail[e] = m.id;
    }

    const stats = {
      activity_log: { total: 0, already_correct: 0, fixed: 0, unresolvable: 0 },
      contact: { total: 0, already_correct: 0, fixed: 0, unresolvable: 0 },
      deal: { total: 0, already_correct: 0, fixed: 0, unresolvable: 0 },
    };

    const isValid = (id) => !!id && validIds.has(id);

    // --- ActivityLog (has sales_member_email fallback) ---
    const activities = await db.entities.ActivityLog.list("-created_date", 5000);
    for (const a of activities) {
      stats.activity_log.total++;
      if (isValid(a.sales_member_id)) { stats.activity_log.already_correct++; continue; }
      let newId = null;
      const email = normalizeEmail(a.sales_member_email);
      if (email && byEmail[email]) newId = byEmail[email];
      if (!newId && a.sales_member_id) {
        const mapping = await findMappingByRemoteId(base44, a.tenant_id, "SalesTeamMember", a.sales_member_id);
        if (mapping?.local_record_id && validIds.has(mapping.local_record_id)) newId = mapping.local_record_id;
      }
      if (newId) {
        await db.entities.ActivityLog.update(a.id, { sales_member_id: newId });
        stats.activity_log.fixed++;
      } else {
        stats.activity_log.unresolvable++;
      }
    }

    // --- Contact (owner_id, mapping-only) ---
    const contacts = await db.entities.Contact.list("-created_date", 5000);
    for (const c of contacts) {
      stats.contact.total++;
      if (isValid(c.owner_id)) { stats.contact.already_correct++; continue; }
      let newId = null;
      if (c.owner_id) {
        const mapping = await findMappingByRemoteId(base44, c.tenant_id, "SalesTeamMember", c.owner_id);
        if (mapping?.local_record_id && validIds.has(mapping.local_record_id)) newId = mapping.local_record_id;
      }
      if (newId) {
        await db.entities.Contact.update(c.id, { owner_id: newId });
        stats.contact.fixed++;
      } else {
        stats.contact.unresolvable++;
      }
    }

    // --- Deal (sales_member_id, mapping-only) ---
    const deals = await db.entities.Deal.list("-created_date", 5000);
    for (const d of deals) {
      stats.deal.total++;
      if (isValid(d.sales_member_id)) { stats.deal.already_correct++; continue; }
      let newId = null;
      if (d.sales_member_id) {
        const mapping = await findMappingByRemoteId(base44, d.tenant_id, "SalesTeamMember", d.sales_member_id);
        if (mapping?.local_record_id && validIds.has(mapping.local_record_id)) newId = mapping.local_record_id;
      }
      if (newId) {
        await db.entities.Deal.update(d.id, { sales_member_id: newId });
        stats.deal.fixed++;
      } else {
        stats.deal.unresolvable++;
      }
    }

    return Response.json({ success: true, stats });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});

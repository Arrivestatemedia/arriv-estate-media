import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";
import { getTenantConfig } from "../../shared/syncTenantConfig.ts";
import { naturalKeyMatch, findMappingByRemoteId, createMapping } from "../../shared/syncMapping.ts";

const INBOUND_SECRET = "ESTATE_MEDIA_ARRIV_ONE_SYNC_INBOUND_SECRET";

// Receives a signed SalesTeamMember roster from Arriv One and creates
// CrossAppRecordMappings directly - without going through the sync event
// pipeline. This bypasses loop-suppression (reps that originated from
// Estate Media) and per-tenant sync-enabled gating, which both block the
// normal sync path from creating the mappings those reps need.
//
// Existing local reps are NOT updated (no is_active/role/employment_status
// overwrite). Only a mapping is created. If no local rep exists, a new
// one is created with Arriv One's data.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const signature = req.headers.get("x-arriv-one-signature");

    // Verify HMAC signature
    const secret = secrets.get(INBOUND_SECRET);
    if (!secret) return Response.json({ error: "Inbound secret not configured" }, { status: 500 });
    if (!signature) return Response.json({ error: "Missing signature" }, { status: 401 });

    const rawBody = JSON.stringify(body);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigBytes = new Uint8Array(signature.match(/.{2}/g).map((b) => parseInt(b, 16)));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(rawBody));
    if (!valid) return Response.json({ error: "Invalid signature" }, { status: 401 });

    const cfg = await getTenantConfig(base44);
    if (!cfg) return Response.json({ error: "No tenant config" }, { status: 503 });
    const tenantId = cfg.arriv_one_tenant_id;

    const roster = body.roster || [];
    const stats = {
      total: roster.length,
      mapping_created: 0,
      mapping_already_exists: 0,
      local_rep_found: 0,
      local_rep_created: 0,
      errors: [],
    };

    for (const rep of roster) {
      try {
        // Skip if mapping already exists
        const existing = await findMappingByRemoteId(base44, tenantId, "SalesTeamMember", rep.remote_id);
        if (existing) {
          stats.mapping_already_exists++;
          continue;
        }

        // Find local SalesTeamMember by email
        let localRep = await naturalKeyMatch(base44, "SalesTeamMember", { email: rep.email });

        if (localRep) {
          stats.local_rep_found++;
        } else {
          // Create new local SalesTeamMember with Arriv One's data
          localRep = await base44.asServiceRole.entities.SalesTeamMember.create({
            email: rep.email,
            full_name: rep.full_name,
            is_active: rep.is_active ?? false,
            role: rep.role || "user",
            employment_status: rep.employment_status || "pending_offer",
            sync_source: "arriv_one",
            immutable_shared_id: crypto.randomUUID(),
          });
          stats.local_rep_created++;
        }

        // Create the mapping (remote Arriv One ID -> local Estate Media ID)
        await createMapping(base44, {
          tenantId,
          entityType: "SalesTeamMember",
          localRecordId: localRep.id,
          remoteRecordId: rep.remote_id,
          immutableSharedId: localRep.immutable_shared_id || crypto.randomUUID(),
          origin: "arriv_one",
          eventId: "bulk-link-" + Date.now(),
        });
        stats.mapping_created++;
      } catch (e) {
        stats.errors.push({ remote_id: rep.remote_id, email: rep.email, error: e.message });
      }
    }

    return Response.json({ success: true, stats });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

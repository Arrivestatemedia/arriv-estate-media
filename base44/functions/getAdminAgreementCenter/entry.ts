import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Re-pointed to read from the unified Sign system (SignDocument/SignRequest)
// instead of the deprecated Agreement entities. Returns data in a
// format compatible with the ArrivAgreementsCenter frontend.
//
// Sales reps (non-admin sales team members) only see SignRequests they sent
// (filtered by sent_by_email). Admins see all agreement-category documents.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { filters, limit, offset, sales_member_id } = body;

    // ── Resolve caller identity ──────────────────────────────────────────
    let actorEmail = '';
    let isSalesRep = false;
    let isPlatformAdmin = false;

    try {
      const me = await base44.auth.me();
      if (me && me.role === "admin") {
        isPlatformAdmin = true;
        actorEmail = me.email || "";
      }
    } catch (_) { /* not platform auth */ }

    if (!isPlatformAdmin && sales_member_id) {
      try {
        const member = await base44.asServiceRole.entities.SalesTeamMember.get(sales_member_id);
        if (member) {
          actorEmail = member.email || "";
          isSalesRep = member.role !== "admin";
        }
      } catch (_) {}
    }

    // ── Build filter for SignRequests ────────────────────────────────────
    const reqFilter: any = { document_category: "agreement" };

    // Map agreement-style status filters to sign status
    if (filters?.status) {
      const statusMap: Record<string, string> = {
        SENT: "sent", DELIVERED: "sent", OPENED: "viewed", VIEWING: "viewed",
        SIGNING: "viewed", PARTIALLY_SIGNED: "viewed",
        COMPLETED: "signed", DECLINED: "declined", VOIDED: "voided",
        EXPIRED: "expired", DRAFT: "sent", PREPARING: "sent", READY_TO_SEND: "sent",
      };
      const mapped = statusMap[filters.status] || filters.status.toLowerCase();
      if (mapped) reqFilter.status = mapped;
    }

    // Sales reps only see their own sent documents
    if (isSalesRep && actorEmail) {
      reqFilter.sent_by_email = actorEmail;
    }

    // ── Fetch SignRequests ───────────────────────────────────────────────
    const reqs = await base44.asServiceRole.entities.SignRequest.filter(
      reqFilter, "-sent_at", limit || 100
    );
    const requests = (Array.isArray(reqs) ? reqs : (reqs?.data || [])) || [];

    // ── Enrich with group completion counts ──────────────────────────────
    const groupCache: Record<string, any[]> = {};
    const agreements = [];
    for (const r of requests) {
      let totalCount = 1;
      let signedCount = 0;
      let recipientSummary = [{
        name: r.signer_name || r.candidate_name || "",
        email: r.signer_email || r.candidate_email || "",
        role: "SIGNER",
        status: mapStatus(r.status),
        is_viewing_now: r.status === "viewed",
      }];

      if (r.sign_group_id) {
        if (!groupCache[r.sign_group_id]) {
          const groupReqs = await base44.asServiceRole.entities.SignRequest.filter(
            { sign_group_id: r.sign_group_id }, "-sent_at", 50
          );
          groupCache[r.sign_group_id] = (Array.isArray(groupReqs) ? groupReqs : (groupReqs?.data || [])) || [];
        }
        const groupArr = groupCache[r.sign_group_id];
        totalCount = groupArr.length;
        signedCount = groupArr.filter((gr: any) => gr.status === "signed").length;
        recipientSummary = groupArr.map((gr: any) => ({
          name: gr.signer_name || gr.candidate_name || "",
          email: gr.signer_email || gr.candidate_email || "",
          role: "SIGNER",
          status: mapStatus(gr.status),
          is_viewing_now: gr.status === "viewed",
        }));
      } else {
        signedCount = r.status === "signed" ? 1 : 0;
      }

      agreements.push({
        agreement_id: r.request_id,
        id: r.id,
        name: r.document_title || "Untitled",
        agreement_type: r.document_type || "custom",
        status: mapStatus(r.status),
        organization_name: "",
        sales_rep_email: r.sent_by_email || "",
        created_at: r.sent_at || r.created_date,
        sent_at: r.sent_at,
        completed_at: r.signed_at,
        expires_at: r.expires_at,
        required_count: totalCount,
        completed_count: signedCount,
        recipient_summary: recipientSummary,
        completion_certificate_uri: r.completion_certificate_uri || "",
      });
    }

    // ── Fetch SignDocument templates (category=agreement) ───────────────
    const docFilter: any = { document_category: "agreement", active: true };
    const docs = await base44.asServiceRole.entities.SignDocument.filter(
      docFilter, "-updated_date", 50
    );
    const docArr = (Array.isArray(docs) ? docs : (docs?.data || [])) || [];

    const templates = docArr.map((d: any) => ({
      template_id: d.document_id,
      id: d.id,
      name: d.title,
      category: d.document_category,
      document_type: d.document_type,
      current_version_number: d.version || "1.0",
    }));

    return Response.json({
      status: "OK",
      data: { agreements, templates },
    });
  } catch (e) {
    return Response.json({ status: "ERROR", error: e.message }, { status: 500 });
  }
});

function mapStatus(status: string): string {
  const map: Record<string, string> = {
    sent: "SENT",
    viewed: "OPENED",
    signed: "COMPLETED",
    declined: "DECLINED",
    voided: "VOIDED",
    expired: "EXPIRED",
  };
  return map[status] || (status || "").toUpperCase();
}
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { computeReadiness, REQUIRED_DOCUMENTS, REQUIRED_TRAINING } from "../../shared/salesOrientationEngine.ts";

// Employee-facing: load the caller's own orientation + computed readiness.
// Scoped to the authenticated sales rep — never another employee's record.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const salesMemberId = body.sales_member_id;
    if (!salesMemberId) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const member = await base44.asServiceRole.entities.SalesTeamMember.get(salesMemberId);
    if (!member) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const rows = await base44.asServiceRole.entities.SalesOrientation.filter({
      arriv_employee_id: member.arriv_employee_id,
    });
    const orientation = rows && rows[0];
    if (!orientation) return Response.json({ error: "No orientation found for your account" }, { status: 404 });

    const readiness = computeReadiness(orientation);

    // Documents the employee has already signed (latest per document_id).
    const docs = await base44.asServiceRole.entities.OrientationDocument.filter({
      arriv_employee_id: member.arriv_employee_id,
      status: "signed",
    });
    const signedMap = {};
    for (const d of docs || []) {
      if (!signedMap[d.document_id] || new Date(d.signed_at || 0) > new Date(signedMap[d.document_id].signed_at || 0)) {
        signedMap[d.document_id] = d;
      }
    }
    const documents = REQUIRED_DOCUMENTS.map((d) => ({
      ...d,
      signed: !!signedMap[d.id],
      signed_at: signedMap[d.id]?.signed_at || null,
    }));

    const training = REQUIRED_TRAINING.map((t) => ({ ...t, complete: orientation.training_status === "complete" }));

    return Response.json({
      success: true,
      orientation,
      readiness,
      documents,
      training,
      employee: { full_name: member.full_name, email: member.email, arriv_employee_id: member.arriv_employee_id },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
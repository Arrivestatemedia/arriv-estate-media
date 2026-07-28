import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { writeOrientationAudit, REQUIRED_DOCUMENTS } from "../../shared/salesOrientationEngine.ts";

// Employee-facing: acknowledge/sign a configured document version.
// A signed version can never be overwritten — a changed version creates a new
// OrientationDocument record (and a new acknowledgment task).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { sales_member_id, document_id, document_version, signature_method, signature_value, session_metadata } = body;
    if (!sales_member_id) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const member = await base44.asServiceRole.entities.SalesTeamMember.get(sales_member_id);
    if (!member) return Response.json({ error: "Not authenticated" }, { status: 401 });
    if (!member.arriv_employee_id) return Response.json({ error: "Employee identity not established" }, { status: 400 });

    const config = REQUIRED_DOCUMENTS.find((d) => d.id === document_id);
    if (!config) return Response.json({ error: "Unknown document" }, { status: 400 });

    // Reject if this exact version is already signed (no overwrite).
    const existing = await base44.asServiceRole.entities.OrientationDocument.filter({
      arriv_employee_id: member.arriv_employee_id,
      document_id,
      document_version,
      status: "signed",
    });
    if (existing && existing.length) {
      return Response.json({ skipped: true, reason: "already signed", document: existing[0] });
    }

    const now = new Date().toISOString();
    const record = await base44.asServiceRole.entities.OrientationDocument.create({
      document_id,
      document_version,
      arriv_employee_id: member.arriv_employee_id,
      orientation_id: "",
      title: config.title,
      displayed_at: now,
      signed_at: now,
      signature_method: signature_method || "clickwrap",
      signature_value: (signature_value || "").slice(0, 120),
      ip_address: (body.ip_address || "").slice(0, 64),
      session_metadata: session_metadata || null,
      signed_document_reference: `ack:${document_id}:${document_version}`,
      status: "signed",
    });

    // Recompute documents completion across the required set (any signed version counts).
    const allSigned = await base44.asServiceRole.entities.OrientationDocument.filter({
      arriv_employee_id: member.arriv_employee_id,
      status: "signed",
    });
    const signedIds = new Set((allSigned || []).map((d) => d.document_id));
    const completedCount = REQUIRED_DOCUMENTS.filter((d) => signedIds.has(d.id)).length;
    const documentsComplete = completedCount >= REQUIRED_DOCUMENTS.length;

    const orientRows = await base44.asServiceRole.entities.SalesOrientation.filter({ arriv_employee_id: member.arriv_employee_id });
    if (orientRows && orientRows[0]) {
      await base44.asServiceRole.entities.SalesOrientation.update(orientRows[0].id, {
        documents_completed_count: completedCount,
        documents_complete: documentsComplete,
        updated_at: now,
      });
    }

    await writeOrientationAudit(base44, {
      arrivEmployeeId: member.arriv_employee_id,
      actor: member.email || "employee",
      role: "employee",
      action: "document_signed",
      section: "documents",
      affectedRecord: record.id,
      newStatus: "signed",
    });

    return Response.json({ success: true, document: record, documents_complete: documentsComplete, documents_completed_count: completedCount });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
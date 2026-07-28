import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Public endpoint (no auth) — applicants submit references via the link in the email.
// - GET-style call (body has only reference_id): returns request details without saving.
// - POST with references array: validates and stores the references.

function normalizeRef(r) {
  return {
    name: String(r?.name || "").trim(),
    email: String(r?.email || "").trim(),
    phone: String(r?.phone || "").trim(),
    relationship: String(r?.relationship || "").trim(),
    company: String(r?.company || "").trim(),
    years_known: String(r?.years_known || "").trim(),
    reference_type: r?.reference_type === "professional" ? "professional" : "character",
  };
}

function validRef(r) {
  return r.name && r.email && r.phone && r.relationship && r.years_known;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const referenceId = body?.reference_id;
    if (!referenceId) return Response.json({ error: "reference_id is required" }, { status: 400 });

    const records = await base44.asServiceRole.entities.ApplicantReference.filter({ reference_id: referenceId });
    const record = records && records[0];
    if (!record) return Response.json({ error: "This reference link is no longer valid." }, { status: 404 });

    // No references in the payload → return request details for the form.
    if (!Array.isArray(body?.references) || body.references.length === 0) {
      return Response.json({
        success: true,
        applicant_name: record.applicant_name,
        deadline: record.deadline,
        submitted: record.status === "submitted",
        submitted_at: record.submitted_at || null,
        references: record.references || [],
      });
    }

    if (record.status === "submitted") {
      return Response.json({ error: "References have already been submitted for this application." }, { status: 409 });
    }

    const refs = body.references.map(normalizeRef);
    if (refs.length !== 3) return Response.json({ error: "Please provide all 3 references." }, { status: 400 });
    for (const r of refs) {
      if (!validRef(r)) return Response.json({ error: "Please complete every field for each reference." }, { status: 400 });
    }
    const professionalCount = refs.filter((r) => r.reference_type === "professional").length;
    if (professionalCount < 2) return Response.json({ error: "At least 2 of your 3 references must be professional references." }, { status: 400 });

    const now = new Date().toISOString();
    await base44.asServiceRole.entities.ApplicantReference.update(record.id, {
      references: refs,
      submitted_at: now,
      status: "submitted",
    });

    return Response.json({ success: true, submitted_at: now });
  } catch (error) {
    console.error("submitApplicantReferences error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
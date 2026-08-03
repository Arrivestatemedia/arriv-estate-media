import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { verifySignature, isTimestampFresh } from "../../shared/payrollCrypto.ts";
import { isReplay, markProcessed } from "../../shared/payrollReplay.ts";
import { mapEventTypeToDocumentType } from "../../shared/contractorPayoutShared.ts";

// Receives document-sync webhooks from Arriv Payroll:
//   media_statement.weekly_created
//   media_statement.monthly_created
//   media_statement.ytd_created
//   media_statement.amended
//   media_w9.status_updated
//   media_tax_document.available
//   media_tax_document.corrected
//
// Creates or updates ContractorPayoutDocument records.  Prevents duplicates
// by matching on (media_specialist_id + payroll_document_id + version).

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const rawBody = await req.text();
    const signature = req.headers.get("X-Arriv-Signature") || "";
    const tsHeader = req.headers.get("X-Arriv-Timestamp") || "";
    const requestId = req.headers.get("X-Arriv-Request-Id") || "";
    const sourceAppId = req.headers.get("X-Arriv-Source-App") || "arriv_payroll";
    const webhookSecret = Deno.env.get("ARRIV_PAYROLL_WEBHOOK_SECRET") || "";

    if (!webhookSecret) return Response.json({ error: "Webhook secret not configured" }, { status: 500 });
    if (!isTimestampFresh(tsHeader)) return Response.json({ error: "Stale or missing timestamp" }, { status: 401 });

    const valid = await verifySignature(webhookSecret, rawBody, signature);
    if (!valid) return Response.json({ error: "Invalid signature" }, { status: 401 });

    const replay = await isReplay(base44, requestId, sourceAppId, "receivePayrollContractorDocument");
    if (replay.replay) return Response.json({ received: true, duplicate: true, reason: replay.reason });

    let data;
    try {
      data = JSON.parse(rawBody);
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const {
      event_type,
      tenant_id,
      media_specialist_id,
      media_specialist_email,
      media_specialist_name,
      payroll_document_id,
      document_type: explicitType,
      title,
      period_start,
      period_end,
      tax_year,
      status,
      secure_document_reference,
      version,
      gross_amount,
      net_amount,
      generated_at,
      available_at,
      supersedes_document_id,
    } = data;

    if (!event_type) return Response.json({ error: "event_type is required" }, { status: 400 });
    if (!media_specialist_id || !media_specialist_email) {
      return Response.json({ error: "media_specialist_id and media_specialist_email are required" }, { status: 400 });
    }
    if (!payroll_document_id || !secure_document_reference) {
      return Response.json({ error: "payroll_document_id and secure_document_reference are required" }, { status: 400 });
    }

    // Resolve the document type
    const docType = explicitType || mapEventTypeToDocumentType(event_type);
    if (!docType) {
      return Response.json({ error: `Could not determine document_type for event: ${event_type}` }, { status: 400 });
    }

    const isAmended = event_type === "media_statement.amended" || event_type === "media_tax_document.corrected";
    const ver = version || 1;
    const now = new Date().toISOString();

    // Prevent duplicates: match on media_specialist_id + payroll_document_id + version
    const existing = await base44.asServiceRole.entities.ContractorPayoutDocument.filter({
      media_specialist_id,
      payroll_document_id,
      version: ver,
    });

    if (existing && existing.length) {
      // Update the existing record in place
      const rec = existing[0];
      const update = {
        document_type: docType,
        title: title || rec.title,
        status: status || (isAmended ? "amended" : "available"),
        secure_document_reference: secure_document_reference || rec.secure_document_reference,
        is_amended: isAmended,
        gross_amount: typeof gross_amount === "number" ? gross_amount : rec.gross_amount,
        net_amount: typeof net_amount === "number" ? net_amount : rec.net_amount,
        generated_at: generated_at || rec.generated_at,
        available_at: available_at || now,
        period_start: period_start || rec.period_start,
        period_end: period_end || rec.period_end,
        tax_year: tax_year || rec.tax_year,
        media_specialist_email: media_specialist_email || rec.media_specialist_email,
        media_specialist_name: media_specialist_name || rec.media_specialist_name,
      };
      if (supersedes_document_id) update.supersedes_document_id = supersedes_document_id;
      const updated = await base44.asServiceRole.entities.ContractorPayoutDocument.update(rec.id, update);
      await markProcessed(base44, requestId, sourceAppId, "receivePayrollContractorDocument");
      return Response.json({ success: true, document_id: updated.id, updated: true });
    }

    // If this is an amendment, mark the previous version as superseded
    if (isAmended && supersedes_document_id) {
      try {
        const prevDocs = await base44.asServiceRole.entities.ContractorPayoutDocument.filter({
          media_specialist_id,
          payroll_document_id: supersedes_document_id,
        });
        if (prevDocs && prevDocs.length) {
          await base44.asServiceRole.entities.ContractorPayoutDocument.update(prevDocs[0].id, {
            status: "superseded",
          });
        }
      } catch (_e) {
        // best-effort
      }
    }

    const created = await base44.asServiceRole.entities.ContractorPayoutDocument.create({
      tenant_id: tenant_id || "",
      media_specialist_id,
      media_specialist_email,
      media_specialist_name: media_specialist_name || "",
      payroll_document_id,
      document_type: docType,
      title: title || "",
      period_start: period_start || "",
      period_end: period_end || "",
      tax_year: tax_year || null,
      status: status || (isAmended ? "amended" : "available"),
      secure_document_reference,
      version: ver,
      is_amended: isAmended,
      supersedes_document_id: supersedes_document_id || "",
      gross_amount: typeof gross_amount === "number" ? gross_amount : null,
      net_amount: typeof net_amount === "number" ? net_amount : null,
      generated_at: generated_at || now,
      available_at: available_at || now,
    });

    await markProcessed(base44, requestId, sourceAppId, "receivePayrollContractorDocument");
    return Response.json({ success: true, document_id: created.id, created: true });
  } catch (error) {
    console.error("receivePayrollContractorDocument error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
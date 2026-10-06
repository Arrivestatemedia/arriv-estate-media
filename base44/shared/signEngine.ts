// Shared server-side logic for the Khetha IQ e-signature system.
// Handles merge-field rendering, token generation, audit-trail creation,
// and the bridge to the existing OrientationDocument audit system.

const COMPANY_NAME = "Arriv Estate Media";
const COMPANY_LOGO = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png";

export const STANDARD_MERGE_FIELDS = [
  "candidate_name",
  "candidate_email",
  "job_title",
  "company_name",
  "signature_name",
  "signature_title",
  "today_date",
];

export function getAppBaseUrl() {
  let domain = Deno.env.get("BASE44_APP_DOMAIN") || "app.arrivestatemedia.com";
  while (/^https?:\/\//i.test(domain)) domain = domain.replace(/^https?:\/\//i, "");
  domain = domain.replace(/\/+$/, "");
  return `https://${domain}`;
}

export function buildMergeContext(app, config) {
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return {
    candidate_name: app?.full_name || "",
    candidate_email: app?.email || "",
    job_title: config?.job_title || "",
    company_name: config?.company_name || COMPANY_NAME,
    signature_name: config?.signature_name || "",
    signature_title: config?.signature_title || "",
    today_date: dateStr,
  };
}

export function renderMergeFields(html, context) {
  if (!html) return "";
  return html.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return context?.[key] !== undefined && context?.[key] !== null ? String(context[key]) : match;
  });
}

export function detectMergeFields(html) {
  if (!html) return [];
  const found = new Set();
  const re = /\{\{(\w+)\}\}/g;
  let m;
  while ((m = re.exec(html)) !== null) found.add(m[1]);
  return Array.from(found);
}

export function generateSignToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function parseSignatureFields(html) {
  if (!html) return [];
  const fields = [];
  const seen = new Set();
  const re = /\{\{(sig|date|name|text|initial):([^}]+)\}\}/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const type = m[1];
    const label = m[2].trim();
    const fieldId = label.replace(/\s+/g, "_").toLowerCase();
    if (!seen.has(fieldId)) {
      seen.add(fieldId);
      fields.push({ field_id: fieldId, type, label, required: true });
    }
  }
  return fields;
}

// Create an OrientationDocument audit-trail record when a SignRequest is signed.
// OrientationDocument.signature_method enum only allows typed/clickwrap, so
// "drawn" is mapped to "typed" and the drawn image is preserved in session_metadata.
export async function recordSignAudit(base44, opts) {
  const {
    tenantId, requestId, documentId, documentVersion, documentTitle,
    applicationId, candidateName, candidateEmail, signatureMethod,
    signatureValue, ipAddress, userAgent, drawnSignatureDataUrl,
  } = opts;
  try {
    const auditMethod = signatureMethod === "drawn" ? "typed" : (signatureMethod || "typed");
    const doc = await base44.asServiceRole.entities.OrientationDocument.create({
      document_id: documentId,
      document_version: String(documentVersion || "1.0"),
      arriv_employee_id: applicationId || "",
      orientation_id: "",
      title: documentTitle,
      displayed_at: new Date().toISOString(),
      signed_at: new Date().toISOString(),
      signature_method: auditMethod,
      signature_value: signatureValue || "",
      ip_address: ipAddress || "",
      session_metadata: {
        source: "khetha_iq_sign",
        request_id: requestId,
        candidate_name: candidateName,
        candidate_email: candidateEmail,
        user_agent: userAgent || "",
        drawn_signature: drawnSignatureDataUrl || "",
      },
      signed_document_reference: requestId,
      status: "signed",
    });
    return doc?.id || "";
  } catch (e) {
    console.error("recordSignAudit OrientationDocument create failed:", e.message);
    return "";
  }
}

// Shared function to create a SignRequest record. Returns { signRequest, signToken }.
// Supports multi-signer documents via signGroupId, signingOrder, signGroupTotal,
// and field-level signer assignment via assignedFields.
export async function createSignRequest(base44, opts) {
  const { doc, recipient, config, admin, signingLocation, expiresAt,
          assignedFields, signGroupId, signingOrder, signGroupTotal } = opts;

  let candidateName = recipient.name || "";
  let candidateEmail = recipient.email || "";
  let tenantId = recipient.tenant_id || "tnt_estate_media";
  let applicationId = recipient.application_id || "";
  let context;

  if (applicationId) {
    const app = await base44.asServiceRole.entities.JobApplication.get(applicationId);
    if (!app) throw new Error("Application not found");
    candidateName = app.full_name || candidateName;
    candidateEmail = app.email || candidateEmail;
    tenantId = app.tenant_id || tenantId;
    context = buildMergeContext(app, config);
  } else {
    const today = new Date();
    context = {
      candidate_name: candidateName,
      candidate_email: candidateEmail,
      job_title: config?.job_title || "",
      company_name: config?.company_name || COMPANY_NAME,
      signature_name: config?.signature_name || "",
      signature_title: config?.signature_title || "",
      today_date: today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    };
  }

  let mergedBodyHtml = "";
  let bodyRef = "";
  if (doc.source_type === "editor") {
    mergedBodyHtml = renderMergeFields(doc.body_html, context);
  } else {
    bodyRef = doc.body_ref;
  }

  const requestId = `sigreq_${crypto.randomUUID().slice(0, 12)}`;
  const signToken = generateSignToken();
  const now = new Date().toISOString();

  const signRequest = await base44.asServiceRole.entities.SignRequest.create({
    tenant_id: tenantId,
    request_id: requestId,
    document_id: doc.document_id,
    document_title: doc.title,
    document_type: doc.document_type,
    document_version: doc.version,
    source_type: doc.source_type,
    merged_body_html: mergedBodyHtml,
    body_ref: bodyRef,
    signature_fields: assignedFields || doc.signature_fields || [],
    application_id: applicationId,
    sign_group_id: signGroupId || "",
    signing_order: signingOrder || 0,
    sign_group_total: signGroupTotal || 0,
    signer_email: candidateEmail,
    signer_name: candidateName,
    candidate_name: candidateName,
    candidate_email: candidateEmail,
    sign_token: signToken,
    status: "sent",
    signing_location: signingLocation || "link",
    sent_by_name: admin.actorName,
    sent_by_email: admin.actorEmail || "",
    sent_at: now,
    expires_at: expiresAt || null,
  });

  return { signRequest, signToken };
}

// Resolve the admin caller for sign functions. Supports both platform auth
// (base44.auth.me) and sales-rep session auth (sales_member_id).
export async function resolveSignAdmin(base44, body) {
  try {
    const me = await base44.auth.me();
    if (me) {
      if (me.role === "admin") {
        return { ok: true, tenantId: me.data?.tenant_id || "tnt_estate_media", actorName: me.full_name || me.email, actorEmail: me.email || "", isPlatformAdmin: true };
      }
      if (me.data?.tenant_id) {
        return { ok: true, tenantId: me.data.tenant_id, actorName: me.full_name || me.email, actorEmail: me.email || "", isPlatformAdmin: false };
      }
    }
  } catch (_) { /* not logged in via platform auth */ }

  const salesMemberId = body?.sales_member_id;
  if (!salesMemberId) return { ok: false };
  try {
    const member = await base44.asServiceRole.entities.SalesTeamMember.get(salesMemberId);
    if (!member || member.role !== "admin") return { ok: false };
    return {
      ok: true,
      tenantId: member.tenant_id || body?.acting_tenant_id || "tnt_estate_media",
      actorName: member.full_name || member.email,
      actorEmail: member.email || "",
      isPlatformAdmin: false,
    };
  } catch (_) {
    return { ok: false };
  }
}

// Build the sign-request email HTML using the Arriv Estate Media brand.
export function buildSignRequestEmailHtml(firstName, docTitle, signUrl, isOffer) {
  const intro = isOffer
    ? `Your official offer letter from <strong>${COMPANY_NAME}</strong> is ready for your review and signature.`
    : `You have a document to review and sign: <strong>${docTitle}</strong>.`;
  const btnLabel = isOffer ? "Review &amp; Sign Offer Letter" : "Review &amp; Sign Document";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background-color:#FFFBF5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFBF5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:14px;border:1px solid rgba(184,149,106,0.25);overflow:hidden;">
        <tr>
          <td style="background-color:#1A1A1A;padding:36px 32px;text-align:center;">
            <img src="${COMPANY_LOGO}" alt="Arriv Estate Media" height="110" style="height:110px;width:auto;display:block;margin:0 auto;" />
          </td>
        </tr>
        <tr><td style="padding:40px 44px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi ${firstName},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">${intro}</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Please click the button below to open the document, review it, and sign electronically. Your signature is legally binding and will be recorded with a timestamp and audit trail.</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            <tr><td style="border-radius:8px;background-color:#B8956A;">
              <a href="${signUrl}" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;border-radius:8px;">${btnLabel}</a>
            </td></tr>
          </table>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#666;">If the button doesn't work, copy and paste this link into your browser:<br/><a href="${signUrl}" style="color:#B8956A;word-break:break-all;">${signUrl}</a></p>
        </td></tr>
        <tr><td style="background-color:#F7F1E8;padding:18px 44px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9a8560;">&copy; Arriv Estate Media, LLC &middot; careers@arrivestatemedia.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Build the sign-confirmation email HTML.
export function buildSignConfirmationEmailHtml(firstName, docTitle, signatureValue, method, signedAt) {
  const methodLabel = method === "drawn" ? "Drawn signature" : "Typed name";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background-color:#FFFBF5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFBF5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:14px;border:1px solid rgba(184,149,106,0.25);overflow:hidden;">
        <tr>
          <td style="background-color:#1A1A1A;padding:36px 32px;text-align:center;">
            <img src="${COMPANY_LOGO}" alt="Arriv Estate Media" height="110" style="height:110px;width:auto;display:block;margin:0 auto;" />
          </td>
        </tr>
        <tr><td style="padding:40px 44px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi ${firstName},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Document Signed</strong></p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your signature on <strong>${docTitle}</strong> has been recorded. A copy of the signed document is attached to your records.</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#666;">Signed on ${signedAt}<br/>Signature: ${signatureValue}<br/>Method: Electronic signature (${methodLabel})</p>
        </td></tr>
        <tr><td style="background-color:#F7F1E8;padding:18px 44px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9a8560;">&copy; Arriv Estate Media, LLC &middot; careers@arrivestatemedia.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Build the admin notification email HTML when a document is signed.
export function buildSignAdminNotificationEmailHtml(candidateName, docTitle, signatureValue, method, signedAt) {
  const methodLabel = method === "drawn" ? "Drawn signature" : "Typed name";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background-color:#FFFBF5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFBF5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:14px;border:1px solid rgba(184,149,106,0.25);overflow:hidden;">
        <tr>
          <td style="background-color:#1A1A1A;padding:36px 32px;text-align:center;">
            <img src="${COMPANY_LOGO}" alt="Arriv Estate Media" height="110" style="height:110px;width:auto;display:block;margin:0 auto;" />
          </td>
        </tr>
        <tr><td style="padding:40px 44px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Document Signed</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>${candidateName}</strong> has signed <strong>${docTitle}</strong>.</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#666;">Signed on ${signedAt}<br/>Signature: ${signatureValue}<br/>Method: Electronic signature (${methodLabel})</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">The signed document is attached to this email. You can also view it anytime in the E-Signatures tab.</p>
        </td></tr>
        <tr><td style="background-color:#F7F1E8;padding:18px 44px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9a8560;">&copy; Arriv Estate Media, LLC &middot; careers@arrivestatemedia.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
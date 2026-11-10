// Notices the listing lifecycle sends to the owning customer: the periodic "is this still accurate"
// confirmation, and the notice that an unconfirmed page has been taken down.
//
// Both messages state the exact rule that applied and the single action that restores the page, so
// nothing about the customer's listing changes without them being told why and what to do.

import { appOrigin, sanitizeText } from "./propertyVisibility.ts";

function escapeHtml(text: unknown): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function address(listing: any): string {
  const location = [listing?.city, listing?.state].filter(Boolean).join(", ");
  const street = String(listing?.property_address || "").trim();
  return [street, location].filter(Boolean).join(", ") || "your property";
}

function manageUrl(listing: any): string {
  const jobId = String(listing?.job_id || "");
  return jobId
    ? `${appOrigin()}/PropertyPageBuilder?jobId=${encodeURIComponent(jobId)}`
    : `${appOrigin()}/PropertyLeads`;
}

function shell(heading: string, body: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f3efe9;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
  <div style="background:#b8956a;border-radius:6px 6px 0 0;padding:18px 24px;">
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#000000;">Arriv Estate Media</p>
    <p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;color:#000000;">${escapeHtml(heading)}</p>
  </div>
  <div style="background:#fffbf5;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 6px 6px;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#1a1a1a;">
    ${body}
  </div>
  <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#8a7a63;text-align:center;">
    Arriv Estate Media, property marketing.
  </p>
</div>
</body></html>`;
}

export function buildStatusConfirmationEmail(listing: any) {
  const where = address(listing);
  const status = sanitizeText(listing?.listing_status || "active", 20);
  const body = `
    <p style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#1a1a1a;">${escapeHtml(where)}</p>
    <p style="margin:0 0 14px;">Your property page is still published. Each published page is confirmed every 30 days so buyers are never shown a home that has already sold or been withdrawn.</p>
    <p style="margin:0 0 18px;">Please confirm that this property is still <strong>${escapeHtml(status)}</strong>. It takes one click and it keeps the page in the public directory and in search results.</p>
    <p style="margin:0 0 18px;">
      <a href="${escapeHtml(manageUrl(listing))}" style="display:inline-block;background:#b8956a;color:#000000;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:6px;">Confirm my listing</a>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;opacity:.75;">If nothing is confirmed, the page stops appearing in the directory and search results after 30 days, and it is unpublished after 60 days. The page and its media stay exactly as you approved them until then.</p>`;
  return {
    subject: sanitizeText(`Please confirm your listing is still ${status}: ${where}`, 160),
    html: shell("Listing confirmation due", body),
  };
}

export function buildAutoDeactivatedEmail(listing: any) {
  const where = address(listing);
  const body = `
    <p style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#1a1a1a;">${escapeHtml(where)}</p>
    <p style="margin:0 0 14px;">Your property page has been unpublished because its listing status was not confirmed for 60 days.</p>
    <p style="margin:0 0 18px;">Nothing you approved has been deleted: the details, photographs and video are exactly as they were. Confirming the listing status and publishing it again restores the same page at the same address.</p>
    <p style="margin:0 0 18px;">
      <a href="${escapeHtml(manageUrl(listing))}" style="display:inline-block;background:#b8956a;color:#000000;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:6px;">Review my property page</a>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;opacity:.75;">If the property has sold or the listing ended, you can leave it unpublished. Its history stays on record.</p>`;
  return {
    subject: sanitizeText(`Your property page was unpublished: ${where}`, 160),
    html: shell("Property page unpublished", body),
  };
}
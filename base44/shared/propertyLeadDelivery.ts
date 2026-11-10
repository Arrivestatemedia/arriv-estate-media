// Delivery of a captured property inquiry to the listing's authorized contact.
//
// The inquiry record is always written before any send is attempted (see propertyInquiry.ts), so a
// provider failure can delay a lead but never lose one. This module owns the send, the retry
// schedule, the recorded failure reason and the administrator alert that stops a stuck lead from
// being silent.

import { BOOKINGS_SENDER_EMAIL, sendBrevoEmail } from "./brevoClient.ts";
import { appOrigin, isValidEmail, sanitizeText } from "./propertyVisibility.ts";
import { attributionLabel } from "./propertyAttribution.ts";

// Five attempts over roughly six hours: an outage at the provider is ridden out, and a genuinely
// undeliverable address reaches a terminal state quickly enough to be acted on the same day.
export const LEAD_MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = [1, 5, 15, 60, 240];

export function leadBackoffMinutes(attempts: number): number {
  const index = Math.max(0, Math.min(BACKOFF_MINUTES.length - 1, Number(attempts || 1) - 1));
  return BACKOFF_MINUTES[index];
}

export function nextDeliveryAttemptAt(attempts: number, from: Date = new Date()): string {
  return new Date(from.getTime() + leadBackoffMinutes(attempts) * 60000).toISOString();
}

function escapeHtml(text: unknown): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function propertyLine(listing: any): string {
  if (!listing) return "your property";
  const location = [listing.city, listing.state].filter(Boolean).join(", ");
  const address = String(listing.property_address || "").trim();
  if (address && location) return `${address}, ${location}`;
  return address || location || "your property";
}

export interface LeadEmail {
  subject: string;
  html: string;
}

export function buildLeadEmail(inquiry: any, listing: any): LeadEmail {
  const address = propertyLine(listing);
  const buyer = sanitizeText(inquiry?.name, 120) || "A buyer";
  const reference = sanitizeText(inquiry?.property_reference, 40);
  const source = attributionLabel(inquiry);

  const rows: { label: string; value: string; href?: string }[] = [
    { label: "Name", value: buyer },
    { label: "Email", value: sanitizeText(inquiry?.email, 160), href: `mailto:${sanitizeText(inquiry?.email, 160)}` },
  ];
  if (sanitizeText(inquiry?.phone, 40)) {
    rows.push({
      label: "Phone",
      value: sanitizeText(inquiry?.phone, 40),
      href: `tel:${sanitizeText(inquiry?.phone, 40).replace(/[^0-9+]/g, "")}`,
    });
  }
  rows.push({ label: "Came from", value: source });

  const detailRows = rows
    .map(
      (row) => `<tr>
  <td style="padding:7px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#8a7a63;width:110px;vertical-align:top;">${escapeHtml(row.label)}</td>
  <td style="padding:7px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;">${
    row.href
      ? `<a href="${escapeHtml(row.href)}" style="color:#8a6d4a;text-decoration:none;">${escapeHtml(row.value)}</a>`
      : escapeHtml(row.value)
  }</td>
</tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f3efe9;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
  <div style="background:#b8956a;border-radius:6px 6px 0 0;padding:18px 24px;">
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#000000;">Arriv Estate Media</p>
    <p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;color:#000000;">New buyer inquiry</p>
  </div>
  <div style="background:#fffbf5;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 6px 6px;padding:24px;">
    <p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#1a1a1a;">${escapeHtml(address)}</p>
    <p style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8a7a63;">Property reference ${escapeHtml(reference || "n/a")}</p>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:6px;padding:16px 18px;margin:0 0 18px;">
      <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a7a63;">What they asked</p>
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;white-space:pre-wrap;">${escapeHtml(sanitizeText(inquiry?.message, 2000))}</p>
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">${detailRows}</table>

    <p style="margin:20px 0 0;">
      <a href="${escapeHtml(`${appOrigin()}/PropertyLeads`)}" style="display:inline-block;background:#b8956a;color:#000000;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:6px;">Open your lead dashboard</a>
    </p>

    <p style="margin:18px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#1a1a1a;opacity:.7;">
      Reply to this email to answer the buyer directly. This inquiry was submitted through your Arriv property page and the buyer consented to being contacted about this property. It was routed only to you, the listing contact shown on the page.
    </p>
  </div>
  <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#8a7a63;text-align:center;">
    Arriv Estate Media, property marketing. This message was sent because you are the listing contact on a published Arriv property page.
  </p>
</div>
</body></html>`;

  return { subject: sanitizeText(`New inquiry: ${address}`, 160), html };
}

async function firstRow(promise: Promise<any>): Promise<any> {
  const rows = await promise;
  const list = Array.isArray(rows) ? rows : (rows?.items || []);
  return list[0] || null;
}

async function alertAdministrators(base44: any, inquiry: any, listing: any, reason: string) {
  // The admin address comes from the app's own secret; when it is not set the alert is skipped
  // rather than guessed, and the failure stays visible on the dashboard.
  let to = "";
  try {
    const { secrets } = await import("base44:runtime");
    to = sanitizeText(secrets.get("ADMIN_EMAIL"), 160);
  } catch {
    to = "";
  }
  if (!to) return { ok: false, skipped: true, reason: "NO_ADMIN_EMAIL" };
  const address = propertyLine(listing);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.6;">
  <p style="margin:0 0 10px;"><strong>A property lead could not be delivered to its listing contact.</strong></p>
  <p style="margin:0 0 6px;">Property: ${escapeHtml(address)}</p>
  <p style="margin:0 0 6px;">Buyer: ${escapeHtml(sanitizeText(inquiry?.name, 120))} (${escapeHtml(sanitizeText(inquiry?.email, 160))})</p>
  <p style="margin:0 0 6px;">Routed to: ${escapeHtml(sanitizeText(inquiry?.routed_to_email, 160))}</p>
  <p style="margin:0 0 6px;">Attempts: ${escapeHtml(String(inquiry?.delivery_attempts ?? ""))}</p>
  <p style="margin:0 0 14px;">Last error: ${escapeHtml(reason)}</p>
  <p style="margin:0;">The inquiry is stored and visible at ${escapeHtml(`${appOrigin()}/PropertyLeads`)}. Resending from that page retries delivery.</p>
</div>`;
  try {
    await sendBrevoEmail({
      to,
      subject: sanitizeText(`Lead delivery failed: ${address}`, 160),
      htmlContent: html,
      senderEmail: BOOKINGS_SENDER_EMAIL,
    });
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: String(error?.message || error) };
  }
}

export interface DeliveryOutcome {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  attempts?: number;
  terminal?: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Attempt to deliver one inquiry to its listing contact.
 *
 * Never throws: the caller is the public inquiry endpoint and must answer the visitor regardless.
 * Every attempt is recorded on the inquiry, so a failure is visible in the dashboard, in the
 * retry sweep, and to administrators once it becomes terminal.
 */
export async function deliverPropertyInquiry(
  base44: any,
  inquiry: any,
  opts: { force?: boolean; now?: Date } = {},
): Promise<DeliveryOutcome> {
  const now = opts.now || new Date();
  if (!inquiry?.id) return { ok: false, skipped: true, reason: "NO_INQUIRY" };
  // A synthetic record is never emailed: certification runs must not reach a real inbox.
  if (inquiry.certification_mode === true) return { ok: true, skipped: true, reason: "CERTIFICATION" };
  if (inquiry.notification_status === "delivered" && !opts.force) {
    return { ok: true, skipped: true, reason: "ALREADY_DELIVERED" };
  }
  const attempts = Number(inquiry.delivery_attempts || 0);
  if (!opts.force && attempts >= LEAD_MAX_ATTEMPTS) {
    return { ok: false, skipped: true, reason: "ATTEMPTS_EXHAUSTED", attempts };
  }

  const recipient = sanitizeText(inquiry.routed_to_email, 160);
  if (!recipient) {
    return { ok: false, skipped: true, reason: "NO_AUTHORIZED_CONTACT", attempts };
  }

  const listing = await firstRow(
    base44.asServiceRole.entities.PropertyListing.filter({ listing_id: inquiry.listing_id }),
  ).catch(() => null);

  const attemptAt = now.toISOString();
  const email = buildLeadEmail(inquiry, listing);

  try {
    const receipt: any = await sendBrevoEmail({
      to: recipient,
      subject: email.subject,
      htmlContent: email.html,
      senderEmail: BOOKINGS_SENDER_EMAIL,
      // The agent answers the buyer by replying, so the buyer is the reply-to, never Arriv. Omitted
      // rather than sent empty: a malformed reply-to would be rejected by the provider and take the
      // whole notification down with it.
      replyTo: isValidEmail(inquiry.email) ? sanitizeText(inquiry.email, 160) : "",
    });
    await base44.asServiceRole.entities.PropertyInquiry.update(inquiry.id, {
      notification_status: "delivered",
      delivery_channel: "email",
      delivery_attempts: attempts + 1,
      last_delivery_attempt_at: attemptAt,
      delivered_at: attemptAt,
      delivery_message_id: sanitizeText(receipt?.messageId, 120),
      delivery_error: "",
      next_delivery_attempt_at: "",
    });
    return { ok: true, attempts: attempts + 1, messageId: receipt?.messageId };
  } catch (error: any) {
    const nextAttempts = attempts + 1;
    const terminal = nextAttempts >= LEAD_MAX_ATTEMPTS;
    const reason = sanitizeText(error?.message || "Email delivery failed", 400);
    const patch: Record<string, any> = {
      notification_status: terminal ? "failed" : "retrying",
      delivery_channel: "email",
      delivery_attempts: nextAttempts,
      last_delivery_attempt_at: attemptAt,
      delivery_error: reason,
      next_delivery_attempt_at: terminal ? "" : nextDeliveryAttemptAt(nextAttempts, now),
    };
    if (terminal && !inquiry.admin_alerted_at) {
      const alert = await alertAdministrators(base44, { ...inquiry, ...patch }, listing, reason);
      if (alert.ok) patch.admin_alerted_at = now.toISOString();
    }
    await base44.asServiceRole.entities.PropertyInquiry.update(inquiry.id, patch).catch(() => null);
    return { ok: false, attempts: nextAttempts, terminal, error: reason };
  }
}

// Inquiries the retry sweep may act on right now.
export function isDueForRetry(inquiry: any, now: Date = new Date()): boolean {
  if (!inquiry || inquiry.certification_mode === true) return false;
  if (!["pending_agent_delivery", "retrying"].includes(String(inquiry.notification_status || ""))) return false;
  if (Number(inquiry.delivery_attempts || 0) >= LEAD_MAX_ATTEMPTS) return false;
  const due = inquiry.next_delivery_attempt_at;
  if (!due) return true;
  const at = new Date(due).getTime();
  return Number.isFinite(at) ? at <= now.getTime() : true;
}
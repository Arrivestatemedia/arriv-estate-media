import { secrets } from "base44:runtime";

const DEFAULT_SENDER_EMAIL = "careers@arrivestatemedia.com";
const DEFAULT_SENDER_NAME = "Arriv Estate Media";

// Booking, job and media correspondence goes out from the bookings address.
export const BOOKINGS_SENDER_EMAIL = "bookings@arrivestatemedia.com";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToHtml(text: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;white-space:pre-wrap;line-height:1.5;">${escapeHtml(text)}</div>`;
}

/**
 * Send an email through Brevo. All app-generated email goes through Brevo —
 * the Base44 Core.SendEmail integration is never used for app communications.
 *
 * Pass `htmlContent` for HTML bodies, or `textContent` for plain-text bodies
 * (auto-converted to safe HTML preserving line breaks).
 */
export async function sendBrevoEmail({
  to,
  subject,
  htmlContent,
  textContent,
  senderName = DEFAULT_SENDER_NAME,
  senderEmail = DEFAULT_SENDER_EMAIL,
  attachments = [],
}) {
  const apiKey = secrets.get("BREVO_API_KEY");
  if (!apiKey) throw new Error("BREVO_API_KEY not configured");

  const finalHtml = htmlContent != null
    ? htmlContent
    : textContent != null
      ? textToHtml(textContent)
      : "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "api-key": apiKey },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent: finalHtml,
        ...(attachments.length > 0 ? { attachment: attachments.map(a => ({ content: a.content, name: a.name })) } : {}),
      }),
    });
    if (!res.ok) {
      const details = await res.text();
      if ((res.status >= 500 || res.status === 429) && attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      throw new Error(`Brevo error ${res.status}: ${details}`);
    }
    const receipt = await res.json();
    if (typeof receipt.messageId !== "string" || !receipt.messageId.trim()) {
      throw new Error("Brevo did not return a message receipt; sending is unconfirmed.");
    }
    return { ok: true, messageId: receipt.messageId };
  }
}

export async function assertBrevoSendersActive(emails) {
  const response = await fetch("https://api.brevo.com/v3/senders", {
    headers: { "api-key": secrets.get("BREVO_API_KEY"), accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Brevo sender verification failed (${response.status})`);
  const data = await response.json();
  const active = new Set((data.senders || []).filter(sender => sender.active).map(sender => sender.email.toLowerCase()));
  const missing = [...new Set(emails)].filter(email => !active.has(email.toLowerCase()));
  if (missing.length) throw new Error(`Brevo sender is not registered and active: ${missing.join(", ")}`);
}

export async function getBrevoDelivery(messageId) {
  const response = await fetch(`https://api.brevo.com/v3/smtp/statistics/events?messageId=${encodeURIComponent(messageId)}&limit=100&sort=desc`, {
    headers: { "api-key": secrets.get("BREVO_API_KEY"), accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Brevo delivery lookup failed (${response.status})`);
  const data = await response.json();
  const events = (data.events || []).filter(event => event.messageId === messageId);
  const delivered = events.find(event => event.event === "delivered");
  if (delivered) return { status: "sent", delivered_at: new Date(delivered.date).toISOString() };
  const failed = events.find(event => ["blocked", "invalid", "error", "hardbounces", "softbounces", "hard_bounce", "soft_bounce"].includes(String(event.event).toLowerCase()));
  if (failed) return { status: "failed", error: failed.reason || `Brevo reported ${failed.event}` };
  return null;
}
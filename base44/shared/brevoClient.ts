const DEFAULT_SENDER_EMAIL = "careers@arrivestatemedia.com";
const DEFAULT_SENDER_NAME = "Arriv Estate Media";

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
}) {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) throw new Error("BREVO_API_KEY not configured");

  const finalHtml = htmlContent != null
    ? htmlContent
    : textContent != null
      ? textToHtml(textContent)
      : "";

  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: to }],
          subject,
          htmlContent: finalHtml,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        const error = new Error(`Brevo error ${res.status}: ${errText}`);
        // Retry on server errors (5xx) or rate limiting (429); client errors (4xx) won't succeed on retry.
        if ((res.status >= 500 || res.status === 429) && attempt === 0) {
          lastError = error;
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        throw error;
      }
      return { ok: true };
    } catch (err) {
      // Network-level error — retry once
      if (attempt === 0) {
        lastError = err;
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
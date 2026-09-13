// Unified email connection resolver for per-rep email.
// Given a sales_member_id, looks up the SalesTeamMember record, determines
// email_connection_type, refreshes tokens if needed, and returns a
// ResolvedEmailConnection. Also contains sendEmailViaConnection() which
// routes to the right provider.

import { sendBrevoEmail } from "./brevoClient.ts";
import { refreshMicrosoftToken, sendMicrosoftEmail, listMicrosoftInbox, getMicrosoftMessage } from "./microsoftGraphProvider.ts";

export interface ResolvedEmailConnection {
  type: "none" | "gmail_oauth" | "microsoft_oauth" | "smtp";
  emailAddress: string | null;
  accessToken?: string;
  member: any;
}

// ── AES-GCM encryption for SMTP passwords ──

async function deriveKey() {
  const secret = Deno.env.get("ARRIV_ESTATE_MEDIA_SECRET");
  if (!secret) throw new Error("ARRIV_ESTATE_MEDIA_SECRET not configured");
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("arriv-smtp-salt"), iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptSmtpPassword(password: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(password));
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

// ── Token refresh helpers ──

async function refreshGmailToken(base44, salesMemberId, refreshToken) {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("VITE_GOOGLE_CLIENT_ID"),
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Gmail token refresh failed");
  await base44.asServiceRole.entities.SalesTeamMember.update(salesMemberId, {
    gmail_access_token: tokenData.access_token,
    gmail_token_expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
  });
  return tokenData.access_token;
}

async function refreshMsToken(base44, salesMemberId, refreshToken) {
  const tokenData = await refreshMicrosoftToken(refreshToken);
  await base44.asServiceRole.entities.SalesTeamMember.update(salesMemberId, {
    microsoft_access_token: tokenData.access_token,
    microsoft_refresh_token: tokenData.refresh_token || refreshToken,
    microsoft_token_expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
  });
  return tokenData.access_token;
}

// ── Main resolver ──

export async function resolveRepEmailConnection(base44, salesMemberId): Promise<ResolvedEmailConnection> {
  const member = await base44.asServiceRole.entities.SalesTeamMember.get(salesMemberId);
  if (!member) throw new Error("Sales team member not found");

  let type = member.email_connection_type;
  // Legacy: reps with gmail_access_token but no type → gmail_oauth
  if (!type || type === "none") {
    if (member.gmail_access_token) type = "gmail_oauth";
    else type = "none";
  }

  if (type === "gmail_oauth") {
    let accessToken = member.gmail_access_token;
    const expiresAt = member.gmail_token_expires_at ? new Date(member.gmail_token_expires_at) : null;
    if ((!expiresAt || expiresAt <= new Date(Date.now() + 60000)) && member.gmail_refresh_token) {
      try {
        accessToken = await refreshGmailToken(base44, salesMemberId, member.gmail_refresh_token);
      } catch (_) { /* use stale token — send will fail and surface the error */ }
    }
    return { type: "gmail_oauth", emailAddress: member.company_email || null, accessToken, member };
  }

  if (type === "microsoft_oauth") {
    let accessToken = member.microsoft_access_token;
    const expiresAt = member.microsoft_token_expires_at ? new Date(member.microsoft_token_expires_at) : null;
    if ((!expiresAt || expiresAt <= new Date(Date.now() + 60000)) && member.microsoft_refresh_token) {
      try {
        accessToken = await refreshMsToken(base44, salesMemberId, member.microsoft_refresh_token);
      } catch (_) {}
    }
    return { type: "microsoft_oauth", emailAddress: member.microsoft_email || member.company_email || null, accessToken, member };
  }

  if (type === "smtp") {
    return { type: "smtp", emailAddress: member.smtp_username || member.company_email || null, member };
  }

  return { type: "none", emailAddress: member.company_email || null, member };
}

// ── Unified sender ──

export async function sendEmailViaConnection(base44, connection: ResolvedEmailConnection, params: {
  to: string; cc?: string; bcc?: string; subject: string; body: string; fromName?: string;
  inReplyTo?: string; references?: string;
}) {
  const { to, cc, bcc, subject, body, fromName } = params;

  if (connection.type === "gmail_oauth" && connection.accessToken) {
    const fromHeader = fromName ? `${fromName} <${connection.emailAddress}>` : connection.emailAddress;
    const emailLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `From: ${fromHeader}`,
      `Content-Type: text/html; charset=utf-8`,
    ];
    if (cc) emailLines.push(`Cc: ${cc}`);
    if (bcc) emailLines.push(`Bcc: ${bcc}`);
    if (params.inReplyTo) emailLines.push(`In-Reply-To: ${params.inReplyTo}`);
    if (params.references) emailLines.push(`References: ${params.references}`);
    emailLines.push("", body);
    const emailContent = emailLines.join("\r\n");
    const encoder = new TextEncoder();
    const emailBytes = encoder.encode(emailContent);
    const base64 = btoa(String.fromCharCode(...emailBytes));
    const encodedEmail = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

    const res = await fetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${connection.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: encodedEmail }),
    });
    if (!res.ok) throw new Error(`Gmail send failed: ${await res.text()}`);
    return { ok: true, provider: "gmail" };
  }

  if (connection.type === "microsoft_oauth" && connection.accessToken) {
    await sendMicrosoftEmail(connection.accessToken, { to, cc, bcc, subject, body, fromName });
    return { ok: true, provider: "microsoft" };
  }

  if (connection.type === "smtp" && connection.emailAddress) {
    // SMTP relay: send through Brevo with rep's email as From
    await sendBrevoEmail({
      to, subject, htmlContent: body,
      senderEmail: connection.emailAddress,
      senderName: fromName || "Arriv Estate Media",
    });
    return { ok: true, provider: "smtp_relay" };
  }

  // No connection — fall back to Brevo default sender
  await sendBrevoEmail({ to, subject, htmlContent: body, senderName: fromName });
  return { ok: true, provider: "brevo_fallback" };
}

// ── Unified inbox ──

export async function getInboxViaConnection(base44, connection: ResolvedEmailConnection, options?: { toEmail?: string; contactEmails?: string[] }) {
  if (connection.type === "gmail_oauth" && connection.accessToken) {
    let query = "in:inbox";
    if (options?.toEmail) query = `in:inbox to:${options.toEmail}`;
    if (options?.contactEmails?.length) {
      const fromQuery = options.contactEmails.filter(Boolean).map((e) => `from:${e}`).join(" OR ");
      query += ` (${fromQuery})`;
    }
    const searchRes = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=30`,
      { headers: { Authorization: `Bearer ${connection.accessToken}` } }
    );
    if (!searchRes.ok) throw new Error("Gmail inbox search failed");
    const searchData = await searchRes.json();
    const messages = searchData.messages || [];
    const threads = await Promise.all(
      messages.slice(0, 20).map(async (msg) => {
        const msgRes = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
          { headers: { Authorization: `Bearer ${connection.accessToken}` } }
        );
        if (!msgRes.ok) return null;
        const msgData = await msgRes.json();
        const headers = msgData.payload?.headers || [];
        const get = (name) => headers.find((h) => h.name === name)?.value || "";
        return {
          id: msg.id,
          from: get("From"),
          subject: get("Subject"),
          date: get("Date"),
          snippet: msgData.snippet || "",
          messageId: get("Message-ID"),
          references: get("References"),
        };
      })
    );
    return { threads: threads.filter(Boolean), available: true };
  }

  if (connection.type === "microsoft_oauth" && connection.accessToken) {
    const messages = await listMicrosoftInbox(connection.accessToken, 20);
    return { threads: messages, available: true };
  }

  if (connection.type === "smtp") {
    // SMTP connections read inbox from InboundEmail (populated by smtpInboundWebhook)
    const emails = await listInboundEmails(base44, connection.member.tenant_id || "tnt_estate_media", connection.emailAddress || "", options?.contactEmails);
    const threads = emails.map((e: any) => ({
      id: e.id,
      from: e.from_name ? `${e.from_name} <${e.from_email}>` : e.from_email,
      subject: e.subject || "(no subject)",
      date: e.received_at,
      snippet: (e.body_text || "").substring(0, 200),
      messageId: e.id,
      is_read: e.is_read,
    }));
    return { threads, available: true };
  }

  return { threads: [], available: false, reason: "Email not connected. Ask your admin to connect an email account." };
}

// ── Inbound email reading for SMTP connections ──
// SMTP-connected users read their inbox from the InboundEmail entity, which
// is populated by the smtpInboundWebhook when the tenant forwards incoming
// emails to the webhook URL.

export async function listInboundEmails(
  base44: any,
  tenantId: string,
  recipientEmail: string,
  contactEmails?: string[]
): Promise<any[]> {
  if (!recipientEmail) return [];
  try {
    const emails = await base44.asServiceRole.entities.InboundEmail.filter(
      { tenant_id: tenantId, recipient_email: recipientEmail.toLowerCase() },
      "-received_at",
      50
    );
    if (!emails || emails.length === 0) return [];
    if (contactEmails && contactEmails.length > 0) {
      const lower = contactEmails.filter(Boolean).map((e) => e.toLowerCase());
      return emails.filter((e: any) =>
        lower.some((ce) => e.from_email?.toLowerCase().includes(ce))
      );
    }
    return emails;
  } catch {
    return [];
  }
}

export async function getInboundEmail(base44: any, emailId: string): Promise<any | null> {
  try {
    const emails = await base44.asServiceRole.entities.InboundEmail.filter({ id: emailId });
    return (emails && emails.length > 0) ? emails[0] : null;
  } catch {
    return null;
  }
}

export async function markInboundEmailRead(base44: any, emailId: string): Promise<void> {
  try {
    await base44.asServiceRole.entities.InboundEmail.update(emailId, { is_read: true });
  } catch {
    // ignore
  }
}
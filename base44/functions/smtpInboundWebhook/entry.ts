// Inbound email webhook for SMTP-connected users.
//
// The sandbox blocks raw TCP (Deno.connect / Deno.startTls), so we can't
// poll IMAP directly. Instead, the tenant configures their email server
// or provider to FORWARD incoming emails to this webhook URL. We parse
// the email (raw RFC 822, Mailgun form data, SendGrid form data, Postmark
// JSON, or generic form data), store it in InboundEmail, and the user's
// inbox reads from there.
//
// Supported inbound formats:
//   - Raw RFC 822 email (Content-Type: message/rfc822 or application/email)
//   - Mailgun inbound route (multipart/form-data with from/to/subject/body-plain/body-html)
//   - SendGrid Inbound Parse (multipart/form-data with from/to/subject/text/html)
//   - Postmark inbound (application/json with From/To/Subject/TextBody/HtmlBody)
//   - Generic form data (any multipart/form-data or URL-encoded with from/to/subject/body)
//
// Auth: the webhook URL includes ?token=xxx which must match the tenant's
// TenantEmailConfig.inbound_webhook_token.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// --- Simple RFC 822 email parser ---
function parseRawEmail(raw: string): {
  headers: Record<string, string>;
  text: string;
  html: string;
} {
  let splitIdx = raw.indexOf("\r\n\r\n");
  let sepLen = 4;
  if (splitIdx < 0) {
    splitIdx = raw.indexOf("\n\n");
    sepLen = 2;
  }
  if (splitIdx < 0) return { headers: {}, text: raw, html: "" };

  const headerBlock = raw.substring(0, splitIdx);
  const body = raw.substring(splitIdx + sepLen);

  const headers: Record<string, string> = {};
  const lines = headerBlock.split(/\r?\n/);
  let currentKey = "";
  for (const line of lines) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      if (currentKey) headers[currentKey] += " " + line.trim();
    } else {
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        currentKey = line.substring(0, colonIdx).toLowerCase().trim();
        headers[currentKey] = line.substring(colonIdx + 1).trim();
      }
    }
  }

  const contentType = headers["content-type"] || "";
  if (contentType.includes("multipart/")) {
    const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/i);
    if (boundaryMatch) {
      const boundary = "--" + boundaryMatch[1];
      const parts = body.split(boundary);
      let text = "";
      let html = "";
      for (const part of parts) {
        if (part.trim() === "" || part.trim() === "--") continue;
        if (part.trim().startsWith("--")) continue;
        const pHeaderEnd = part.indexOf("\r\n\r\n") >= 0
          ? part.indexOf("\r\n\r\n")
          : part.indexOf("\n\n");
        if (pHeaderEnd < 0) continue;
        const pHeaders = part.substring(0, pHeaderEnd).toLowerCase();
        const pBody = part.substring(pHeaderEnd + (part.indexOf("\r\n\r\n") >= 0 ? 4 : 2)).trim();
        if (pHeaders.includes("text/plain") && !pHeaders.includes("text/html")) {
          text = pBody;
        } else if (pHeaders.includes("text/html")) {
          html = pBody;
        }
      }
      return { headers, text, html };
    }
  }
  if (contentType.includes("text/html")) {
    return { headers, text: "", html: body };
  }
  return { headers, text: body, html: "" };
}

function extractEmail(headerValue: string): string {
  if (!headerValue) return "";
  const match = headerValue.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase().trim();
  return headerValue.toLowerCase().trim();
}

function extractName(headerValue: string): string {
  if (!headerValue) return "";
  const match = headerValue.match(/^"?([^"<]+?)"?\s*<[^>]+>/);
  if (match) return match[1].trim();
  return "";
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return Response.json({ error: "Missing token" }, { status: 401 });
  }

  const base44 = createClientFromRequest(req);

  // Look up the TenantEmailConfig by inbound_webhook_token
  let config: any = null;
  try {
    const configs = await base44.asServiceRole.entities.TenantEmailConfig.filter({
      inbound_webhook_token: token,
    });
    if (configs && configs.length > 0) config = configs[0];
  } catch {
    // ignore
  }

  if (!config) {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const tenantId = config.tenant_id || "tnt_estate_media";
  if (!config.inbound_enabled) {
    return Response.json({ error: "Inbound email not enabled for this tenant" }, { status: 403 });
  }

  const contentType = (req.headers.get("content-type") || "").toLowerCase();
  let parsed: {
    from_email: string;
    from_name: string;
    to_email: string;
    cc_email: string;
    subject: string;
    body_text: string;
    body_html: string;
    message_id: string;
    received_at: string;
    source: string;
  } | null = null;

  try {
    // --- Raw RFC 822 email ---
    if (contentType.includes("message/rfc822") || contentType.includes("application/email")) {
      const raw = await req.text();
      const { headers, text, html } = parseRawEmail(raw);
      parsed = {
        from_email: extractEmail(headers["from"] || ""),
        from_name: extractName(headers["from"] || ""),
        to_email: headers["to"] || "",
        cc_email: headers["cc"] || "",
        subject: headers["subject"] || "",
        body_text: text,
        body_html: html,
        message_id: headers["message-id"] || "",
        received_at: headers["date"] ? new Date(headers["date"]).toISOString() : new Date().toISOString(),
        source: "raw_forward",
      };
    }
    // --- Postmark (JSON) ---
    else if (contentType.includes("application/json")) {
      const data = await req.json();
      parsed = {
        from_email: extractEmail(data.From || ""),
        from_name: extractName(data.From || ""),
        to_email: data.To || "",
        cc_email: data.Cc || "",
        subject: data.Subject || "",
        body_text: data.TextBody || "",
        body_html: data.HtmlBody || "",
        message_id: data.MessageID || "",
        received_at: data.Date ? new Date(data.Date).toISOString() : new Date().toISOString(),
        source: "postmark",
      };
    }
    // --- Mailgun / SendGrid / generic form data ---
    else if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      const source = (formData.get("Message-Id") || formData.get("message-id")) ? "mailgun" : "sendgrid";
      parsed = {
        from_email: extractEmail(String(formData.get("from") || formData.get("sender") || "")),
        from_name: extractName(String(formData.get("from") || formData.get("sender") || "")),
        to_email: String(formData.get("to") || formData.get("recipient") || ""),
        cc_email: String(formData.get("cc") || ""),
        subject: String(formData.get("subject") || ""),
        body_text: String(formData.get("body-plain") || formData.get("text") || ""),
        body_html: String(formData.get("body-html") || formData.get("html") || ""),
        message_id: String(formData.get("Message-Id") || formData.get("message-id") || ""),
        received_at: new Date().toISOString(),
        source,
      };
    }
    // --- Fallback: try to parse as raw text ---
    else {
      const raw = await req.text();
      const { headers, text, html } = parseRawEmail(raw);
      parsed = {
        from_email: extractEmail(headers["from"] || ""),
        from_name: extractName(headers["from"] || ""),
        to_email: headers["to"] || "",
        cc_email: headers["cc"] || "",
        subject: headers["subject"] || "",
        body_text: text,
        body_html: html,
        message_id: headers["message-id"] || "",
        received_at: headers["date"] ? new Date(headers["date"]).toISOString() : new Date().toISOString(),
        source: "generic",
      };
    }
  } catch (e) {
    console.error("smtpInboundWebhook parse error:", e.message);
    return Response.json({ error: "Failed to parse email" }, { status: 400 });
  }

  if (!parsed || !parsed.from_email) {
    return Response.json({ error: "Could not extract sender from email" }, { status: 400 });
  }

  // Determine the recipient user by matching the To address to a SalesTeamMember record.
  const toAddrs = parsed.to_email.split(",").map((a) => extractEmail(a)).filter(Boolean);
  let recipientEmail = "";
  for (const addr of toAddrs) {
    try {
      const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ email: addr });
      if (members && members.length > 0) {
        recipientEmail = addr;
        break;
      }
    } catch {
      // continue
    }
  }
  // If no exact match, try company_email
  if (!recipientEmail) {
    for (const addr of toAddrs) {
      try {
        const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ company_email: addr });
        if (members && members.length > 0) {
          recipientEmail = addr;
          break;
        }
      } catch {
        // continue
      }
    }
  }
  // If still no match, use the first To address
  if (!recipientEmail && toAddrs.length > 0) {
    recipientEmail = toAddrs[0];
  }

  if (!recipientEmail) {
    return Response.json({ error: "No recipient address found" }, { status: 400 });
  }

  // Dedup by message_id (if present)
  if (parsed.message_id) {
    try {
      const existing = await base44.asServiceRole.entities.InboundEmail.filter({
        tenant_id: tenantId,
        message_id: parsed.message_id,
      });
      if (existing && existing.length > 0) {
        return Response.json({ ok: true, duplicate: true });
      }
    } catch {
      // continue
    }
  }

  // Store the email
  await base44.asServiceRole.entities.InboundEmail.create({
    tenant_id: tenantId,
    recipient_email: recipientEmail.toLowerCase(),
    from_email: parsed.from_email,
    from_name: parsed.from_name,
    to_email: parsed.to_email,
    cc_email: parsed.cc_email,
    subject: parsed.subject,
    body_text: parsed.body_text,
    body_html: parsed.body_html,
    message_id: parsed.message_id,
    received_at: parsed.received_at,
    is_read: false,
    source: parsed.source,
    attachments: [],
  });

  return Response.json({ ok: true });
});
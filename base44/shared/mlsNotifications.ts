// mlsNotifications.ts
// Every outbound message the MLS Publishing Manager sends.
//
// Email goes through the existing Brevo client (the same sender the booking and delivery
// notifications already use) and SMS through the same Twilio configuration as the existing
// admin application alert. Recipients come from the configured secrets and can be widened
// through AppSetting — no address or phone number is hardcoded here.

import { sendBrevoEmail, BOOKINGS_SENDER_EMAIL } from "./brevoClient.ts";
import { formatEtDeadline } from "./mlsServiceWindow.ts";

export const MLS_ADMIN_RECIPIENTS_KEY = "mls_admin_recipients";
export const APP_PUBLIC_URL_KEY = "app_public_url";
const FALLBACK_APP_URL = "https://app.arrivestatemedia.com";

export async function resolveAppUrl(base44: any): Promise<string> {
  try {
    const rows = await base44.asServiceRole.entities.AppSetting.filter({ key: APP_PUBLIC_URL_KEY }, undefined, 1);
    const value = rows?.[0]?.value;
    if (value && /^https?:\/\//.test(String(value))) return String(value).replace(/\/$/, "");
  } catch { /* fall through to the documented app URL */ }
  return FALLBACK_APP_URL;
}

/**
 * Designated Arriv administrators. Secrets supply the default recipient; AppSetting can add
 * more (for example a shared inbox) without touching code.
 */
export async function resolveAdminRecipients(base44: any): Promise<{ emails: string[]; phones: string[] }> {
  const emails = new Set<string>();
  const phones = new Set<string>();

  const defaultEmail = Deno.env.get("ADMIN_EMAIL");
  const defaultPhone = Deno.env.get("ADMIN_PHONE");
  if (defaultEmail) emails.add(defaultEmail);
  if (defaultPhone) phones.add(defaultPhone);

  try {
    const rows = await base44.asServiceRole.entities.AppSetting.filter({ key: MLS_ADMIN_RECIPIENTS_KEY }, undefined, 1);
    const raw = rows?.[0]?.value;
    if (raw) {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      (Array.isArray(parsed?.emails) ? parsed.emails : []).forEach((e: any) => {
        if (String(e || "").includes("@")) emails.add(String(e).trim());
      });
      (Array.isArray(parsed?.phones) ? parsed.phones : []).forEach((p: any) => {
        if (String(p || "").trim()) phones.add(String(p).trim());
      });
    }
  } catch { /* defaults stand */ }

  return { emails: Array.from(emails), phones: Array.from(phones) };
}

export async function sendAdminSms(body: string): Promise<boolean> {
  try {
    const to = Deno.env.get("ADMIN_PHONE");
    const from = Deno.env.get("TWILIO_PHONE_NUMBER");
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!to || !from || !accountSid || !authToken) return false;

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
    });
    return res.ok;
  } catch (err) {
    console.error("MLS admin SMS failed:", (err as Error)?.message || err);
    return false;
  }
}

export async function sendSmsTo(toNumber: string, body: string): Promise<boolean> {
  try {
    const from = Deno.env.get("TWILIO_PHONE_NUMBER");
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!toNumber || !from || !accountSid || !authToken) return false;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: from, To: toNumber, Body: body }).toString(),
    });
    return res.ok;
  } catch (err) {
    console.error("MLS customer SMS failed:", (err as Error)?.message || err);
    return false;
  }
}

export async function logMessage(base44: any, entry: {
  message_type: "email" | "sms";
  recipient_type: "client" | "admin" | "media_partner";
  recipient_email?: string;
  recipient_phone?: string;
  subject?: string;
  message_content: string;
  job_id?: string;
  status: "success" | "failed";
  error_message?: string;
}) {
  try {
    await base44.asServiceRole.entities.MessageLog.create({
      ...entry,
      source: "system",
      provider: entry.message_type === "email" ? "brevo" : "twilio",
    });
  } catch (err) {
    console.error("MessageLog write failed:", (err as Error)?.message || err);
  }
}

function emailShell(title: string, rows: Array<[string, string]>, cta: { label: string; url: string } | null, intro?: string) {
  const rowsHtml = rows
    .map(([label, value]) => (
      `<tr><td style="padding:6px 0;color:#6b6b6b;font-size:13px;width:190px">${label}</td>` +
      `<td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600">${value}</td></tr>`
    ))
    .join("");
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6f3ee;font-family:Inter,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ee;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fffbf5;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
        <tr><td style="background:#b8956a;padding:16px 24px;color:#000;font-weight:700;font-size:15px">Arriv Estate Media</td></tr>
        <tr><td style="padding:26px 24px 8px">
          <h1 style="margin:0 0 8px;font-size:21px;color:#1a1a1a">${title}</h1>
          ${intro ? `<p style="margin:0 0 16px;color:#4a4a4a;font-size:14px;line-height:1.6">${intro}</p>` : ""}
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">${rowsHtml}</table>
        </td></tr>
        ${cta ? `<tr><td style="padding:8px 24px 28px"><a href="${cta.url}" style="display:inline-block;background:#b8956a;color:#000;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:6px">${cta.label}</a></td></tr>` : ""}
        <tr><td style="padding:14px 24px;background:#f3efe9;color:#6b6b6b;font-size:12px">You are receiving this because you are an Arriv Estate Media administrator.</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

/** Immediate notification when a customer submits a Publish to MLS request. */
export async function notifyAdminOfMlsRequest(base44: any, params: {
  request: any;
  job: any;
  deadlineLabel: string;
  providerLabel: string;
}) {
  const { request, job, deadlineLabel, providerLabel } = params;
  const appUrl = await resolveAppUrl(base44);
  const queueUrl = `${appUrl}/MlsUploadQueue`;
  const jobUrl = `${appUrl}/JobDetail?job_id=${request.job_id}`;
  const address = request.property_address || job?.location || "the property";

  const recipients = await resolveAdminRecipients(base44);
  const subject = `New MLS Upload Request — ${address}`;
  const rows: Array<[string, string]> = [
    ["Customer", `${request.client_name || "—"} (${request.client_email})`],
    ["Property", address],
    ["MLS provider", providerLabel],
    ["MLS listing number", request.mls_number],
    ["Photographs selected", String(request.photo_count || 0)],
    ["Videos selected", String(request.video_count || 0)],
    ["Submitted", `${formatEtDeadline(request.submitted_at)}`],
    ["Upload deadline", deadlineLabel],
  ];
  const html = emailShell(
    "New MLS upload request",
    rows,
    { label: "Open the MLS upload queue", url: queueUrl },
    `A customer has asked Arriv to publish selected media to their listing. The upload is due ${deadlineLabel}.`,
  );
  const text = [
    subject,
    `Customer: ${request.client_name || "—"} (${request.client_email})`,
    `Property: ${address}`,
    `Provider: ${providerLabel}`,
    `MLS #: ${request.mls_number}`,
    `${request.photo_count || 0} photos, ${request.video_count || 0} videos`,
    `Deadline: ${deadlineLabel}`,
    `Queue: ${queueUrl}`,
    `Job: ${jobUrl}`,
  ].join("\n");

  let emailed = false;
  if (recipients.emails.length > 0) {
    try {
      const res = await sendBrevoEmail({
        to: recipients.emails[0],
        subject,
        htmlContent: html,
        textContent: text,
        senderEmail: BOOKINGS_SENDER_EMAIL,
        senderName: "Arriv Estate Media",
      });
      emailed = !!res?.ok;
      await logMessage(base44, {
        message_type: "email",
        recipient_type: "admin",
        recipient_email: recipients.emails[0],
        subject,
        message_content: text,
        job_id: request.job_id,
        status: emailed ? "success" : "failed",
      });
    } catch (err) {
      await logMessage(base44, {
        message_type: "email",
        recipient_type: "admin",
        recipient_email: recipients.emails[0],
        subject,
        message_content: text,
        job_id: request.job_id,
        status: "failed",
        error_message: (err as Error)?.message,
      });
    }
  }

  const smsBody = `Arriv MLS Upload: New request for ${address}. MLS #${request.mls_number}. ${request.photo_count || 0} photos, ${request.video_count || 0} videos. Due ${deadlineLabel}. Open: ${queueUrl}`;
  const smsSent = await sendAdminSms(smsBody);
  await logMessage(base44, {
    message_type: "sms",
    recipient_type: "admin",
    recipient_phone: Deno.env.get("ADMIN_PHONE") || "",
    message_content: smsBody,
    job_id: request.job_id,
    status: smsSent ? "success" : "failed",
  });

  return { emailed, smsSent };
}

/** Deadline / overdue alerts to the administrator. Body is built by the caller. */
export async function notifyAdminAlert(base44: any, params: { subject: string; body: string; jobId?: string }) {
  const { subject, body, jobId } = params;
  const recipients = await resolveAdminRecipients(base44);
  const appUrl = await resolveAppUrl(base44);
  const queueUrl = `${appUrl}/MlsUploadQueue`;

  if (recipients.emails.length > 0) {
    try {
      const res = await sendBrevoEmail({
        to: recipients.emails[0],
        subject,
        htmlContent: emailShell(subject, [], { label: "Open the MLS upload queue", url: queueUrl }, body.replace(/\n/g, "<br>")),
        textContent: `${body}\n\n${queueUrl}`,
        senderEmail: BOOKINGS_SENDER_EMAIL,
        senderName: "Arriv Estate Media",
      });
      await logMessage(base44, {
        message_type: "email",
        recipient_type: "admin",
        recipient_email: recipients.emails[0],
        subject,
        message_content: body,
        job_id: jobId,
        status: res?.ok ? "success" : "failed",
      });
    } catch (err) {
      await logMessage(base44, {
        message_type: "email",
        recipient_type: "admin",
        recipient_email: recipients.emails[0],
        subject,
        message_content: body,
        job_id: jobId,
        status: "failed",
        error_message: (err as Error)?.message,
      });
    }
  }

  const smsBody = `${subject}. ${body.split("\n")[0]} Open: ${queueUrl}`;
  const smsSent = await sendAdminSms(smsBody.slice(0, 300));
  await logMessage(base44, {
    message_type: "sms",
    recipient_type: "admin",
    recipient_phone: Deno.env.get("ADMIN_PHONE") || "",
    message_content: smsBody,
    job_id: jobId,
    status: smsSent ? "success" : "failed",
  });
}

/** Customer confirmation, sent only after an administrator confirms a real upload. */
export async function notifyCustomerMlsCompleted(base44: any, params: {
  request: any;
  job: any;
  videoPending: boolean;
}) {
  const { request, job, videoPending } = params;
  const address = request.property_address || job?.location || "your property";
  const appUrl = await resolveAppUrl(base44);
  const galleryUrl = `${appUrl}/ClientJobGallery?jobId=${request.job_id}`;

  let headline = "Your media is on your listing";
  let body = `Your selected property media has been uploaded to FMLS for listing #${request.mls_number}.`;
  if (videoPending) {
    headline = "Your photos are on your listing";
    body = `Your selected photographs have been uploaded to FMLS for listing #${request.mls_number}. The video link is still being added — we'll confirm as soon as it's done.`;
  }

  const subject = videoPending
    ? `Photos uploaded to FMLS for listing #${request.mls_number}`
    : `Media uploaded to FMLS for listing #${request.mls_number}`;

  let emailed = false;
  if (request.client_email) {
    try {
      const res = await sendBrevoEmail({
        to: request.client_email,
        subject,
        htmlContent: emailShell(
          headline,
          [
            ["Property", address],
            ["MLS listing", `#${request.mls_number}`],
            ["Photographs", String(request.photo_count || 0)],
            ["Videos", String(request.video_count || 0)],
          ],
          { label: "View your gallery", url: galleryUrl },
          body,
        ),
        textContent: `${body}\n\n${galleryUrl}`,
        senderEmail: BOOKINGS_SENDER_EMAIL,
        senderName: "Arriv Estate Media",
      });
      emailed = !!res?.ok;
      await logMessage(base44, {
        message_type: "email",
        recipient_type: "client",
        recipient_email: request.client_email,
        subject,
        message_content: `${body}\n\n${galleryUrl}`,
        job_id: request.job_id,
        status: emailed ? "success" : "failed",
      });
    } catch (err) {
      await logMessage(base44, {
        message_type: "email",
        recipient_type: "client",
        recipient_email: request.client_email,
        subject,
        message_content: body,
        job_id: request.job_id,
        status: "failed",
        error_message: (err as Error)?.message,
      });
    }
  }

  let smsSent = false;
  const phone = request.client_phone || job?.client_phone;
  if (phone) {
    const smsBody = videoPending
      ? `Arriv: your photos were uploaded to FMLS for listing #${request.mls_number}. The video link is still being added. ${galleryUrl}`
      : `Arriv: your selected media was uploaded to FMLS for listing #${request.mls_number}. ${galleryUrl}`;
    smsSent = await sendSmsTo(phone, smsBody);
    await logMessage(base44, {
      message_type: "sms",
      recipient_type: "client",
      recipient_phone: phone,
      message_content: smsBody,
      job_id: request.job_id,
      status: smsSent ? "success" : "failed",
    });
  }

  return { emailed, smsSent };
}
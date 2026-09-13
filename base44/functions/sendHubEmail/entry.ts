import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveRepEmailConnection, sendEmailViaConnection } from "../../shared/repEmailConnection.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { to, cc, bcc, subject, body, contactEmail, fromEmail, fromName, salesMemberId, contactName, companyName, inReplyTo, references } = await req.json();

    if (!to || !subject || !body) return Response.json({ error: 'Missing required fields' }, { status: 400 });

    // Resolve the rep's email connection
    let connection = null;
    if (salesMemberId) {
      try {
        connection = await resolveRepEmailConnection(base44, salesMemberId);
      } catch (_) {}
    }

    // If no per-rep connection, fall back to app-level Gmail connector
    if (!connection || connection.type === 'none') {
      try {
        const gmailAccessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
        if (gmailAccessToken) {
          // Use app-level Gmail connector
          let sendFromEmail = fromEmail;
          if (!sendFromEmail) {
            const profileResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
              headers: { 'Authorization': `Bearer ${gmailAccessToken}` },
            });
            const profile = await profileResponse.json();
            sendFromEmail = profile.emailAddress;
          }
          const fromHeader = fromName ? `${fromName} <${sendFromEmail}>` : sendFromEmail;
          const emailLines = [
            `To: ${to}`,
            `Subject: ${subject}`,
            `From: ${fromHeader}`,
            `Content-Type: text/html; charset=utf-8`,
          ];
          if (cc) emailLines.push(`Cc: ${cc}`);
          if (bcc) emailLines.push(`Bcc: ${bcc}`);
          if (inReplyTo) emailLines.push(`In-Reply-To: ${inReplyTo}`);
          if (references) emailLines.push(`References: ${references}`);
          emailLines.push('', body);
          const emailContent = emailLines.join('\r\n');
          const encoder = new TextEncoder();
          const emailBytes = encoder.encode(emailContent);
          const base64 = btoa(String.fromCharCode(...emailBytes));
          const encodedEmail = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
          const gmailResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${gmailAccessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw: encodedEmail }),
          });
          if (!gmailResponse.ok) {
            const gmailError = await gmailResponse.json();
            return Response.json({ error: 'Failed to send email via Gmail connector', details: gmailError }, { status: 500 });
          }
          await logActivityAndHubSpot(base44, { salesMemberId, to, subject, body, contactEmail, contactName, companyName, fromEmail: sendFromEmail });
          return Response.json({ success: true, message: 'Email sent via Gmail connector' });
        }
      } catch (_) {}
    }

    // Send via per-rep connection (or Brevo fallback if none)
    const result = await sendEmailViaConnection(base44, connection || { type: 'none', emailAddress: fromEmail || null, member: null }, {
      to, cc, bcc, subject, body, fromName, inReplyTo, references,
    });

    await logActivityAndHubSpot(base44, { salesMemberId, to, subject, body, contactEmail, contactName, companyName, fromEmail: connection?.emailAddress || fromEmail });

    return Response.json({ success: true, message: 'Email sent', provider: result.provider });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function logActivityAndHubSpot(base44, { salesMemberId, to, subject, body, contactEmail, contactName, companyName, fromEmail }) {
  // Log to HubSpot
  try {
    const hubspotAccessToken = await base44.asServiceRole.connectors.getAccessToken('hubspot');
    const engagementBody = {
      engagement: { type: 'EMAIL', timestamp: Date.now() },
      associations: { contactIds: [] },
      metadata: { to, subject, body },
    };
    if (contactEmail) {
      const searchResponse = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${hubspotAccessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: contactEmail, limit: 1, properties: ['email'] }),
      });
      const searchData = await searchResponse.json();
      if (searchData.results?.length > 0) {
        engagementBody.associations.contactIds = [parseInt(searchData.results[0].id)];
      }
    }
    await fetch('https://api.hubapi.com/crm/v3/objects/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${hubspotAccessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(engagementBody),
    });
  } catch (_) {}

  // Log to ActivityLog
  if (salesMemberId) {
    try {
      await base44.asServiceRole.entities.ActivityLog.create({
        activity_type: 'email',
        contact_email: contactEmail || to,
        contact_name: contactName || null,
        company_name: companyName || null,
        activity_date: new Date().toISOString(),
        notes: `Subject: ${subject}\n\n${body}`,
        hubspot_synced: true,
        sales_member_id: salesMemberId,
        sales_member_email: fromEmail || null,
      });
    } catch (_) {}
  }
}
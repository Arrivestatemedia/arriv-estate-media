import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { to, cc, bcc, subject, body, contactEmail, fromEmail, fromName, salesMemberId, contactName, companyName, inReplyTo, references } = await req.json();
    
    if (!to || !subject || !body) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get Gmail access token from app connector
    const gmailAccessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
    
    let sendFromEmail = fromEmail;
    if (!sendFromEmail) {
      const profileResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
        headers: {
          'Authorization': `Bearer ${gmailAccessToken}`
        }
      });
      const profile = await profileResponse.json();
      sendFromEmail = profile.emailAddress;
    }

    const fromHeader = fromName
      ? `${fromName} <${sendFromEmail}>`
      : sendFromEmail;

    const emailLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `From: ${fromHeader}`,
      `Content-Type: text/plain; charset=utf-8`,
    ];

    if (cc) emailLines.push(`Cc: ${cc}`);
    if (bcc) emailLines.push(`Bcc: ${bcc}`);
    
    if (inReplyTo) {
      emailLines.push(`In-Reply-To: ${inReplyTo}`);
    }
    
    if (references) {
      emailLines.push(`References: ${references}`);
    }
    
    emailLines.push('');
    emailLines.push(body);
    const emailContent = emailLines.join('\r\n');
    
    // Proper base64 URL-safe encoding for Gmail API
    const encoder = new TextEncoder();
    const emailBytes = encoder.encode(emailContent);
    const base64 = btoa(String.fromCharCode(...emailBytes));
    const encodedEmail = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    console.log('Sending email from:', sendFromEmail);
    console.log('Email to:', to);
    
    const gmailResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gmailAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        raw: encodedEmail
      })
    });

    if (!gmailResponse.ok) {
      const gmailError = await gmailResponse.json();
      console.error('Gmail API error:', JSON.stringify(gmailError, null, 2));
      console.error('Attempted to send from:', sendFromEmail);
      console.error('Error likely means the From address is not verified or not a valid Send As alias in Gmail');
      return Response.json({ error: 'Failed to send email - check that the From address is verified in Gmail settings', details: gmailError }, { status: 500 });
    }

    // Log to HubSpot as email engagement
    const hubspotAccessToken = await base44.asServiceRole.connectors.getAccessToken('hubspot');
    
    const engagementBody = {
      engagement: {
        type: 'EMAIL',
        timestamp: Date.now()
      },
      associations: {
        contactIds: []
      },
      metadata: {
        to: to,
        subject: subject,
        body: body
      }
    };

    // Try to find contact ID if contactEmail is provided
    if (contactEmail) {
      const searchUrl = 'https://api.hubapi.com/crm/v3/objects/contacts/search';
      const searchBody = {
        query: contactEmail,
        limit: 1,
        properties: ['email']
      };

      const searchResponse = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hubspotAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(searchBody)
      });

      const searchData = await searchResponse.json();
      if (searchData.results?.length > 0) {
        engagementBody.associations.contactIds = [parseInt(searchData.results[0].id)];
      }
    }

    await fetch('https://api.hubapi.com/crm/v3/objects/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hubspotAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(engagementBody)
    });

    // Log to ActivityLog entity so it shows up in the Activity Log
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
      } catch (logError) {
        console.error('Error logging activity:', logError.message);
        // Don't fail the entire email send if activity logging fails
      }
    }

    return Response.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
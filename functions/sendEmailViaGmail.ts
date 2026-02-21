import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { to, subject, body, contactEmail } = await req.json();
    
    if (!to || !subject || !body) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Send email via Gmail
    const gmailAccessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
    
    const emailContent = `Subject: ${subject}\r\nTo: ${to}\r\n\r\n${body}`;
    const encodedEmail = btoa(emailContent).replace(/\+/g, '-').replace(/\//g, '_');

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
      return Response.json({ error: 'Failed to send email' }, { status: 500 });
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

    return Response.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
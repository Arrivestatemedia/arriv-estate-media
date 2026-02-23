import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { contactEmails, toEmail } = await req.json();

    if (!contactEmails || contactEmails.length === 0) {
      return Response.json({ threads: [] });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');

    // Build a Gmail search query: emails FROM any of the contact addresses TO the sales rep's email
    const fromQuery = contactEmails
      .filter(Boolean)
      .map(e => `from:${e}`)
      .join(' OR ');
    
    const query = toEmail ? `(${fromQuery}) deliveredto:${toEmail}` : fromQuery;

    const searchRes = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=30`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!searchRes.ok) {
      const err = await searchRes.json();
      return Response.json({ error: err.error?.message || 'Gmail search failed' }, { status: 500 });
    }

    const searchData = await searchRes.json();
    const messages = searchData.messages || [];

    // Fetch snippet + headers for each message
    const threads = await Promise.all(
      messages.slice(0, 20).map(async (msg) => {
        const msgRes = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID&metadataHeaders=References`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!msgRes.ok) return null;
        const msgData = await msgRes.json();
        const headers = msgData.payload?.headers || [];
        const get = (name) => headers.find(h => h.name === name)?.value || '';
        return {
          id: msg.id,
          from: get('From'),
          subject: get('Subject'),
          date: get('Date'),
          snippet: msgData.snippet || '',
          messageId: get('Message-ID'),
          references: get('References'),
        };
      })
    );

    return Response.json({ threads: threads.filter(Boolean) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
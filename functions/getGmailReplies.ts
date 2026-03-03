import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { contactEmails, toEmail } = await req.json();

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');

    // Only fetch emails delivered to this rep's specific email address
    let query = 'in:inbox';
    if (toEmail) {
      query = `in:inbox to:${toEmail}`;
    }
    if (contactEmails && contactEmails.length > 0) {
      const fromQuery = contactEmails.filter(Boolean).map(e => `from:${e}`).join(' OR ');
      query += ` (${fromQuery})`;
    }

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

    // Fetch full message (including payload with parts) for each message
    const threads = await Promise.all(
      messages.slice(0, 20).map(async (msg) => {
        const msgRes = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!msgRes.ok) return null;
        const msgData = await msgRes.json();
        const headers = msgData.payload?.headers || [];
        const get = (name) => headers.find(h => h.name === name)?.value || '';
        
        // Extract all parts with proper partId structure for attachment/image extraction
        const extractParts = (payload, parentPartId = '') => {
          const result = [];
          if (!payload) return result;
          
          if (payload.parts && Array.isArray(payload.parts)) {
            payload.parts.forEach((part, index) => {
              const partId = parentPartId ? `${parentPartId}.${index}` : String(index);
              result.push({
                partId,
                mimeType: part.mimeType,
                filename: part.filename,
              });
              // Recursively extract nested parts
              if (part.parts) {
                result.push(...extractParts(part, partId));
              }
            });
          }
          return result;
        };
        
        const parts = extractParts(msgData.payload);
        
        return {
          id: msg.id,
          from: get('From'),
          subject: get('Subject'),
          date: get('Date'),
          snippet: msgData.snippet || '',
          messageId: get('Message-ID'),
          references: get('References'),
          parts: parts, // Include parts with proper partIds
          payload: msgData.payload, // Include payload for body extraction
        };
      })
    );

    return Response.json({ threads: threads.filter(Boolean) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
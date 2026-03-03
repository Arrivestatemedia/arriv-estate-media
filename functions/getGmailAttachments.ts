import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { messageId, parts } = await req.json();
    if (!messageId || !parts || !Array.isArray(parts)) {
      return Response.json({ error: 'Missing messageId or parts' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');

    // First, fetch the full message to get attachmentIds
    const messageResponse = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!messageResponse.ok) {
      return Response.json({ error: 'Failed to fetch message' }, { status: messageResponse.status });
    }

    const messageData = await messageResponse.json();
    const payload = messageData.payload || {};
    
    // Build a map of partId -> attachmentId from the payload
    const getAttachmentIdMap = (part) => {
      const map = {};
      if (part.body?.attachmentId) {
        map[part.partId || ''] = part.body.attachmentId;
      }
      if (part.parts) {
        for (const subPart of part.parts) {
          Object.assign(map, getAttachmentIdMap(subPart));
        }
      }
      return map;
    };

    const attachmentIdMap = getAttachmentIdMap(payload);
    const attachments = [];

    // Process all parts
    for (const part of parts) {
      try {
        const { mimeType, filename, partId } = part;
        
        if (!partId) continue;
        
        const attachmentId = attachmentIdMap[partId];
        if (!attachmentId) {
          console.log(`No attachmentId found for partId ${partId}`);
          continue;
        }
        
        // Fetch the attachment data from Gmail API
        const response = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (!response.ok) {
          console.error(`Failed to fetch attachment ${attachmentId}: ${response.status}`);
          continue;
        }

        const attachmentResponse = await response.json();
        const attachmentData = attachmentResponse.data;
        const size = attachmentResponse.size;

        if (!attachmentData) {
          console.log(`No data for part ${partId}`);
          continue;
        }

        // Decode base64url to base64
        const base64Data = attachmentData.replace(/-/g, '+').replace(/_/g, '/');
        
        // Determine filename
        let fname = filename;
        if (!fname && mimeType?.startsWith('image/')) {
          const ext = mimeType.split('/')[1] || 'jpg';
          fname = `image-${attachments.length + 1}.${ext}`;
        } else if (!fname) {
          fname = `attachment-${attachments.length + 1}`;
        }
        
        const isImage = mimeType?.startsWith('image/');
        
        attachments.push({
          filename: fname,
          mimeType: mimeType || 'application/octet-stream',
          dataUrl: isImage ? `data:${mimeType};base64,${base64Data}` : null,
          data: base64Data,
          size,
          isInline: !filename && isImage,
        });
      } catch (e) {
        console.error(`Error fetching part ${part.partId}:`, e.message);
      }
    }

    return Response.json({ attachments });
  } catch (error) {
    console.error('Error in getGmailAttachments:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
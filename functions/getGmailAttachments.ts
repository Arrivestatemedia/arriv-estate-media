import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { messageId, partIds } = await req.json();
    if (!messageId || !partIds || !Array.isArray(partIds)) {
      return Response.json({ error: 'Missing messageId or partIds' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');

    const attachments = [];

    for (const partId of partIds) {
      try {
        const response = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${partId}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (!response.ok) {
          console.error(`Failed to fetch attachment ${partId}:`, response.status);
          continue;
        }

        const data = await response.json();
        const { filename, mimeType, data: attachmentData, size } = data;

        // Only process if we have actual data
        if (attachmentData) {
          // Decode base64url to actual base64
          const base64Data = attachmentData.replace(/-/g, '+').replace(/_/g, '/');
          
          // Detect if it's an image
          const isImage = mimeType && mimeType.startsWith('image/');
          
          attachments.push({
            filename: filename || `attachment-${partId}`,
            mimeType,
            dataUrl: isImage ? `data:${mimeType};base64,${base64Data}` : null,
            data: base64Data,
            size,
          });
        }
      } catch (e) {
        console.error(`Error fetching attachment ${partId}:`, e.message);
      }
    }

    return Response.json({ attachments });
  } catch (error) {
    console.error('Error in getGmailAttachments:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
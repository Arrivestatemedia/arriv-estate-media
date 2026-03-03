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

    const { accessToken } = await base44.connectors.getConnection('gmail');

    const attachments = [];

    // Process all parts
    for (const part of parts) {
      try {
        const { mimeType, filename, partId } = part;
        
        if (!partId) continue;
        
        // Fetch the attachment data from Gmail API
        const response = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${partId}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (!response.ok) {
          console.error(`Failed to fetch part ${partId}: ${response.status}`);
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
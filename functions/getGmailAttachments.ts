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

    const attachments = [];

    // Process all parts that have attachments or are images
    for (const part of parts) {
      try {
        const { mimeType, filename, partId, headers } = part;
        
        // Check for attachments and inline images
        const isAttachment = part.filename && part.filename.length > 0;
        const isImage = mimeType && mimeType.startsWith('image/');
        
        if (!isAttachment && !isImage) continue;
        
        // Fetch the attachment data
        const response = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${partId}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (!response.ok) {
          console.error(`Failed to fetch part ${partId}:`, response.status);
          continue;
        }

        const data = await response.json();
        const { data: attachmentData, size } = data;

        // Only process if we have actual data
        if (attachmentData) {
          // Decode base64url to actual base64
          const base64Data = attachmentData.replace(/-/g, '+').replace(/_/g, '/');
          
          // Get filename
          let fname = filename || `image-${attachments.length + 1}`;
          
          // For inline images without filename, create one
          if (!filename && isImage) {
            const ext = mimeType.split('/')[1] || 'jpg';
            fname = `image-${attachments.length + 1}.${ext}`;
          }
          
          attachments.push({
            filename: fname,
            mimeType,
            dataUrl: isImage ? `data:${mimeType};base64,${base64Data}` : null,
            data: base64Data,
            size,
            isInline: !isAttachment && isImage,
          });
        }
      } catch (e) {
        console.error(`Error fetching part:`, e.message);
      }
    }

    return Response.json({ attachments });
  } catch (error) {
    console.error('Error in getGmailAttachments:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
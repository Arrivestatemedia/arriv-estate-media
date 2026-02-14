import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { jobAddress, mediaPartnerEmail } = await req.json();

        if (!jobAddress || !mediaPartnerEmail) {
            return Response.json({ error: 'Missing required fields: jobAddress, mediaPartnerEmail' }, { status: 400 });
        }

        const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

        // Create folder in Google Drive
        const createFolderResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: jobAddress,
                mimeType: 'application/vnd.google-apps.folder',
            }),
        });

        if (!createFolderResponse.ok) {
            const error = await createFolderResponse.text();
            console.error('Failed to create folder:', error);
            return Response.json({ error: 'Failed to create Google Drive folder' }, { status: 500 });
        }

        const folderData = await createFolderResponse.json();
        const folderId = folderData.id;

        // Grant editor access to media partner
        const shareResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}/permissions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                role: 'editor',
                type: 'user',
                emailAddress: mediaPartnerEmail,
            }),
        });

        if (!shareResponse.ok) {
            const error = await shareResponse.text();
            console.error('Failed to share folder:', error);
            return Response.json({ error: 'Failed to share Google Drive folder' }, { status: 500 });
        }

        return Response.json({ 
            success: true, 
            folderId: folderId,
            folderName: jobAddress,
            sharedWith: mediaPartnerEmail
        });
    } catch (error) {
        console.error('Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
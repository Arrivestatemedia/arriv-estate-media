import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { base64 } from 'npm:js-base64@3.7.5';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { userName, userEmail, userType, deletionDate, userId } = await req.json();

        const adminEmail = Deno.env.get('ADMIN_EMAIL');
        if (!adminEmail) {
            return Response.json({ error: 'Admin email not configured' }, { status: 500 });
        }

        const appDomain = Deno.env.get('BASE44_APP_DOMAIN') || 'app.arrivestatemedia.com';
        const deleteUrl = `https://${appDomain}/confirmDeleteUser?token=${userId}&email=${encodeURIComponent(userEmail)}`;

        // Get Gmail access token
        const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');

        // Construct RFC 5322 formatted email
        const emailBody = `Account Deletion Request\n\nUser: ${userName}\nEmail: ${userEmail}\nUser Type: ${userType}\nScheduled Deletion Date: ${deletionDate}\n\nTo delete immediately: ${deleteUrl}`;
        
        const message = [
            `To: ${adminEmail}`,
            'From: noreply@arrivestatemedia.com',
            `Subject: Account Deletion Request - ${userName}`,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset="UTF-8"',
            '',
            emailBody
        ].join('\r\n');

        // Send via Gmail API
        const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                raw: base64.encode(message)
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Gmail API error: ${errorData.error.message}`);
        }

        return Response.json({ success: true });
    } catch (error) {
        console.error('Error sending deletion email:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
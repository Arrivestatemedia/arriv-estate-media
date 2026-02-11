import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

        // Get Gmail access token and send via Gmail API directly
        const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');

        // Construct RFC 5322 formatted email message
        const emailSubject = `Account Deletion Request - ${userName}`;
        const emailBody = `Account Deletion Request\n\nUser: ${userName}\nEmail: ${userEmail}\nUser Type: ${userType}\nScheduled Deletion Date: ${deletionDate}\n\nTo delete immediately: ${deleteUrl}`;

        // Create message in RFC 5322 format
        const messageLines = [
            `To: ${adminEmail}`,
            'From: noreply@arrivestatemedia.com',
            `Subject: ${emailSubject}`,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset="UTF-8"',
            'Content-Transfer-Encoding: 7bit',
            '',
            emailBody
        ];

        const messageParts = [];
        for (const line of messageLines) {
            messageParts.push(new TextEncoder().encode(line + '\r\n'));
        }

        const messageBytes = messageParts.reduce((acc, part) => {
            const newAcc = new Uint8Array(acc.length + part.length);
            newAcc.set(acc);
            newAcc.set(part, acc.length);
            return newAcc;
        }, new Uint8Array());

        // Encode to base64url
        const base64urlMessage = btoa(String.fromCharCode(...messageBytes))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');

        // Send via Gmail API
        const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                raw: base64urlMessage
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Gmail API error:', errorData);
            throw new Error(`Gmail API error: ${JSON.stringify(errorData)}`);
        }

        const result = await response.json();
        return Response.json({ success: true, messageId: result.id });
    } catch (error) {
        console.error('Error sending deletion email:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
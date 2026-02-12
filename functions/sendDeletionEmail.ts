import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
            const base44 = createClientFromRequest(req);
            const { userName, userEmail, userType, deletionDate, deletionToken } = await req.json();

            const adminEmail = Deno.env.get('ADMIN_EMAIL');
            if (!adminEmail) {
                return Response.json({ error: 'Admin email not configured' }, { status: 500 });
            }

            const appDomain = Deno.env.get('BASE44_APP_DOMAIN') || 'app.arrivestatemedia.com';
            const deleteUrl = `https://${appDomain}/confirmDeleteAccount?token=${deletionToken}&email=${encodeURIComponent(userEmail)}`;

        // Get Gmail access token
        const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');

        // Construct RFC 5322 formatted email
        const emailSubject = `Account Deletion Request - ${userName}`;
        const emailBody = `Account Deletion Request\n\nUser: ${userName}\nEmail: ${userEmail}\nUser Type: ${userType}\nScheduled Deletion Date: ${deletionDate}\n\nTo delete immediately: ${deleteUrl}`;

        // Create message in RFC 5322 format
        const messageLines = [
            `To: ${adminEmail}`,
            `From: ${adminEmail}`,
            `Subject: ${emailSubject}`,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset="UTF-8"',
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
        const sendResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ raw: base64urlMessage })
        });

        if (!sendResponse.ok) {
            const errorData = await sendResponse.json();
            await base44.asServiceRole.entities.MessageLog.create({
              message_type: 'email',
              recipient_type: 'admin',
              recipient_email: adminEmail,
              message_content: emailBody,
              subject: emailSubject,
              status: 'failed',
              error_message: JSON.stringify(errorData)
            });
            throw new Error(`Gmail API error: ${JSON.stringify(errorData)}`);
        }

        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email',
          recipient_type: 'admin',
          recipient_email: adminEmail,
          message_content: emailBody,
          subject: emailSubject,
          status: 'success'
        });

        const result = await sendResponse.json();
        return Response.json({ success: true, messageId: result.id });
    } catch (error) {
        console.error('Error sending deletion email:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
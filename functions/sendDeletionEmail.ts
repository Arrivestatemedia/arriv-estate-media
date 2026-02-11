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

        // Send email using Gmail connector through Base44
        try {
            // Use Base44's integration to send via Gmail
            const gmailResponse = await base44.asServiceRole.integrations.Gmail.SendMessage({
                to: adminEmail,
                subject: `Account Deletion Request - ${userName}`,
                body: `Account Deletion Request\n\nUser: ${userName}\nEmail: ${userEmail}\nUser Type: ${userType}\nScheduled Deletion Date: ${deletionDate}\n\nTo delete immediately: ${deleteUrl}`
            });

            return Response.json({ success: true, messageId: gmailResponse });
        } catch (gmailError) {
            // Fallback: log and try Base44's native SendEmail
            console.warn('Gmail integration failed, trying Base44 SendEmail:', gmailError);
            
            await base44.asServiceRole.integrations.Core.SendEmail({
                to: adminEmail,
                subject: `Account Deletion Request - ${userName}`,
                body: `Account Deletion Request\n\nUser: ${userName}\nEmail: ${userEmail}\nUser Type: ${userType}\nScheduled Deletion Date: ${deletionDate}\n\nTo delete immediately: ${deleteUrl}`
            });

            return Response.json({ success: true });
        }
    } catch (error) {
        console.error('Error sending deletion email:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
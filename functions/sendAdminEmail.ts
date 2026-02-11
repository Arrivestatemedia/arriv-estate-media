import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { subject, to, userName, userEmail, userType, deletionDate, userId } = await req.json();

        const appDomain = Deno.env.get('BASE44_APP_DOMAIN') || 'app.arrivestatemedia.com';
        const deleteUrl = `https://${appDomain}/confirmDeleteUser?token=${userId}&email=${encodeURIComponent(userEmail)}`;

        await base44.asServiceRole.integrations.Core.SendEmail({
            to: to,
            from_name: 'Arriv Estate Media',
            subject: subject,
            body: `Account Deletion Request\n\nUser: ${userName}\nEmail: ${userEmail}\nUser Type: ${userType}\nScheduled Deletion Date: ${deletionDate}\n\nThe user has requested to delete their account. The account is scheduled for automatic deletion in 30 days.\n\nTo delete this account immediately, visit:\n${deleteUrl}`
        });

        return Response.json({ success: true });
    } catch (error) {
        console.error('Error sending email:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
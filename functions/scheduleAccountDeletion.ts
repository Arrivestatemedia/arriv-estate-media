import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { email } = await req.json();

        if (!email) {
            return Response.json({ error: 'Email is required' }, { status: 400 });
        }

        // Find user in PendingSignup (case-insensitive)
        const allUsers = await base44.asServiceRole.entities.PendingSignup.list();
        const user = allUsers.find(u => u.email.toLowerCase() === email.toLowerCase());

        if (!user) {
            return Response.json({ error: 'Account not found' }, { status: 404 });
        }

        // Set deletion date to 30 days from now
        const deletionDate = new Date();
        deletionDate.setDate(deletionDate.getDate() + 30);

        // Update user with deletion details
        await base44.asServiceRole.entities.PendingSignup.update(user.id, {
            deletion_requested_date: new Date().toISOString(),
            deletion_token: generateToken()
        });

        // Email notification
        try {
            const adminEmail = Deno.env.get('ADMIN_EMAIL');
            if (adminEmail) {
                const appDomain = Deno.env.get('BASE44_APP_DOMAIN') || 'app.arrivestatemedia.com';
                const deleteUrl = `https://${appDomain}/confirmDeleteUser?token=${user.id}&email=${encodeURIComponent(user.email)}`;

                await base44.asServiceRole.integrations.Core.SendEmail({
                    to: adminEmail,
                    subject: `Account Deletion Request - ${user.full_name}`,
                    body: `Account Deletion Request\n\nUser: ${user.full_name}\nEmail: ${user.email}\nUser Type: ${user.user_type}\nScheduled Deletion Date: ${deletionDate.toLocaleDateString()}\n\nTo delete immediately: ${deleteUrl}`
                });
            }
        } catch (emailError) {
            console.error('Email notification failed:', emailError);
        }

        return Response.json({
            success: true,
            message: 'Account scheduled for deletion',
            deletion_date: deletionDate.toISOString().split('T')[0]
        });
    } catch (error) {
        console.error('Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

function generateToken() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
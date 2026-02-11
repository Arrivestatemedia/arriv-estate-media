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

        // Get admin email from environment
        const adminEmail = Deno.env.get('ADMIN_EMAIL');
        const appDomain = Deno.env.get('BASE44_APP_DOMAIN') || 'app.arrivestatemedia.com';
        const deleteUrl = `https://${appDomain}/confirmDeleteUser?token=${user.id}&email=${encodeURIComponent(user.email)}`;

        // Send email to admin
        if (adminEmail) {
            try {
                await base44.asServiceRole.integrations.Core.SendEmail({
                    to: adminEmail,
                    subject: `Account Deletion Request - ${user.full_name}`,
                    body: `
                        <h2>Account Deletion Request</h2>
                        <p><strong>User:</strong> ${user.full_name}</p>
                        <p><strong>Email:</strong> ${user.email}</p>
                        <p><strong>User Type:</strong> ${user.user_type}</p>
                        <p><strong>Scheduled Deletion Date:</strong> ${deletionDate.toLocaleDateString()}</p>
                        
                        <p>The user has requested to delete their account. The account is scheduled for automatic deletion in 30 days.</p>
                        
                        <p>To delete this account immediately, click the link below:</p>
                        <a href="${deleteUrl}" style="display: inline-block; padding: 12px 24px; background-color: #dc2626; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">Delete Account Now</a>
                        
                        <p style="color: #666; font-size: 12px;">Or copy this link: ${deleteUrl}</p>
                    `
                });
            } catch (emailError) {
                console.error('Failed to send email to admin:', emailError);
            }
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
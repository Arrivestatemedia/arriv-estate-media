import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { sendBrevoEmail } from '../../shared/brevoClient.ts';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Set deletion date to 30 days from now
        const deletionDate = new Date();
        deletionDate.setDate(deletionDate.getDate() + 30);

        await base44.asServiceRole.entities.User.update(user.id, {
            deletion_scheduled_date: deletionDate.toISOString().split('T')[0]
        });

        // Get admin users
        const adminUsers = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
        const appDomain = Deno.env.get('BASE44_APP_DOMAIN') || 'app.arrivestatemedia.com';
        const confirmUrl = `https://${appDomain}/confirmDeleteUser?user_id=${user.id}`;

        // Send email to all admins
        for (const admin of adminUsers) {
            try {
                await sendBrevoEmail({
                    to: admin.email,
                    subject: `Account Deletion Request - ${user.full_name}`,
                    htmlContent: `
                        <h2>Account Deletion Request</h2>
                        <p><strong>User:</strong> ${user.full_name}</p>
                        <p><strong>Email:</strong> ${user.email}</p>
                        <p><strong>Account Type:</strong> ${user.user_type || 'user'}</p>
                        <p><strong>Scheduled Deletion Date:</strong> ${deletionDate.toLocaleDateString()}</p>
                        
                        <p>The user has requested to delete their account. The account is scheduled for automatic deletion in 30 days.</p>
                        
                        <p>To delete this account immediately, click the link below:</p>
                        <a href="${confirmUrl}" style="display: inline-block; padding: 12px 24px; background-color: #dc2626; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">Delete Account Now</a>
                        
                        <p style="color: #666; font-size: 12px;">Or copy this link: ${confirmUrl}</p>
                    `
                });
            } catch (emailError) {
                console.error('Failed to send email to admin:', admin.email, emailError);
            }
        }

        return Response.json({ 
            success: true, 
            message: 'Account scheduled for deletion',
            deletion_date: deletionDate.toISOString().split('T')[0]
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
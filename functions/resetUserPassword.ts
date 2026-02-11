import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const { user_id, user_email } = await req.json();

        if (!user_id || !user_email) {
            return Response.json({ error: 'User ID and email are required' }, { status: 400 });
        }

        // Mark user for password change
        await base44.asServiceRole.entities.User.update(user_id, {
            needs_password_change: true
        });

        // Send password reset email
        await base44.integrations.Core.SendEmail({
            to: user_email,
            subject: 'Password Reset Request',
            body: `An administrator has requested a password reset for your account. Please log in and change your password immediately. If you did not request this, please contact the administrator.`
        });

        return Response.json({
            success: true,
            message: 'Password reset email sent successfully'
        });
    } catch (error) {
        console.error('Reset password error:', error);
        return Response.json({ error: error.message || 'Failed to reset password' }, { status: 500 });
    }
});
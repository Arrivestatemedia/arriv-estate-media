import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { email } = await req.json();

        if (!email) {
            return Response.json({ error: 'Email is required' }, { status: 400 });
        }

        // Generate random password
        const newPassword = Math.random().toString(36).slice(-12);

        // Hash the new password
        const encoder = new TextEncoder();
        const data = encoder.encode(newPassword);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Find sales rep by email
        const reps = await base44.asServiceRole.entities.SalesTeamMember.filter({ email });
        
        if (!reps || reps.length === 0) {
            return Response.json({ error: 'Sales rep not found' }, { status: 404 });
        }

        const rep = reps[0];

        // Update password and set force_password_change flag
        await base44.asServiceRole.entities.SalesTeamMember.update(rep.id, {
            password_hash: hashHex,
            force_password_change: true
        });

        // Send email with new password
        await base44.asServiceRole.integrations.Core.SendEmail({
            to: email,
            subject: 'Your Password Has Been Reset',
            body: `Your password has been reset.\n\nYour new temporary password is: ${newPassword}\n\nPlease log in and change your password immediately.`
        });

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
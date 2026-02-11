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
        const deletionToken = generateToken();
        await base44.asServiceRole.entities.PendingSignup.update(user.id, {
            deletion_requested_date: new Date().toISOString(),
            deletion_token: deletionToken
        });

        // Send deletion email via separate function
        try {
            await base44.asServiceRole.functions.invoke('sendDeletionEmail', {
                userName: user.full_name,
                userEmail: user.email,
                userType: user.user_type,
                deletionDate: deletionDate.toLocaleDateString(),
                deletionToken: deletionToken
            });
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
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const email = (body.email || '').trim();

        if (!email) {
            return Response.json({ error: 'Email required' }, { status: 400 });
        }

        const emailLower = email.toLowerCase();

        // Check current status (webhook will have updated by now)
        let signups = await base44.asServiceRole.entities.PendingSignup.filter({ email: email });
        if (!signups.length && email !== emailLower) {
            signups = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailLower });
        }

        if (signups.length > 0) {
            return Response.json({ 
                success: true, 
                onboardingFeePaid: !!signups[0].onboardingFeePaid
            });
        }

        // Check User entity
        let users = await base44.asServiceRole.entities.User.filter({ email: email });
        if (!users.length && email !== emailLower) {
            users = await base44.asServiceRole.entities.User.filter({ email: emailLower });
        }

        if (users.length > 0) {
            return Response.json({ 
                success: true, 
                onboardingFeePaid: !!users[0].onboardingFeePaid
            });
        }

        return Response.json({ success: false, message: 'User not found' }, { status: 404 });

    } catch (error) {
        console.error('confirmPaymentAndMarkComplete error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { email } = await req.json();

        if (!email) {
            return Response.json({ error: 'Email required' }, { status: 400 });
        }

        const emailTrimmed = email.trim();
        const emailLower = emailTrimmed.toLowerCase();

        // Try exact match first, then lowercase – no regex to avoid CPU timeouts
        let signups = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailTrimmed });
        if (!signups.length && emailTrimmed !== emailLower) {
            signups = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailLower });
        }

        let record = signups[0] || null;

        if (!record) {
            let users = await base44.asServiceRole.entities.User.filter({ email: emailTrimmed });
            if (!users.length && emailTrimmed !== emailLower) {
                users = await base44.asServiceRole.entities.User.filter({ email: emailLower });
            }
            record = users[0] || null;
        }

        let termsSigned = false;
        try {
            let signed = await base44.asServiceRole.entities.SignedTerms.filter({ media_partner_email: emailTrimmed });
            if (!signed.length && emailTrimmed !== emailLower) {
                signed = await base44.asServiceRole.entities.SignedTerms.filter({ media_partner_email: emailLower });
            }
            termsSigned = signed.length > 0;
        } catch (e) {
            console.error('termsSigned check error:', e);
        }

        return Response.json({
            orientationCompleted: record?.orientationCompleted || false,
            onboardingFeePaid: record?.onboardingFeePaid || false,
            termsSigned
        });
    } catch (error) {
        console.error('checkOrientationStatus error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
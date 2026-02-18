import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { email } = await req.json();

        if (!email) {
            return Response.json({ error: 'Email required' }, { status: 400 });
        }

        const emailRegex = { $regex: `^${email.trim()}$`, $options: 'i' };
        const [signups, users] = await Promise.all([
            base44.asServiceRole.entities.PendingSignup.filter({ email: emailRegex }),
            base44.asServiceRole.entities.User.filter({ email: emailRegex })
        ]);

        const record = signups[0] || users[0] || null;

        return Response.json({
            orientationCompleted: record?.orientationCompleted || false,
            onboardingFeePaid: record?.onboardingFeePaid || false
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
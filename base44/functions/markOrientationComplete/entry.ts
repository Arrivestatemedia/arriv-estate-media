import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { email } = await req.json();

        if (!email) {
            return Response.json({ error: 'Email required' }, { status: 400 });
        }

        const emailLower = email.trim().toLowerCase();

        // Try exact match first, then lowercase
        let signups = await base44.asServiceRole.entities.PendingSignup.filter({ email: email.trim() });
        if (!signups.length) {
            signups = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailLower });
        }

        const archiveApplication = async (appEmail) => {
            try {
                const apps = await base44.asServiceRole.entities.JobApplication.filter({ email: appEmail.trim().toLowerCase(), position: 'media_specialist' });
                for (const a of apps) {
                    if (!a.archived) {
                        await base44.asServiceRole.entities.JobApplication.update(a.id, { archived: true });
                    }
                }
            } catch (e) {
                console.error("archive application after orientation failed:", e.message);
            }
        };

        if (signups.length > 0) {
            await base44.asServiceRole.entities.PendingSignup.update(signups[0].id, {
                orientationCompleted: true
            });
            await archiveApplication(signups[0].email);
            return Response.json({ success: true });
        }

        let users = await base44.asServiceRole.entities.User.filter({ email: email.trim() });
        if (!users.length) {
            users = await base44.asServiceRole.entities.User.filter({ email: emailLower });
        }

        if (users.length > 0) {
            await base44.asServiceRole.entities.User.update(users[0].id, {
                orientationCompleted: true
            });
            await archiveApplication(users[0].email);
            return Response.json({ success: true });
        }

        return Response.json({ error: 'User not found' }, { status: 404 });

    } catch (error) {
        console.error('markOrientationComplete error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
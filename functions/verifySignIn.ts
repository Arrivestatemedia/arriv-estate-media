import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { email, password } = await req.json();

        if (!email || !password) {
            return Response.json({ success: false, error: 'Email and password required' }, { status: 400 });
        }

        const emailTrimmed = email.trim();
        const emailLower = emailTrimmed.toLowerCase();

        // Hash the password
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password));
        const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        // Try exact then lowercase
        let signups = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailTrimmed }).catch(() => []);
        if (!signups.length && emailTrimmed !== emailLower) {
            signups = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailLower }).catch(() => []);
        }

        const pendingUser = signups[0];
        if (pendingUser) {
            if (hashHex !== pendingUser.password_hash) {
                return Response.json({ success: false, error: 'Email or password incorrect' }, { status: 401 });
            }
            return Response.json({
                success: true,
                id: pendingUser.id,
                email: pendingUser.email,
                full_name: pendingUser.full_name,
                user_type: pendingUser.user_type,
                user_role: pendingUser.user_role === 'admin' ? 'admin' : 'user',
                phone_number: pendingUser.phone_number || '',
                orientationCompleted: pendingUser.orientationCompleted || false,
                onboardingFeePaid: pendingUser.onboardingFeePaid || false
            });
        }

        // Try User entity
        let users = await base44.asServiceRole.entities.User.filter({ email: emailTrimmed }).catch(() => []);
        if (!users.length && emailTrimmed !== emailLower) {
            users = await base44.asServiceRole.entities.User.filter({ email: emailLower }).catch(() => []);
        }

        const appUser = users[0];
        if (appUser) {
            if (hashHex !== appUser.password_hash) {
                return Response.json({ success: false, error: 'Email or password incorrect' }, { status: 401 });
            }
            return Response.json({
                success: true,
                id: appUser.id,
                email: appUser.email,
                full_name: appUser.full_name,
                user_type: appUser.user_type || 'user',
                user_role: appUser.user_role === 'admin' ? 'admin' : 'user',
                phone_number: appUser.phone_number || '',
                orientationCompleted: appUser.orientationCompleted || false,
                onboardingFeePaid: appUser.onboardingFeePaid || false
            });
        }

        return Response.json({ success: false, error: 'Email or password incorrect' }, { status: 401 });

    } catch (error) {
        console.error('SignIn error:', error);
        return Response.json({ success: false, error: error.message || 'Sign in failed' }, { status: 500 });
    }
});
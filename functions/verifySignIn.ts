import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const { email, password } = await req.json();

        if (!email || !password) {
            return Response.json({ success: false, error: 'Email and password required' }, { status: 400 });
        }

        const emailTrimmed = email.trim();

        // Hash the password immediately
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password));
        const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        // Use case-insensitive regex to find matching accounts in parallel
        const emailRegex = { $regex: `^${emailTrimmed}$`, $options: 'i' };
        const [signups, users] = await Promise.all([
            base44.asServiceRole.entities.PendingSignup.filter({ email: emailRegex }),
            base44.asServiceRole.entities.User.filter({ email: emailRegex })
        ]);

        const pendingUser = signups[0] || null;
        const appUser = users[0] || null;

        // PendingSignup takes priority (has password_hash)
        if (pendingUser) {
            if (hashHex !== pendingUser.password_hash) {
                return Response.json({ success: false, error: 'Email or password incorrect' }, { status: 401 });
            }
            const role = pendingUser.user_role;
            // Map legacy test_user role to admin or user
            const normalizedRole = (role === 'admin') ? 'admin' : 'user';
            return Response.json({
                success: true,
                id: pendingUser.id,
                email: pendingUser.email,
                full_name: pendingUser.full_name,
                user_type: pendingUser.user_type,
                user_role: normalizedRole,
                phone_number: pendingUser.phone_number || '',
                hasLoggedInBefore: pendingUser.hasLoggedInBefore || false,
                orientationCompleted: pendingUser.orientationCompleted || false,
                onboardingFeePaid: pendingUser.onboardingFeePaid || false
            });
        }

        // Fallback to User entity
        if (appUser) {
            if (hashHex !== appUser.password_hash) {
                return Response.json({ success: false, error: 'Email or password incorrect' }, { status: 401 });
            }
            const role = appUser.user_role || appUser.role || 'user';
            const normalizedRole = (role === 'admin') ? 'admin' : 'user';
            return Response.json({
                success: true,
                id: appUser.id,
                email: appUser.email,
                full_name: appUser.full_name,
                user_type: appUser.user_type || 'user',
                user_role: normalizedRole,
                phone_number: appUser.phone_number || '',
                hasLoggedInBefore: appUser.hasLoggedInBefore || false,
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
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const { email, password } = await req.json();

        if (!email || !password) {
            return Response.json({ success: false, error: 'Email and password required' }, { status: 400 });
        }

        const emailLower = email.trim().toLowerCase();

        // Hash the password
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password));
        const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        // Use SDK with service role for admin-level access
        const base44 = createClientFromRequest(req);

        // Try PendingSignup first
        const pending = await base44.asServiceRole.entities.PendingSignup.list();
        const foundPending = pending.find(u => u.email && u.email.toLowerCase() === emailLower);

        if (foundPending) {
            if (hashHex !== foundPending.password_hash) {
                return Response.json({ success: false, error: 'Email or password incorrect' }, { status: 401 });
            }
            return Response.json({
                success: true,
                id: foundPending.id,
                email: foundPending.email,
                full_name: foundPending.full_name,
                user_type: foundPending.user_type,
                user_role: foundPending.user_role === 'admin' ? 'admin' : 'user',
                phone_number: foundPending.phone_number || '',
                orientationCompleted: foundPending.orientationCompleted || false,
                onboardingFeePaid: foundPending.onboardingFeePaid || false
            });
        }

        // Try User entity
        const users = await base44.asServiceRole.entities.User.list();
        const foundUser = users.find(u => u.email && u.email.toLowerCase() === emailLower);

        if (foundUser) {
            if (hashHex !== foundUser.password_hash) {
                return Response.json({ success: false, error: 'Email or password incorrect' }, { status: 401 });
            }
            return Response.json({
                success: true,
                id: foundUser.id,
                email: foundUser.email,
                full_name: foundUser.full_name,
                user_type: foundUser.user_type || 'user',
                user_role: foundUser.user_role === 'admin' ? 'admin' : 'user',
                phone_number: foundUser.phone_number || '',
                orientationCompleted: foundUser.orientationCompleted || false,
                onboardingFeePaid: foundUser.onboardingFeePaid || false
            });
        }

        return Response.json({ success: false, error: 'Email or password incorrect' }, { status: 401 });

    } catch (error) {
        console.error('SignIn error:', error);
        return Response.json({ success: false, error: error.message || 'Sign in failed' }, { status: 500 });
    }
});
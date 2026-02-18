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

        // List all PendingSignup and filter in-memory to avoid filter() API timeout issues
        let allPending = [];
        try {
            allPending = await base44.asServiceRole.entities.PendingSignup.list();
        } catch (e) {
            console.error('Error listing PendingSignup:', e);
        }

        let matchedUser = allPending.find(u => 
            u.email && u.email.toLowerCase() === emailLower
        );

        if (matchedUser) {
            if (hashHex !== matchedUser.password_hash) {
                return Response.json({ success: false, error: 'Email or password incorrect' }, { status: 401 });
            }
            return Response.json({
                success: true,
                id: matchedUser.id,
                email: matchedUser.email,
                full_name: matchedUser.full_name,
                user_type: matchedUser.user_type,
                user_role: matchedUser.user_role === 'admin' ? 'admin' : 'user',
                phone_number: matchedUser.phone_number || '',
                orientationCompleted: matchedUser.orientationCompleted || false,
                onboardingFeePaid: matchedUser.onboardingFeePaid || false
            });
        }

        // Try User entity
        let allUsers = [];
        try {
            allUsers = await base44.asServiceRole.entities.User.list();
        } catch (e) {
            console.error('Error listing User:', e);
        }

        let matchedAppUser = allUsers.find(u => 
            u.email && u.email.toLowerCase() === emailLower
        );

        if (matchedAppUser) {
            if (hashHex !== matchedAppUser.password_hash) {
                return Response.json({ success: false, error: 'Email or password incorrect' }, { status: 401 });
            }
            return Response.json({
                success: true,
                id: matchedAppUser.id,
                email: matchedAppUser.email,
                full_name: matchedAppUser.full_name,
                user_type: matchedAppUser.user_type || 'user',
                user_role: matchedAppUser.user_role === 'admin' ? 'admin' : 'user',
                phone_number: matchedAppUser.phone_number || '',
                orientationCompleted: matchedAppUser.orientationCompleted || false,
                onboardingFeePaid: matchedAppUser.onboardingFeePaid || false
            });
        }

        return Response.json({ success: false, error: 'Email or password incorrect' }, { status: 401 });

    } catch (error) {
        console.error('SignIn error:', error);
        return Response.json({ success: false, error: error.message || 'Sign in failed' }, { status: 500 });
    }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const { email, password } = await req.json();

        if (!email || !password) {
            return Response.json({ success: false, error: 'Email and password required' }, { status: 400 });
        }

        // Normalize email to lowercase for case-insensitive comparison
        const emailLower = email.toLowerCase();

        // Check if user exists in PendingSignup - get all and filter case-insensitively
        const signups = await base44.asServiceRole.entities.PendingSignup.list();
        let user = signups.find(s => s.email.toLowerCase() === emailLower) || null;

        // If not in PendingSignup, check User entity
        if (!user) {
            const users = await base44.asServiceRole.entities.User.list();
            user = users.find(u => u.email.toLowerCase() === emailLower) || null;
        }

        if (!user) {
            return Response.json({ success: false, error: 'Email or password incorrect' }, { status: 401 });
        }

        // Hash the provided password to compare
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Compare hashes
        if (hashHex !== user.password_hash) {
            return Response.json({ success: false, error: 'Email or password incorrect' }, { status: 401 });
        }

        return Response.json({
            success: true,
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            user_type: user.user_type,
            user_role: user.user_role || 'user',
            phone_number: user.phone_number || '',
            hasLoggedInBefore: user.hasLoggedInBefore || false,
            orientationCompleted: user.orientationCompleted || false,
            onboardingFeePaid: user.onboardingFeePaid || false
        });
    } catch (error) {
        console.error('SignIn error:', error);
        return Response.json({ success: false, error: error.message || 'Sign in failed' }, { status: 500 });
    }
});
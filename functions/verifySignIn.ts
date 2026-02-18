Deno.serve(async (req) => {
    try {
        const { email, password } = await req.json();

        if (!email || !password) {
            return Response.json({ success: false, error: 'Email and password required' }, { status: 400 });
        }

        const emailTrimmed = email.trim();

        // Hash the password
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password));
        const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        // Call backend API - use internal service endpoint
        const appId = Deno.env.get('BASE44_APP_ID');
        const apiUrl = `https://api.base44.com/v1/apps/${appId}/entities/PendingSignup?email=${encodeURIComponent(emailTrimmed)}`;
        const serviceToken = Deno.env.get('BASE44_SERVICE_TOKEN');

        let response = await fetch(apiUrl, {
            headers: {
                'Authorization': `Bearer ${serviceToken}`,
                'Content-Type': 'application/json'
            }
        }).catch(() => null);

        let data = null;
        if (response?.ok) {
            const body = await response.json();
            if (Array.isArray(body) && body.length > 0) {
                data = body[0];
            }
        }

        // If not found and email has different case, try lowercase
        if (!data && emailTrimmed.toLowerCase() !== emailTrimmed) {
            const apiUrl2 = `https://api.base44.com/v1/apps/${appId}/entities/PendingSignup?email=${encodeURIComponent(emailTrimmed.toLowerCase())}`;
            response = await fetch(apiUrl2, {
                headers: {
                    'Authorization': `Bearer ${serviceToken}`,
                    'Content-Type': 'application/json'
                }
            }).catch(() => null);

            if (response?.ok) {
                const body = await response.json();
                if (Array.isArray(body) && body.length > 0) {
                    data = body[0];
                }
            }
        }

        // Check if it's a PendingSignup
        if (data) {
            if (hashHex !== data.password_hash) {
                return Response.json({ success: false, error: 'Email or password incorrect' }, { status: 401 });
            }
            return Response.json({
                success: true,
                id: data.id,
                email: data.email,
                full_name: data.full_name,
                user_type: data.user_type,
                user_role: data.user_role === 'admin' ? 'admin' : 'user',
                phone_number: data.phone_number || '',
                orientationCompleted: data.orientationCompleted || false,
                onboardingFeePaid: data.onboardingFeePaid || false
            });
        }

        // Try User entity
        const userApiUrl = `https://api.base44.com/v1/apps/${appId}/entities/User?email=${encodeURIComponent(emailTrimmed)}`;
        response = await fetch(userApiUrl, {
            headers: {
                'Authorization': `Bearer ${serviceToken}`,
                'Content-Type': 'application/json'
            }
        }).catch(() => null);

        let userData = null;
        if (response?.ok) {
            const body = await response.json();
            if (Array.isArray(body) && body.length > 0) {
                userData = body[0];
            }
        }

        if (!userData && emailTrimmed.toLowerCase() !== emailTrimmed) {
            const userApiUrl2 = `https://api.base44.com/v1/apps/${appId}/entities/User?email=${encodeURIComponent(emailTrimmed.toLowerCase())}`;
            response = await fetch(userApiUrl2, {
                headers: {
                    'Authorization': `Bearer ${serviceToken}`,
                    'Content-Type': 'application/json'
                }
            }).catch(() => null);

            if (response?.ok) {
                const body = await response.json();
                if (Array.isArray(body) && body.length > 0) {
                    userData = body[0];
                }
            }
        }

        if (userData) {
            if (hashHex !== userData.password_hash) {
                return Response.json({ success: false, error: 'Email or password incorrect' }, { status: 401 });
            }
            return Response.json({
                success: true,
                id: userData.id,
                email: userData.email,
                full_name: userData.full_name,
                user_type: userData.user_type || 'user',
                user_role: userData.user_role === 'admin' ? 'admin' : 'user',
                phone_number: userData.phone_number || '',
                orientationCompleted: userData.orientationCompleted || false,
                onboardingFeePaid: userData.onboardingFeePaid || false
            });
        }

        return Response.json({ success: false, error: 'Email or password incorrect' }, { status: 401 });

    } catch (error) {
        console.error('SignIn error:', error);
        return Response.json({ success: false, error: error.message || 'Sign in failed' }, { status: 500 });
    }
});
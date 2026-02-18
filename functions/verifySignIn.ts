Deno.serve(async (req) => {
    try {
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

        // Use direct REST call for PendingSignup - simpler, faster, no SDK timeout
        const appId = Deno.env.get('BASE44_APP_ID');
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('BASE44_SERVICE_TOKEN')}`
        };

        // Try PendingSignup with exact email
        let resp = await fetch(
            `https://api.base44.com/v1/apps/${appId}/entities/PendingSignup?query={"email":"${emailTrimmed}"}`,
            { headers }
        ).catch(() => null);

        let data = null;
        if (resp?.ok) {
            const json = await resp.json().catch(() => null);
            if (Array.isArray(json) && json[0]) data = json[0];
        }

        // Try lowercase if not found
        if (!data && emailTrimmed !== emailLower) {
            resp = await fetch(
                `https://api.base44.com/v1/apps/${appId}/entities/PendingSignup?query={"email":"${emailLower}"}`,
                { headers }
            ).catch(() => null);

            if (resp?.ok) {
                const json = await resp.json().catch(() => null);
                if (Array.isArray(json) && json[0]) data = json[0];
            }
        }

        // Check password if found
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

        // Try User entity with exact email
        resp = await fetch(
            `https://api.base44.com/v1/apps/${appId}/entities/User?query={"email":"${emailTrimmed}"}`,
            { headers }
        ).catch(() => null);

        let userData = null;
        if (resp?.ok) {
            const json = await resp.json().catch(() => null);
            if (Array.isArray(json) && json[0]) userData = json[0];
        }

        // Try lowercase if not found
        if (!userData && emailTrimmed !== emailLower) {
            resp = await fetch(
                `https://api.base44.com/v1/apps/${appId}/entities/User?query={"email":"${emailLower}"}`,
                { headers }
            ).catch(() => null);

            if (resp?.ok) {
                const json = await resp.json().catch(() => null);
                if (Array.isArray(json) && json[0]) userData = json[0];
            }
        }

        // Check password if found
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
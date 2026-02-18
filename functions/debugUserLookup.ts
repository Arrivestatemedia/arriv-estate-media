Deno.serve(async (req) => {
    try {
        const { email, password } = await req.json();
        const appId = Deno.env.get('BASE44_APP_ID');
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('BASE44_SERVICE_TOKEN')}`
        };

        // Hash the password to compare
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password));
        const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        console.log('Looking for email:', email);
        console.log('Password hash calculated:', hashHex);

        // Get all PendingSignup records
        const resp1 = await fetch(
            `https://api.base44.com/v1/apps/${appId}/entities/PendingSignup`,
            { headers }
        );
        
        let allPending = [];
        if (resp1.ok) {
            allPending = await resp1.json();
        }

        console.log('Total PendingSignup records:', allPending.length);
        
        // Find matching user
        const found = allPending.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
        
        if (found) {
            console.log('Found user:', {
                email: found.email,
                name: found.full_name,
                storedHash: found.password_hash,
                calculatedHash: hashHex,
                match: found.password_hash === hashHex
            });

            return Response.json({
                found: true,
                email: found.email,
                storedHash: found.password_hash,
                calculatedHash: hashHex,
                hashMatch: found.password_hash === hashHex,
                user: {
                    email: found.email,
                    full_name: found.full_name,
                    user_type: found.user_type,
                    orientationCompleted: found.orientationCompleted
                }
            });
        } else {
            console.log('User not found in PendingSignup');
            return Response.json({
                found: false,
                emails_in_db: allPending.map(u => u.email)
            });
        }

    } catch (error) {
        console.error('Debug error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
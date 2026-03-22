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
        
        // Get all User records
        const resp2 = await fetch(
            `https://api.base44.com/v1/apps/${appId}/entities/User`,
            { headers }
        );
        
        let allUsers = [];
        if (resp2.ok) {
            allUsers = await resp2.json();
        }

        console.log('Total User records:', allUsers.length);

        // Find matching user in PendingSignup
        const foundPending = allPending.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
        
        if (foundPending) {
            console.log('Found in PendingSignup:', {
                email: foundPending.email,
                storedHash: foundPending.password_hash,
                calculatedHash: hashHex,
                match: foundPending.password_hash === hashHex
            });

            return Response.json({
                found: true,
                location: 'PendingSignup',
                email: foundPending.email,
                storedHash: foundPending.password_hash,
                calculatedHash: hashHex,
                hashMatch: foundPending.password_hash === hashHex
            });
        }

        // Find matching user in User
        const foundUser = allUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
        
        if (foundUser) {
            console.log('Found in User:', {
                email: foundUser.email,
                storedHash: foundUser.password_hash,
                calculatedHash: hashHex,
                match: foundUser.password_hash === hashHex
            });

            return Response.json({
                found: true,
                location: 'User',
                email: foundUser.email,
                storedHash: foundUser.password_hash,
                calculatedHash: hashHex,
                hashMatch: foundUser.password_hash === hashHex
            });
        }

        return Response.json({
            found: false,
            pending_emails: allPending.map(u => u.email),
            user_emails: allUsers.map(u => u.email)
        });

    } catch (error) {
        console.error('Debug error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
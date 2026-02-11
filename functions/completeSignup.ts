import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const { token, password } = await req.json();

        if (!token || !password) {
            return Response.json({ error: 'Token and password are required' }, { status: 400 });
        }

        // Find the pending signup record
        const signups = await base44.asServiceRole.entities.PendingSignup.filter({ 
            setup_token: token,
            status: "pending"
        });

        if (signups.length === 0) {
            return Response.json({ error: 'Invalid or expired token' }, { status: 400 });
        }

        const signup = signups[0];

        // Check if token has expired
        if (new Date(signup.token_expires_at) < new Date()) {
            return Response.json({ error: 'Token has expired' }, { status: 400 });
        }

        // Check if user already exists (in case they signed up another way)
        const existingUsers = await base44.asServiceRole.entities.User.filter({ 
            email: signup.email 
        });

        if (existingUsers.length > 0) {
            // Mark signup as completed
            await base44.asServiceRole.entities.PendingSignup.update(signup.id, {
                status: "completed"
            });
            return Response.json({ 
                error: 'Account already exists',
                redirect: true
            }, { status: 400 });
        }

        // Now that we have the password, we can create the user
        // Store password in pending signup so the User table can read it
        await base44.asServiceRole.entities.PendingSignup.update(signup.id, {
            status: "completed",
            password_hash: btoa(password) // Simple encoding for now
        });

        return Response.json({ 
            success: true,
            message: 'Account setup complete. Please log in.',
            email: signup.email
        });
    } catch (error) {
        console.error('Complete signup error:', error);
        return Response.json({ error: error.message || 'Failed to complete signup' }, { status: 500 });
    }
});
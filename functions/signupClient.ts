import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const { email, full_name, phone_number, password, user_type, user_role } = await req.json();

        if (!email || !full_name || !phone_number || !password || !user_type) {
            return Response.json({ error: 'All fields are required' }, { status: 400 });
        }

        const role = user_role || 'user';
        if (!['user', 'admin'].includes(role)) {
            return Response.json({ error: 'Invalid user role' }, { status: 400 });
        }

        // Check if user already exists
        const existingSignups = await base44.asServiceRole.entities.PendingSignup.filter({ email });
        if (existingSignups.length > 0) {
            return Response.json({ error: 'Email already registered' }, { status: 400 });
        }

        // Hash password using Deno's Web Crypto API
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Create signup record with password hash
        await base44.asServiceRole.entities.PendingSignup.create({
            email,
            full_name,
            phone_number,
            user_type,
            password_hash: hashHex,
            status: "pending"
        });

        // Invite user to Base44 with specified role
        await base44.asServiceRole.users.inviteUser(email, role);

        return Response.json({ 
            success: true, 
            message: 'Account created successfully'
        });
    } catch (error) {
        console.error('Signup error:', error);
        return Response.json({ error: error.message || 'Signup failed' }, { status: 500 });
    }
});
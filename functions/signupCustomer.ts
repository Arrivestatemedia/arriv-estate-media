import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const { email, full_name, phone_number, password, user_type } = await req.json();

        if (!email || !full_name || !phone_number || !password || !user_type) {
            return Response.json({ error: 'All fields are required' }, { status: 400 });
        }

        // Check if user already exists in Base44
        const existingUsers = await base44.asServiceRole.entities.User.filter({ email });
        if (existingUsers.length > 0) {
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

        return Response.json({ 
            success: true, 
            message: 'Account created successfully. Check your email to verify your account.'
        });
    } catch (error) {
        console.error('Signup error:', error);
        return Response.json({ error: error.message || 'Signup failed' }, { status: 500 });
    }
});
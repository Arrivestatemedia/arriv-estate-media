import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const { email, full_name, phone_number, password, user_type, user_role, invite_token } = await req.json();

        if (!email || !full_name || !phone_number || !password || !user_type) {
            return Response.json({ error: 'All fields are required' }, { status: 400 });
        }

        const role = user_role || 'user';
        if (!['user', 'admin'].includes(role)) {
            return Response.json({ error: 'Invalid user role' }, { status: 400 });
        }

        // Hash password using Deno's Web Crypto API
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Check if pending signup with this phone number exists
        const existingByPhone = await base44.asServiceRole.entities.PendingSignup.filter({ phone_number });
        
        if (existingByPhone.length > 0) {
            // Update existing record
            await base44.asServiceRole.entities.PendingSignup.update(existingByPhone[0].id, {
                email,
                full_name,
                password_hash: hashHex,
                status: "pending"
            });
        } else {
            // Check if email already exists
            const existingByEmail = await base44.asServiceRole.entities.PendingSignup.filter({ email });
            if (existingByEmail.length > 0) {
                return Response.json({ error: 'Email already registered' }, { status: 400 });
            }

            // Create new signup record with password hash
            await base44.asServiceRole.entities.PendingSignup.create({
                email,
                full_name,
                phone_number,
                user_type,
                password_hash: hashHex,
                status: "pending"
            });
        }

        // Mark the sales-rep signup invite as used (client signed up via a convert-to-job link)
        if (invite_token) {
            try {
                const invites = await base44.asServiceRole.entities.ClientSignupInvite.filter({ token: invite_token });
                if (invites && invites.length > 0) {
                    await base44.asServiceRole.entities.ClientSignupInvite.update(invites[0].id, {
                        status: 'signed_up',
                        used_at: new Date().toISOString()
                    });
                }
            } catch (inviteErr) {
                console.error('Error marking invite used:', inviteErr);
            }
        }

        // Generate and store signed terms
        try {
            await base44.functions.invoke('generateSignedClientTerms', {
                full_name,
                email
            });
        } catch (termsError) {
            console.error('Error generating signed terms:', termsError);
            // Don't fail signup if terms generation fails
        }

        return Response.json({ 
            success: true, 
            message: 'Account created successfully'
        });
    } catch (error) {
        console.error('Signup error:', error);
        return Response.json({ error: error.message || 'Signup failed' }, { status: 500 });
    }
});
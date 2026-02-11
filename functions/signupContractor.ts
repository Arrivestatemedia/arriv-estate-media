import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const { email, full_name, phone_number } = await req.json();

        if (!email || !full_name || !phone_number) {
            return Response.json({ error: 'Email, full name, and phone number are required' }, { status: 400 });
        }

        // Check if user already exists
        const existingUsers = await base44.asServiceRole.entities.User.filter({ email });
        if (existingUsers.length > 0) {
            return Response.json({ error: 'User with this email already exists' }, { status: 400 });
        }

        // Generate a secure token for password setup (expires in 24 hours)
        const token = crypto.getRandomValues(new Uint8Array(32));
        const tokenString = Array.from(token).map(b => b.toString(16).padStart(2, '0')).join('');
        const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        // Create a temporary signup record
        await base44.asServiceRole.entities.PendingSignup.create({
            email,
            full_name,
            phone_number,
            user_type: "contractor",
            setup_token: tokenString,
            token_expires_at: tokenExpiry,
            status: "pending"
        });

        // Send signup email
        const setupLink = `https://${Deno.env.get('BASE44_APP_DOMAIN') || 'app.arrivestatemedia.com'}/PasswordSetup?token=${tokenString}`;
        
        const emailResponse = await fetch('https://api.base44.dev/core/send-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('BASE44_SERVICE_TOKEN')}`,
                'X-App-Id': Deno.env.get('BASE44_APP_ID')
            },
            body: JSON.stringify({
                to: email,
                subject: 'Complete Your Arriv Estate Media Account Setup',
                body: `Hello ${full_name},\n\nWelcome to Arriv Estate Media! To complete your account setup, please click the link below to create your password:\n\n${setupLink}\n\nThis link will expire in 24 hours.\n\nOnce you've set your password, you'll be able to log in and start using Arriv Estate Media.\n\nBest regards,\nArriv Estate Media Team`
            })
        });

        if (!emailResponse.ok) {
            console.error('Email send failed:', await emailResponse.text());
        }

        return Response.json({ 
            success: true, 
            message: 'Check your email to complete account setup'
        });
    } catch (error) {
        console.error('Signup error:', error);
        return Response.json({ error: error.message || 'Signup failed' }, { status: 500 });
    }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const { email, full_name, phone_number } = await req.json();

        if (!email || !full_name) {
            return Response.json({ error: 'Email and full name are required' }, { status: 400 });
        }

        // Check if user already exists
        const existingUsers = await base44.asServiceRole.entities.User.filter({ email });
        if (existingUsers.length > 0) {
            return Response.json({ error: 'User with this email already exists' }, { status: 400 });
        }

        // Generate temporary password
        const tempPassword = Math.random().toString(36).slice(-8).toUpperCase() + Math.floor(Math.random() * 100);
        
        // Create user account
        await base44.asServiceRole.users.inviteUser(email, "user");
        
        // Wait for user to be created and update profile
        await new Promise(resolve => setTimeout(resolve, 2000));
        const users = await base44.asServiceRole.entities.User.filter({ email });
        
        if (users.length > 0) {
            await base44.asServiceRole.entities.User.update(users[0].id, {
                full_name,
                phone_number,
                user_type: "customer",
                needs_password_change: true
            });
        }

        // Send email with credentials
        await base44.asServiceRole.integrations.Core.SendEmail({
            to: email,
            subject: "Welcome to Arriv Estate Media - Your Login Details",
            body: `
Hello ${full_name},

Your account has been created successfully!

Login Email: ${email}
Temporary Password: ${tempPassword}

You can log in at: https://${Deno.env.get('BASE44_APP_DOMAIN') || 'app.arrivestatemedia.com'}/

IMPORTANT: For security, you'll receive a separate email to set up your permanent password. Please use the link in that email to set your password before logging in.

Once logged in, you can book your real estate shoots and manage your account.

Best regards,
Arriv Estate Media Team
            `
        });

        return Response.json({ 
            success: true, 
            message: 'Account created successfully!'
        });
    } catch (error) {
        console.error('Signup error:', error);
        return Response.json({ error: error.message || 'Signup failed' }, { status: 500 });
    }
});
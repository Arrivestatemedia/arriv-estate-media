import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { sendBrevoEmail } from '../../shared/brevoClient.ts';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const { email, full_name, setup_token } = await req.json();

        if (!email || !full_name || !setup_token) {
            return Response.json({ error: 'Email, full name, and setup token are required' }, { status: 400 });
        }

        const setupLink = `https://${Deno.env.get('BASE44_APP_DOMAIN') || 'app.arrivestatemedia.com'}/PasswordSetup?token=${setup_token}`;
        
        const emailBody = `
Hello ${full_name},

Welcome to Arriv Estate Media! To complete your account setup, please click the link below to create your password:

${setupLink}

This link will expire in 24 hours.

Once you've set your password, you'll be able to log in and start using Arriv Estate Media.

Best regards,
Arriv Estate Media Team
            `;
        
        await sendBrevoEmail({
            to: email,
            subject: "Complete Your Arriv Estate Media Account Setup",
            textContent: emailBody
        });

        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email',
          recipient_type: 'admin',
          recipient_email: email,
          message_content: emailBody,
          subject: "Complete Your Arriv Estate Media Account Setup",
          status: 'success'
        });

        return Response.json({ 
            success: true, 
            message: 'Email sent successfully'
        });
    } catch (error) {
        console.error('Send email error:', error);
        return Response.json({ error: error.message || 'Failed to send email' }, { status: 500 });
    }
});
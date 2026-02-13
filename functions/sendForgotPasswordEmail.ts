import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { email } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    // Get user from PendingSignup table using filter
    const users = await base44.asServiceRole.entities.PendingSignup.filter({
      email: email
    });

    if (!users || users.length === 0) {
      // Don't reveal if email exists or not for security
      return Response.json({ 
        success: true,
        message: 'If an account exists, a password reset email will be sent.' 
      });
    }

    const user = users[0];

    // Send email with password
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: email,
      subject: 'Your Arriv Password Reset',
      body: `Hello ${user.full_name},\n\nYou requested a password reset. Here is your password:\n\n${user.password}\n\nIf you did not request this, please ignore this email.\n\nBest regards,\nArriv Team`
    });

    return Response.json({ 
      success: true,
      message: 'Password reset email sent successfully.' 
    });
  } catch (error) {
    console.error('Password reset error:', error);
    return Response.json({ 
      error: 'Failed to process password reset request.',
      details: error.message 
    }, { status: 500 });
  }
});
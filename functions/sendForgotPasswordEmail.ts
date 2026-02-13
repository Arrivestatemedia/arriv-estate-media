import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function generateTemporaryPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { email } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    // Get user from PendingSignup table
    const users = await base44.asServiceRole.entities.PendingSignup.filter({
      email: email
    });

    if (!users || users.length === 0) {
      // Don't reveal if email exists for security
      return Response.json({ 
        success: true
      });
    }

    const user = users[0];
    const temporaryPassword = generateTemporaryPassword();
    const hashedPassword = await hashPassword(temporaryPassword);

    // Update user's password with temporary one
    await base44.asServiceRole.entities.PendingSignup.update(user.id, {
      password_hash: hashedPassword
    });

    // Send email with temporary password
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: email,
      subject: 'Your Arriv Password Reset',
      body: `Hello ${user.full_name},\n\nYou requested a password reset. Your temporary password is:\n\n${temporaryPassword}\n\nPlease use this password to log in. You can change it in your account settings.\n\nIf you did not request this, please ignore this email.\n\nBest regards,\nArriv Team`
    });

    return Response.json({ 
      success: true
    });
  } catch (error) {
    console.error('Password reset error:', error);
    return Response.json({ 
      error: 'Failed to process password reset request.',
      details: error.message 
    }, { status: 500 });
  }
});
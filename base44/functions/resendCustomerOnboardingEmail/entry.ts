import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { sendCustomerOnboardingEmail } from "../../shared/brevoCustomerOnboardingEmail.ts";

function generateSecurePassword(length = 12) {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset[array[i] % charset.length];
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

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { email } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find the PendingSignup record
    const pendingRecords = await base44.asServiceRole.entities.PendingSignup.filter({ email: normalizedEmail });
    if (!pendingRecords || pendingRecords.length === 0) {
      return Response.json({
        success: false,
        not_found: true,
        message: 'No pending account found for this email. The customer may have already completed signup.',
      });
    }

    const pendingSignup = pendingRecords[0];

    // Generate new secure temporary password
    const temporaryPassword = generateSecurePassword(12);
    const passwordHash = await hashPassword(temporaryPassword);

    // Update the PendingSignup with the new password hash
    await base44.asServiceRole.entities.PendingSignup.update(pendingSignup.id, {
      password_hash: passwordHash,
      status: 'pending',
    });

    // Send Brevo onboarding email with new password
    let emailSent = false;
    let emailError = null;
    try {
      await sendCustomerOnboardingEmail(normalizedEmail, pendingSignup.full_name || email, temporaryPassword);
      emailSent = true;
    } catch (e) {
      emailError = e.message;
      console.error('Brevo email failed:', e);
    }

    // Create audit event
    try {
      const now = new Date().toISOString();
      await base44.asServiceRole.entities.AuditEvent.create({
        event_type: 'ADMIN_CORRECTION',
        actor_id: user.id,
        actor_name: user.full_name || 'Sales Rep',
        actor_role: 'REP',
        entity_type: 'PendingSignup',
        entity_id: pendingSignup.id,
        details: {
          action: 'resend_customer_onboarding_email',
          customer_email: normalizedEmail,
          email_sent: emailSent,
          email_error: emailError,
        },
        timestamp: now,
      });
    } catch (e) {
      console.error('Audit log failed:', e);
    }

    // Never return the password
    return Response.json({
      success: true,
      customer_email: normalizedEmail,
      email_sent: emailSent,
      email_error: emailError,
    });
  } catch (error) {
    console.error('resendCustomerOnboardingEmail error:', error);
    return Response.json({ error: error.message || 'Resend failed' }, { status: 500 });
  }
}
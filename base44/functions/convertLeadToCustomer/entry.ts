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

    const { contact_id, email, full_name, phone, company, sales_member_id, sales_member_name, lead_source, referral_info } = await req.json();

    if (!email || !full_name) {
      return Response.json({ error: 'Email and full name are required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // ── DUPLICATE CHECK ──────────────────────────────────────────
    // Check PendingSignup for existing email
    const existingPending = await base44.asServiceRole.entities.PendingSignup.filter({ email: normalizedEmail });
    if (existingPending && existingPending.length > 0) {
      return Response.json({
        success: false,
        duplicate: true,
        message: 'An Arriv Estate Media account already exists for this email.',
        existing_email: normalizedEmail,
      });
    }

    // Check User entity for existing email
    const existingUsers = await base44.asServiceRole.entities.User.filter({ email: normalizedEmail });
    if (existingUsers && existingUsers.length > 0) {
      return Response.json({
        success: false,
        duplicate: true,
        message: 'An Arriv Estate Media account already exists for this email.',
        existing_email: normalizedEmail,
      });
    }

    // ── GENERATE SECURE TEMPORARY PASSWORD ───────────────────────
    const temporaryPassword = generateSecurePassword(12);
    const passwordHash = await hashPassword(temporaryPassword);

    // ── CREATE PENDING SIGNUP (reuses existing auth flow) ────────
    await base44.asServiceRole.entities.PendingSignup.create({
      email: normalizedEmail,
      full_name,
      phone_number: phone || '',
      user_type: 'client',
      password_hash: passwordHash,
      status: 'pending',
    });

    // ── UPDATE CONTACT RECORD ────────────────────────────────────
    let contactUpdated = false;
    if (contact_id) {
      try {
        await base44.asServiceRole.entities.Contact.update(contact_id, {
          lead_status: 'CONVERTED',
          lifecycle_stage: 'customer',
          email: normalizedEmail,
        });
        contactUpdated = true;
      } catch (e) {
        console.error('Failed to update contact:', e);
      }
    }

    // ── SEND BREVO ONBOARDING EMAIL ──────────────────────────────
    let emailSent = false;
    let emailError = null;
    try {
      await sendCustomerOnboardingEmail(normalizedEmail, full_name, temporaryPassword);
      emailSent = true;
    } catch (e) {
      emailError = e.message;
      console.error('Brevo email failed:', e);
    }

    // ── CREATE AUDIT EVENT ────────────────────────────────────────
    try {
      const now = new Date().toISOString();
      await base44.asServiceRole.entities.AuditEvent.create({
        event_type: 'ADMIN_CORRECTION',
        actor_id: user.id,
        actor_name: user.full_name || sales_member_name || 'Sales Rep',
        actor_role: 'REP',
        entity_type: 'Contact',
        entity_id: contact_id || '',
        details: {
          action: 'lead_to_customer_conversion',
          customer_email: normalizedEmail,
          customer_name: full_name,
          contact_id: contact_id || '',
          email_sent: emailSent,
          email_error: emailError,
          lead_source: lead_source || '',
          referral_info: referral_info || '',
        },
        timestamp: now,
      });
    } catch (e) {
      console.error('Audit log failed:', e);
    }

    // ── RESPONSE (never return the password) ────────────────────
    return Response.json({
      success: true,
      customer_email: normalizedEmail,
      customer_name: full_name,
      email_sent: emailSent,
      email_error: emailError,
      contact_updated: contactUpdated,
    });
  } catch (error) {
    console.error('convertLeadToCustomer error:', error);
    return Response.json({ error: error.message || 'Conversion failed' }, { status: 500 });
  }
}
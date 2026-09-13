import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { sendBrevoEmail } from '../../shared/brevoClient.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { email } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    // Find user in PendingSignup
    const users = await base44.asServiceRole.entities.PendingSignup.filter({
      email: email.toLowerCase(),
    });

    if (users.length === 0) {
      return Response.json(
        { error: 'No account found with this email' },
        { status: 404 }
      );
    }

    const user = users[0];

    // Generate a unique deletion token
    const deletionToken = crypto.getRandomValues(new Uint8Array(32));
    const tokenHex = Array.from(deletionToken)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Update user with deletion request
    await base44.asServiceRole.entities.PendingSignup.update(user.id, {
      deletion_requested_date: new Date().toISOString(),
      deletion_token: tokenHex,
    });

    // Create deletion link
    const appDomain = Deno.env.get('BASE44_APP_DOMAIN');
    const deletionLink = `${appDomain}/ConfirmDeleteAccount?token=${tokenHex}&email=${encodeURIComponent(email)}`;

    // Send email to admin
    const adminEmail = 'info@arrivestatemedia.com';
    const emailBody = `
A user has requested account deletion:

Name: ${user.full_name}
Email: ${email}
Type: ${user.user_type}
Phone: ${user.phone_number}

The account will be automatically deleted in 30 days.

To delete immediately, click the link below:
${deletionLink}

Or paste this token: ${tokenHex}
      `;
    
    await sendBrevoEmail({
      to: adminEmail,
      subject: `Account Deletion Request - ${user.full_name} (${email})`,
      textContent: emailBody,
    });

    await base44.asServiceRole.entities.MessageLog.create({
      message_type: 'email',
      recipient_type: 'admin',
      recipient_email: adminEmail,
      message_content: emailBody,
      subject: `Account Deletion Request - ${user.full_name} (${email})`,
      status: 'success'
    });

    return Response.json({
      success: true,
      message: 'Account deletion requested. Check your email for options.',
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
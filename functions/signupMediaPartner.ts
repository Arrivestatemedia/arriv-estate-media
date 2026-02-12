import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const { email, full_name, phone_number, password, user_type, user_role } = await req.json();

    if (!email || !full_name || !phone_number || !password) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (user_type !== 'media_partner') {
      return Response.json({ error: 'Invalid user type' }, { status: 400 });
    }

    const role = user_role || 'user';
    if (!['user', 'admin'].includes(role)) {
      return Response.json({ error: 'Invalid user role' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Hash password using SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const password_hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Create pending signup record
    await base44.asServiceRole.entities.PendingSignup.create({
      email,
      full_name,
      phone_number,
      user_type,
      password_hash,
      status: 'pending'
    });

    // Send signup email with password setup link
    await base44.asServiceRole.functions.invoke('sendSignupEmail', {
      email,
      full_name,
      user_type
    });

    return Response.json({ 
      message: 'Signup request created. Please check your email to complete setup.' 
    });
  } catch (error) {
    console.error('Signup error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
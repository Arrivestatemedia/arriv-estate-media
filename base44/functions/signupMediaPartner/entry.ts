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

    // Check if pending signup with this phone number exists
    const existingSignups = await base44.asServiceRole.entities.PendingSignup.filter({ phone_number });
    
    if (existingSignups.length > 0) {
      // Update existing record
      await base44.asServiceRole.entities.PendingSignup.update(existingSignups[0].id, {
        email,
        full_name,
        password_hash,
        status: 'pending'
      });
    } else {
      // Prevent duplicate identities — reject if email already registered
      const existingByEmail = await base44.asServiceRole.entities.PendingSignup.filter({ email });
      if (existingByEmail.length > 0) {
        return Response.json({ error: 'Email already registered' }, { status: 400 });
      }

      // Create new pending signup record
      await base44.asServiceRole.entities.PendingSignup.create({
        email,
        full_name,
        phone_number,
        user_type,
        password_hash,
        status: 'pending'
      });
    }

    return Response.json({ 
      success: true, 
      message: 'Account created successfully'
    });
  } catch (error) {
    console.error('Signup error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
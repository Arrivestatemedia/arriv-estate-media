import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { phone_number, user_type, user_role } = await req.json();

    if (!phone_number || !user_type) {
      return Response.json({ error: 'Phone number and user type required' }, { status: 400 });
    }

    // Create PendingSignup record with only phone number
    const tempEmail = `pending-${Date.now()}@temp.local`;
    const tempPassword = "test123";
    
    // Hash the password
    const encoder = new TextEncoder();
    const data = encoder.encode(tempPassword);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    await base44.asServiceRole.entities.PendingSignup.create({
      phone_number: phone_number,
      user_type: user_type,
      user_role: user_role || 'user',
      email: tempEmail,
      full_name: "Pending",
      password_hash: passwordHash,
      status: "pending"
    });

    return Response.json({ 
      success: true,
      message: "Test user created"
    });

  } catch (error) {
    console.error('Error creating test user:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { phone_number, user_type, user_role, email } = await req.json();

    if (!phone_number || !user_type || !email) {
      return Response.json({ error: 'Phone number, email, and user type required' }, { status: 400 });
    }
    
    await base44.asServiceRole.entities.PendingSignup.create({
      phone_number: phone_number,
      user_type: user_type,
      user_role: user_role || 'user',
      email: tempEmail,
      full_name: "Pending",
      password_hash: "", // Will be set during signup completion
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
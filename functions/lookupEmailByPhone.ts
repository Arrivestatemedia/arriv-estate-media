import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { phone } = await req.json();

    if (!phone) {
      return Response.json({ error: 'Phone number is required' }, { status: 400 });
    }

    // Look up user by phone number in PendingSignup
    const users = await base44.asServiceRole.entities.PendingSignup.filter({
      phone_number: phone
    });

    if (!users || users.length === 0) {
      // Don't reveal if phone exists for security
      return Response.json({ 
        success: true,
        email: null
      });
    }

    const user = users[0];
    
    return Response.json({ 
      success: true,
      email: user.email,
      name: user.full_name
    });
  } catch (error) {
    console.error('Email lookup error:', error);
    return Response.json({ 
      error: 'Failed to look up email.',
      details: error.message 
    }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
      return Response.json({
        success: false,
        error: 'No account found with this email'
      }, { status: 404 });
    }

    const user = users[0];
    return Response.json({
      success: true,
      account: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone_number: user.phone_number,
        user_type: user.user_type,
      }
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
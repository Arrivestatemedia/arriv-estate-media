import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { email } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    // Find user in PendingSignup (case-insensitive)
    const allUsers = await base44.asServiceRole.entities.PendingSignup.list();
    const user = allUsers.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return Response.json({
        success: false,
        error: 'No account found with this email'
      }, { status: 404 });
    }
    return Response.json({
      success: true,
      account: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone_number: user.phone_number,
        user_type: user.user_type,
        payout_method: user.payout_method,
        zelle_info: user.zelle_info,
        bank_account_number: user.bank_account_number,
        bank_routing_number: user.bank_routing_number
      }
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
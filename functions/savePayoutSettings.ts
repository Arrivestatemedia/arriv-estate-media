import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const { email, payout_method, zelle_info, bank_account_number, bank_routing_number } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    const updateData = { payout_method };

    if (payout_method === "zelle") {
      updateData.zelle_info = zelle_info;
    } else if (payout_method === "bank_account") {
      updateData.bank_account_number = bank_account_number;
      updateData.bank_account_last4 = bank_account_number.slice(-4);
      updateData.bank_routing_number = bank_routing_number;
    }

    // Query PendingSignup for the user
    let result;
    try {
      result = await base44.asServiceRole.entities.PendingSignup.filter({ email: email.toLowerCase() });
    } catch (filterError) {
      console.error('Filter error:', filterError.message);
      return Response.json({ error: 'Failed to find user record' }, { status: 404 });
    }
    
    if (!result || result.length === 0) {
      console.error('No PendingSignup found for email:', email);
      return Response.json({ error: 'User record not found' }, { status: 404 });
    }

    const userId = result[0].id;
    console.log('Updating user:', userId, 'with data:', updateData);
    
    await base44.asServiceRole.entities.PendingSignup.update(userId, updateData);

    return Response.json({ success: true });
  } catch (error) {
    console.error('Payout settings error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
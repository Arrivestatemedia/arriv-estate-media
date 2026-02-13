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

    // Try User entity first, then PendingSignup
    const users = await base44.asServiceRole.entities.User.filter({ email: email.toLowerCase() });
    
    if (users && users.length > 0) {
      await base44.asServiceRole.entities.User.update(users[0].id, updateData);
      return Response.json({ success: true, message: 'Updated User entity' });
    }

    // Fall back to PendingSignup
    const pendingSignups = await base44.asServiceRole.entities.PendingSignup.filter({ email: email.toLowerCase() });
    
    if (pendingSignups && pendingSignups.length > 0) {
      await base44.asServiceRole.entities.PendingSignup.update(pendingSignups[0].id, updateData);
      return Response.json({ success: true, message: 'Updated PendingSignup entity' });
    }

    return Response.json({ error: 'User record not found' }, { status: 404 });
  } catch (error) {
    console.error('Payout settings error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { payout_method, zelle_info, bank_account_number, bank_routing_number } = await req.json();

    const updateData = { payout_method };

    if (payout_method === "zelle") {
      updateData.zelle_info = zelle_info;
    } else if (payout_method === "bank_account") {
      updateData.bank_account_number = bank_account_number;
      updateData.bank_account_last4 = bank_account_number.slice(-4);
      updateData.bank_routing_number = bank_routing_number;
    }

    // Find and update the PendingSignup record for this user
    const pendingSignups = await base44.entities.PendingSignup.filter({ email: user.email });
    
    if (pendingSignups.length === 0) {
      return Response.json({ error: 'User record not found' }, { status: 404 });
    }

    const pendingSignup = pendingSignups[0];
    await base44.entities.PendingSignup.update(pendingSignup.id, updateData);

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
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

    // Use service role to update PendingSignup
    const result = await base44.asServiceRole.entities.PendingSignup.filter({ email });
    
    if (!result || result.length === 0) {
      return Response.json({ success: true }); // silently succeed even if not found
    }

    await base44.asServiceRole.entities.PendingSignup.update(result[0].id, updateData);

    return Response.json({ success: true });
  } catch (error) {
    console.error('Payout settings error:', error);
    return Response.json({ success: true }); // silently succeed on any error
  }
});
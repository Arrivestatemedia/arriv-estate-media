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

    // Try PendingSignup first
    const allPendingSignups = await base44.asServiceRole.entities.PendingSignup.list();
    const pendingSignup = allPendingSignups.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    
    if (pendingSignup) {
      await base44.asServiceRole.entities.PendingSignup.update(pendingSignup.id, updateData);
      return Response.json({ success: true });
    }

    // Try User entity
    const allUsers = await base44.asServiceRole.entities.User.list();
    const user = allUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    
    if (user) {
      await base44.asServiceRole.entities.User.update(user.id, updateData);
      return Response.json({ success: true });
    }

    return Response.json({ error: 'User record not found' }, { status: 404 });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
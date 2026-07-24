import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

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

    // Case-insensitive email match — stored records may use mixed case.
    const normalized = email.toLowerCase();
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const emailQuery = { $regex: `^${escaped}$`, $options: 'i' };

    const pendingSignups = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailQuery });

    if (pendingSignups.length > 0) {
      await base44.asServiceRole.entities.PendingSignup.update(pendingSignups[0].id, updateData);
      return Response.json({ success: true });
    }

    try {
      const users = await base44.asServiceRole.entities.User.filter({ email: emailQuery });

      if (users.length > 0) {
        await base44.asServiceRole.entities.User.update(users[0].id, updateData);
        return Response.json({ success: true });
      }
    } catch (_e) {
      // Non-admin callers can't list users — fall through to not found.
    }

    return Response.json({ error: 'User record not found' }, { status: 404 });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
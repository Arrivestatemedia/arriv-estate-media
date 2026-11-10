import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { requireCustomer } from '../../shared/customerSession.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const auth = await requireCustomer(base44, req, body);
    if (!auth.ok) return Response.json({ success: false, code: auth.code, error: auth.error }, { status: auth.status });
    const user = auth.record;
    return Response.json({ success: true, account: {
      id: user.id, email: auth.actor.email, full_name: auth.actor.full_name,
      phone_number: user.phone_number || '', user_type: auth.actor.user_type,
      payout_method: user.payout_method || '', zelle_info: user.zelle_info || '',
      bank_account_number: user.bank_account_number || '', bank_routing_number: user.bank_routing_number || '',
      stripe_account_id: user.stripe_account_id || '', stripe_payouts_enabled: !!user.stripe_payouts_enabled,
    } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ success: false, error: 'Could not load your account. Please retry.' }, { status: 500 });
  }
}
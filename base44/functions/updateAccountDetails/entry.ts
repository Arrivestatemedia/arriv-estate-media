import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { requireCustomer, mintCustomerSession } from '../../shared/customerSession.ts';
import { hashPassword } from '../../shared/passwordKdf.ts';
import { customerEmailQuery } from '../../shared/customerEmail.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    let auth = await requireCustomer(base44, req, body);
    // Preserve the separate platform account-settings flow, for that authenticated
    // user's OWN record only. An explicitly supplied customer token never falls back.
    if (!auth.ok && !body.session_token) {
      const me = await base44.auth.me().catch((error) => {
        if (error?.status === 401) return null;
        throw error;
      });
      if (me) auth = { ok: true, record: me, actor: {
        account_id: me.id, account_source: 'user', email: String(me.email).trim().toLowerCase(),
        full_name: me.full_name || '', user_type: me.user_type || 'client', role: me.role,
        session_epoch: Number(me.session_epoch || 0),
      } };
    }
    if (!auth.ok) return Response.json({ success: false, code: auth.code, error: auth.error }, { status: auth.status });
    if (body.accountId && body.accountId !== auth.actor.account_id) return Response.json({ error: 'Not authorized for this account.' }, { status: 403 });
    const update = {};
    const email = String(body.email || '').trim().toLowerCase();
    if (email && email !== auth.actor.email) {
      if (auth.actor.account_source === 'user') return Response.json({ error: 'This legacy account email is managed by the platform account settings.' }, { status: 400 });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: 'A valid email is required.' }, { status: 400 });
      const duplicates = await base44.asServiceRole.entities.PendingSignup.filter(customerEmailQuery('email', email));
      if (duplicates.some((record) => record.id !== auth.actor.account_id)) return Response.json({ error: 'Email is already registered.' }, { status: 409 });
      update.email = email;
    }
    if (typeof body.phoneNumber === 'string') update.phone_number = body.phoneNumber;
    if (body.password) {
      if (typeof body.password !== 'string' || body.password.length < 8) return Response.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
      update.password_hash = await hashPassword(body.password);
      update.session_epoch = auth.actor.session_epoch + 1;
    }
    if (!Object.keys(update).length) return Response.json({ error: 'No data to update.' }, { status: 400 });
    const entity = auth.actor.account_source === 'user' ? base44.asServiceRole.entities.User : base44.asServiceRole.entities.PendingSignup;
    await entity.update(auth.actor.account_id, update);
    const account = { ...auth.record, ...update };
    const session = body.session_token ? mintCustomerSession(account, auth.actor.account_source) : {};
    return Response.json({ success: true, ...session, account: {
      id: account.id, email: account.email, full_name: account.full_name,
      user_type: auth.actor.user_type, role: auth.actor.role, phone_number: account.phone_number || '',
    } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ success: false, error: 'Could not update your account. Please retry.' }, { status: 500 });
  }
}
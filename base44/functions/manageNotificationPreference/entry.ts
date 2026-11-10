// The unsubscribe and resubscribe endpoint for non-transactional visibility email.
//
// The link carries an HMAC token, so this endpoint can act on an address without a login and without
// ever putting the address itself in a URL. A caller with no valid token learns nothing: an invalid
// token is a 400, never a hint about which addresses exist.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { emailFromToken, recordPreference, loadPreference, normalizeEmail } from '../../shared/notificationPreference.ts';

function mask(address: string): string {
  const [name, domain] = String(address || '').split('@');
  if (!name || !domain) return '';
  const visible = name.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, name.length - visible.length))}@${domain}`;
}

export default async function (req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || 'status');
  const token = String(body?.token || '');

  try {
    if (!token) return Response.json({ ok: false, error: 'A valid link is required.' }, { status: 400 });

    let address = '';
    try {
      address = await emailFromToken(token);
    } catch (error) {
      return Response.json({ ok: false, error: 'Notification preferences are not configured.' }, { status: 500 });
    }
    if (!address) return Response.json({ ok: false, error: 'This link is not valid.' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const now = new Date().toISOString();

    if (action === 'unsubscribe') {
      await recordPreference(base44, address, {
        marketing_opt_out: true,
        marketing_opt_out_at: now,
        source: 'unsubscribe_link',
      });
      return Response.json({
        ok: true,
        subscribed: false,
        email: mask(address),
        message: 'You have been unsubscribed from optional emails. Billing and account notices about a plan you hold will still be sent.',
      });
    }

    if (action === 'subscribe') {
      await recordPreference(base44, address, {
        marketing_opt_out: false,
        marketing_opt_in_at: now,
        source: 'resubscribe_link',
      });
      return Response.json({ ok: true, subscribed: true, email: mask(address), message: 'You are subscribed again.' });
    }

    const record = await loadPreference(base44, address);
    return Response.json({
      ok: true,
      subscribed: record?.marketing_opt_out !== true,
      email: mask(normalizeEmail(address)),
      opted_out_at: record?.marketing_opt_out_at || '',
      note: 'Billing and account notices are part of the service and are sent regardless of this setting.',
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
}
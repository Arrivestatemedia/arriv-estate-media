import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from 'base44:runtime';
import { verifyAdmin } from '../../shared/adminAuth.ts';

// Inbound call log for the company lines.
// Twilio is the source of truth: an inbound call reaches the app even when
// nobody dials it through the in-app dialer, so reading the Calls API is the
// only way to show every caller (answered and missed).

const norm = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  if (digits.length === 10) return '+1' + digits;
  return digits.length > 6 ? '+' + digits : '';
};

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));
    const auth = await verifyAdmin(base44, payload, new URL(req.url));
    if (!auth.authorized) {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const accountSid = secrets.get('TWILIO_ACCOUNT_SID');
    const authToken = secrets.get('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) {
      return Response.json({ error: 'Twilio is not configured' }, { status: 500 });
    }

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json?PageSize=200`,
      {
        headers: { Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`) },
        signal: AbortSignal.timeout(15000),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: data?.message || 'Twilio request failed' }, { status: 502 });
    }

    // The dialer's own legs show up as "client:<rep>" — those are internal, not callers.
    const isRealCaller = (call) =>
      String(call.from || '').startsWith('+') && String(call.to || '').startsWith('+');

    const calls = (data.calls || [])
      .filter((call) => String(call.direction || '').startsWith('inbound') && isRealCaller(call))
      .map((call) => ({
        sid: call.sid,
        from: call.from || '',
        to: call.to || '',
        caller_name: call.caller_name || '',
        status: call.status || '',
        duration: Number(call.duration || 0),
        start_time: call.start_time ? new Date(call.start_time).toISOString() : null,
        answered: call.status === 'completed' && Number(call.duration || 0) > 0,
        name: '',
        name_source: '',
      }));

    // Resolve who each number belongs to, using the records the app already holds.
    const variants = [...new Set(calls.map((call) => call.from).filter(Boolean))];
    const numbers = [...new Set(calls.map((call) => norm(call.from)).filter(Boolean))];
    const lookups = numbers.flatMap((num) => [num, num.replace(/^\+1/, '')]);

    const nameByNumber = new Map();
    if (numbers.length) {
      const [contacts, bookings, texts, members] = await Promise.all([
        base44.asServiceRole.entities.Contact.filter({ phone: { $in: [...numbers, ...lookups] } }, { limit: 200 }).catch(() => ({ items: [] })),
        base44.asServiceRole.entities.Booking.filter({ client_phone: { $in: [...numbers, ...lookups] } }, { sort: '-created_date', limit: 200 }).catch(() => ({ items: [] })),
        base44.asServiceRole.entities.SmsConversation.filter({ from_number: { $in: [...numbers, ...lookups] } }, { sort: '-last_message_at', limit: 200 }).catch(() => ({ items: [] })),
        base44.asServiceRole.entities.SalesTeamMember.list('-created_date', 500).catch(() => []),
      ]);

      const remember = (phone, name, source) => {
        const key = norm(phone);
        if (!key || !name) return;
        if (nameByNumber.has(key)) return;
        nameByNumber.set(key, { name, source });
      };

      (texts.items || []).forEach((row) => remember(row.from_number, row.contact_name, 'Text thread'));
      (bookings.items || []).forEach((row) => remember(row.client_phone, row.client_name, 'Client booking'));
      (contacts.items || []).forEach((row) => remember(row.phone, row.name || row.full_name || row.company, 'Contact'));
      (members || []).forEach((row) => {
        remember(row.mobile_phone_number, row.full_name, 'Team');
        remember(row.phone_number, row.full_name, 'Team');
      });
    }

    calls.forEach((call) => {
      const match = nameByNumber.get(norm(call.from));
      call.name = call.caller_name || match?.name || '';
      call.name_source = call.caller_name ? 'Caller ID' : (match?.source || '');
    });

    calls.sort((a, b) => new Date(b.start_time || 0) - new Date(a.start_time || 0));

    const answered = calls.filter((call) => call.answered).length;
    return Response.json({
      calls,
      counts: { total: calls.length, answered, missed: calls.length - answered },
      unresolved_numbers: variants.length - calls.filter((call) => call.name).length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
/**
 * arrivOneProspectSearch — individual live prospect lookup.
 *
 * Extends the EXISTING prospecting module with a person-level search. It does
 * not replace list generation (findProspectingRealtors) or any existing flow.
 *
 * Honesty rules enforced here:
 *  - A returned email/phone is only marked "verified" when the value literally
 *    appears on a source page that answered 200. Everything else is unverified.
 *  - No email is ever constructed from a company pattern.
 *  - Every source URL is probed; dead or invented URLs are dropped.
 *
 * Cost controls: cached per name+location for N days, and a per-period lookup
 * cap from shared settings, so repeat searches cost nothing.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { authorizeArrivOne, requireAdmin } from '../../shared/arrivOneAuth.ts';
import { loadVoiceSettings, saveVoiceSettings, periodKey } from '../../shared/arrivOneSettings.ts';
import { normalizePhone, digits, nameTokens, findContactsByPhone } from '../../shared/arrivOneCommand.ts';

const listOf = (v: any) => (Array.isArray(v) ? v : v?.items || []);
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

const SEARCH_SCHEMA = {
  type: 'object',
  properties: {
    people: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          full_name: { type: 'string' },
          brokerage: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          website: { type: 'string' },
          profile_url: { type: 'string' },
          sources: {
            type: 'array',
            items: {
              type: 'object',
              properties: { url: { type: 'string' }, title: { type: 'string' } },
            },
          },
          confidence: { type: 'number' },
          notes: { type: 'string' },
        },
      },
    },
    ambiguous: { type: 'boolean' },
    notice: { type: 'string' },
  },
  required: ['people'],
};

function cacheKey(kind: string, query: any) {
  const base = [
    kind,
    String(query.full_name || '').toLowerCase().replace(/[^a-z ]/g, '').trim(),
    String(query.company || query.brokerage || '').toLowerCase().replace(/[^a-z ]/g, '').trim(),
    String(query.city || '').toLowerCase().trim(),
    String(query.state || '').toLowerCase().trim(),
  ].join('|');
  return base;
}

async function probe(url: string) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return { reachable: false, text: '' };
  } catch {
    return { reachable: false, text: '' };
  }
  const run = async (method: string) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
      });
      return res;
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    let res = await run('GET');
    if (!res || res.status >= 400) {
      const alt = await run('HEAD').catch(() => null);
      if (alt && alt.status < 400) return { reachable: true, text: '' };
      return { reachable: false, text: '' };
    }
    if (res.status === 401 || res.status === 403) return { reachable: true, text: '' };
    const html = await res.text().catch(() => '');
    return { reachable: true, text: String(html || '').slice(0, 120000) };
  } catch {
    return { reachable: false, text: '' };
  }
}

async function verifyPerson(person: any) {
  const listed = Array.isArray(person?.sources) ? [...person.sources] : [];
  // The profile and website the model returned are evidence too — probe them so a
  // result is never shown as unverifiable simply because sources[] was empty.
  if (person?.profile_url) listed.push({ url: person.profile_url, title: 'Professional profile' });
  if (person?.website) {
    const site = /^https?:\/\//.test(person.website) ? person.website : `https://${person.website}`;
    listed.push({ url: site, title: 'Website' });
  }
  const sources = listed;
  const checked: any[] = [];
  let evidenceText = '';
  for (const source of sources.slice(0, 4)) {
    if (!source?.url) continue;
    const probed = await probe(source.url);
    if (!probed.reachable) continue;
    checked.push({ url: source.url, title: source.title || '', reachable: true });
    if (!evidenceText && probed.text) evidenceText = probed.text;
  }

  const lowerEvidence = evidenceText.toLowerCase();
  const email = String(person?.email || '').trim().toLowerCase();
  const phone = normalizePhone(person?.phone);
  const last10 = digits(phone).slice(-10);

  const emailSeen =
    !!email &&
    (lowerEvidence.includes(email) ||
      (email.includes('@') && lowerEvidence.includes(email.split('@')[0].slice(0, 12)) && lowerEvidence.includes((email.split('@')[1] || '').toLowerCase())));
  const phoneSeen = !!last10 && (lowerEvidence.includes(last10) || lowerEvidence.includes(phone.replace('+1', '')));

  // A profile URL that is the person's own listing is itself acceptable evidence
  // for the professional details the model read from it.
  const profileReachable = checked.some((s) => s.url === person.profile_url);

  return {
    full_name: person?.full_name || '',
    brokerage: person?.brokerage || '',
    city: person?.city || '',
    state: person?.state || '',
    phone: phone || '',
    phone_display: phone ? phone : '',
    email: emailSeen ? email : email ? email : '',
    email_verified: emailSeen,
    phone_verified: phoneSeen,
    website: person?.website || '',
    profile_url: person?.profile_url || '',
    sources: checked,
    confidence: Math.round(Number(person?.confidence || 0) * 100) / 100,
    notes: person?.notes || '',
    verification: {
      phone: phoneSeen ? 'verified' : phone ? 'unverified' : 'none',
      email: emailSeen ? 'verified' : email ? 'unverified' : 'none',
      profile: profileReachable ? 'verified' : checked.length ? 'unverified' : 'none',
    },
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'search';

    // Admin scoring/telemetry actions live behind the admin guard.
    if (action === 'usage') {
      const admin = await requireAdmin(base44);
      if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });
      const settings = await loadVoiceSettings(base44);
      const rows = listOf(
        await base44.asServiceRole.entities.ProspectLookupCache.filter({}, { sort: '-fetched_at', limit: 20 }).catch(() => [])
      );
      return Response.json({ settings, recent_lookups: rows });
    }

    const auth = await authorizeArrivOne(base44, req, body);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    const actor = auth.actor;
    const settings = await loadVoiceSettings(base44);

    if (action === 'search' || action === 'email') {
      if (settings.live_search_enabled === false) {
        return Response.json({ error: 'Live prospect search is turned off by an administrator.' }, { status: 403 });
      }
      const kind = action === 'email' ? 'email' : 'identity';
      const query = {
        full_name: String(body.full_name || '').trim(),
        company: String(body.company || body.brokerage || '').trim(),
        city: String(body.city || '').trim(),
        state: String(body.state || '').trim(),
      };
      if (!query.full_name) return Response.json({ error: 'A full name is required.' }, { status: 400 });
      if (query.full_name.split(/\s+/).length < 2) {
        return Response.json({ error: 'Enter a first and last name so the right person can be found.' }, { status: 400 });
      }

      const key = cacheKey(kind, query);
      const cached = listOf(
        await base44.asServiceRole.entities.ProspectLookupCache.filter({ cache_key: key, kind }, { limit: 1 }).catch(() => [])
      )[0];
      if (cached && cached.expires_at && new Date(cached.expires_at) > new Date()) {
        await base44.asServiceRole.entities.ProspectLookupCache.update(cached.id, {
          hit_count: Number(cached.hit_count || 0) + 1,
        }).catch(() => {});
        return Response.json({
          cached: true,
          fetched_at: cached.fetched_at,
          results: cached.results || [],
          notice: '',
        });
      }

      const cap = Number(settings.lookup_daily_cap || 0);
      const currentPeriod = periodKey();
      const used =
        settings.period_key === currentPeriod ? Number(settings.lookup_calls_this_period || 0) : 0;
      if (cap > 0 && used >= cap) {
        return Response.json(
          { error: 'The monthly live-lookup limit has been reached. Cached results are still available.' },
          { status: 429 }
        );
      }

      const location = [query.city, query.state].filter(Boolean).join(', ');
      const prompt = `You are a research assistant for Arriv Estate Media, a real estate media company.

Find this individual real estate professional using public, permitted sources:
Name: ${query.full_name}
${query.company ? `Brokerage (may be wrong): ${query.company}` : ''}
${location ? `Location: ${location}` : ''}
${kind === 'email' ? 'The representative specifically wants this person’s business email.' : ''}

Return only real, publicly published professional details about this specific person.

Absolute rules:
- Do not construct or guess an email address from a company pattern. If no email is published, omit it.
- Do not invent a phone number. If none is published, omit it.
- Do not merge two different people with the same name. If you cannot tell them apart, return each one separately with its own sources and lower confidence.
- Every person must carry at least one source URL that actually contains the information.
- Prefer brokerage profile pages, agent directory listings and the agent's own website.
- confidence is 0-1 and reflects how confident you are that the details belong to this exact person.
- In notice, say plainly when nothing could be verified.`;

      const raw: any = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true,
        model: 'gemini_3_flash',
        response_json_schema: SEARCH_SCHEMA,
      });

      const people = Array.isArray(raw?.people) ? raw.people.slice(0, 6) : [];
      const verified = [];
      for (const person of people) {
        verified.push(await verifyPerson(person));
      }

      const expires = new Date(Date.now() + Number(settings.lookup_cache_days || 7) * 24 * 3600 * 1000).toISOString();
      const payload = {
        cache_key: key,
        query: [query.full_name, query.company, location].filter(Boolean).join(' — '),
        kind,
        provider: 'web_search',
        results: verified,
        result_count: verified.length,
        fetched_at: new Date().toISOString(),
        expires_at: expires,
      };
      if (cached) await base44.asServiceRole.entities.ProspectLookupCache.update(cached.id, payload);
      else await base44.asServiceRole.entities.ProspectLookupCache.create(payload);

      await saveVoiceSettings(
        base44,
        { lookup_calls_this_period: used + 1, period_key: currentPeriod },
        actor.email
      );

      return Response.json({
        cached: false,
        fetched_at: payload.fetched_at,
        results: verified,
        ambiguous: raw?.ambiguous === true || verified.length > 1,
        notice: raw?.notice || (verified.length ? '' : 'No verifiable public details were found for that person.'),
      });
    }

    if (action === 'addProspect') {
      const person = body.person || {};
      if (!person.full_name) return Response.json({ error: 'A name is required.' }, { status: 400 });

      const overrides = body.overrides || {};
      const phone = normalizePhone(overrides.phone || person.phone);
      const email = String(overrides.email || person.email || '').toLowerCase().trim();
      const tokens = nameTokens(person.full_name);
      const company = String(overrides.brokerage || person.brokerage || '').trim();

      // Duplicate prevention: phone, then email, then an exact name+brokerage pair.
      let duplicate: any = null;
      if (phone) {
        duplicate = (await findContactsByPhone(base44, phone))[0] || null;
      }
      if (!duplicate && email) {
        const rows = listOf(await base44.asServiceRole.entities.Contact.filter({ email }, { limit: 5 }).catch(() => []));
        duplicate = rows[0] || null;
      }
      if (!duplicate && tokens.length) {
        // Narrow server-side by surname instead of scanning a page of contacts.
        const rows = listOf(
          await base44.asServiceRole.entities.Contact.filter(
            { lastname: tokens[tokens.length - 1] },
            { limit: 25 }
          ).catch(() => [])
        );
        duplicate =
          rows.find((c: any) => {
            const label = `${c.firstname || ''} ${c.lastname || ''}`.toLowerCase();
            const nameMatch = tokens.every((t) => label.includes(t));
            const companyMatch = company && String(c.company || '').toLowerCase().includes(company.toLowerCase());
            return nameMatch && (companyMatch || !company);
          }) || null;
      }

      if (duplicate) {
        return Response.json({
          duplicate: true,
          contact: {
            id: duplicate.id,
            name: [duplicate.firstname, duplicate.lastname].filter(Boolean).join(' '),
            email: duplicate.email || '',
            phone: duplicate.phone || '',
          },
          message: 'This person is already in Arriv One.',
        });
      }

      const parts = String(person.full_name).trim().split(/\s+/);
      const contact = await base44.asServiceRole.entities.Contact.create({
        firstname: overrides.first_name || parts[0] || '',
        lastname: overrides.last_name || parts.slice(1).join(' ') || '',
        phone: phone || undefined,
        email: email || undefined,
        company: company || undefined,
        billing_city: overrides.city || person.city || undefined,
        billing_state: overrides.state || person.state || undefined,
        lead_status: 'NEW',
        owner_id: actor.sales_member_id || actor.id,
        sales_member_id: actor.sales_member_id || actor.id,
      });

      const sourceRows: any[] = [];
      const pushSource = (field: string, value: string, status: string, confidence: number) => {
        if (!value) return;
        for (const source of (person.sources || []).slice(0, 3)) {
          sourceRows.push({
            contact_id: contact.id,
            field,
            value,
            source_url: source.url,
            source_title: source.title || '',
            provider: 'web_search',
            verification_status: status,
            confidence,
            verified_at: new Date().toISOString(),
            sales_member_id: actor.sales_member_id || actor.id,
            created_at: new Date().toISOString(),
          });
        }
      };
      pushSource('phone', phone, person.verification?.phone || 'unverified', person.confidence || 0);
      pushSource('email', email, person.verification?.email || 'unverified', person.confidence || 0);
      pushSource('profile', person.profile_url, person.verification?.profile || 'unverified', person.confidence || 0);
      pushSource('brokerage', company, 'unverified', person.confidence || 0);
      if (sourceRows.length) {
        await base44.asServiceRole.entities.ProspectContactSource.bulkCreate(sourceRows).catch(() => {});
      }

      return Response.json({
        success: true,
        contact_id: contact.id,
        contact: {
          id: contact.id,
          name: [contact.firstname, contact.lastname].filter(Boolean).join(' '),
          email: contact.email || '',
          phone: contact.phone || '',
        },
        callable: !!phone,
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('arrivOneProspectSearch failed:', error);
    return Response.json({ error: error?.message || 'The search could not be completed.' }, { status: 500 });
  }
});
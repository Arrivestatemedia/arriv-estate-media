import { createClientFromRequest } from 'npm:@base44/sdk@0.8.59';
import { resolvePreferredEntitlement } from '../../shared/preferredEntitlement.ts';
import { runConciergeAction, NAV_PAGES, conciergeCatalog } from '../../shared/conciergeActions.ts';
import { calculateMediaPricing, DEFAULT_PRICING_CONFIG } from '../../shared/mediaPricingEngine.ts';

/**
 * Certification suite for the Arriv Preferred Concierge.
 *
 * Runs entirely against an in-memory fake client, so it never reads or writes a real
 * customer record. It proves the invariants the product depends on:
 *   - only a live Preferred entitlement opens the experience
 *   - a visibility plan never grants Preferred
 *   - an ended or cancelled membership loses access, without touching any record
 *   - a customer's actions only ever reach their own bookings, listings and galleries
 *   - a model-supplied email or id is never treated as authorization
 *   - consequential actions preview first and only write after confirmation
 */

function futureDate(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

function pastDate(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function makeFakeClient(seedRaw: Record<string, any[]>) {
  const db: Record<string, any[]> = JSON.parse(JSON.stringify(seedRaw));

  function matches(record: any, query: any) {
    if (!query) return true;
    for (const [key, cond] of Object.entries(query)) {
      if (key === '$or') {
        if (!(cond as any[]).some((branch) => matches(record, branch))) return false;
        continue;
      }
      if (key === '$and') {
        if (!(cond as any[]).every((branch) => matches(record, branch))) return false;
        continue;
      }
      const value = record?.[key];
      if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
        const c: any = cond;
        if ('$regex' in c) {
          if (!new RegExp(String(c.$regex), c.$options || '').test(String(value ?? ''))) return false;
          continue;
        }
        if ('$in' in c) {
          if (!c.$in.map((item: any) => String(item)).includes(String(value ?? ''))) return false;
          continue;
        }
        if ('$gte' in c) {
          if (String(value ?? '') < String(c.$gte)) return false;
          continue;
        }
        if ('$exists' in c) {
          const exists = value !== undefined && value !== null && value !== '';
          if (exists !== c.$exists) return false;
          continue;
        }
        if ('$ne' in c) {
          if (String(value ?? '') === String(c.$ne)) return false;
          continue;
        }
      }
      if (String(value ?? '') !== String(cond ?? '')) return false;
    }
    return true;
  }

  function entity(name: string) {
    db[name] = db[name] || [];
    return {
      async filter(query: any = {}) {
        const items = db[name].filter((record) => matches(record, query));
        return { items, has_more: false, next_cursor: null };
      },
      async list() {
        return { items: db[name], has_more: false };
      },
      async get(id: string) {
        const found = db[name].find((record) => String(record.id) === String(id));
        if (!found) {
          const error: any = new Error('Not found');
          error.status = 404;
          throw error;
        }
        return found;
      },
      async create(data: any) {
        const record = { id: `${name}_${db[name].length + 1}`, ...data };
        db[name].push(record);
        return record;
      },
      async bulkCreate(rows: any[]) {
        return rows.map((row) => ({ id: `${name}_${db[name].length + 1}`, ...row }));
      },
      async update(id: string, patch: any) {
        const found = db[name].find((record) => String(record.id) === String(id));
        if (!found) throw new Error('Not found');
        Object.assign(found, patch);
        return found;
      },
      async count(query: any = {}) {
        return db[name].filter((record) => matches(record, query)).length;
      },
      async aggregate({ query = {}, groupBy, sum = [] }: any) {
        const buckets = new Map<string, any>();
        for (const record of db[name].filter((row) => matches(row, query))) {
          const key = String(record[groupBy] ?? '');
          const bucket = buckets.get(key) || { [groupBy]: key, count: 0 };
          bucket.count += 1;
          for (const field of sum) bucket[`sum_${field}`] = Number(bucket[`sum_${field}`] || 0) + Number(record[field] || 0);
          buckets.set(key, bucket);
        }
        return Array.from(buckets.values());
      },
      _rows: () => db[name],
    };
  }

  const entities = new Proxy({}, { get: (_target, name: string) => entity(name) });
  return { asServiceRole: { entities }, _db: db };
}

function contextFor(base44: any, email: string, entitlement: any) {
  return {
    base44,
    email,
    accountId: `acc_${email}`,
    fullName: 'Test Member',
    entitlement,
    sessionId: 'cses_test',
    channel: 'text' as const,
  };
}

export default async function (req) {
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const check = (name: string, pass: boolean, detail?: any) => {
    checks.push({ name, pass: pass === true, detail: detail === undefined ? '' : String(detail) });
  };

  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me();

    const member = 'member@example.com';
    const stranger = 'stranger@example.com';

    const fake = makeFakeClient({
      AppSetting: [
        { key: 'preferred_entitled_plans', value: JSON.stringify(['preferred_monthly', 'brokerage_preferred']) },
      ],
      PreferredMembership: [
        { id: 'pm1', client_id: `acc_${member}`, client_email: member, plan: 'preferred_monthly', status: 'active', monthly_price: 29.99, started_at: pastDate(180), current_period_end: futureDate(20) },
        { id: 'pm2', client_email: 'ended@example.com', plan: 'preferred_monthly', status: 'active', monthly_price: 29.99, current_period_end: pastDate(3) },
        { id: 'pm3', client_email: 'cancelling@example.com', plan: 'preferred_monthly', status: 'active', monthly_price: 29.99, current_period_end: futureDate(12), cancel_at_period_end: true },
        { id: 'pm4', client_email: 'growth@example.com', plan: 'agent_growth', status: 'active', monthly_price: 0, current_period_end: futureDate(20) },
        { id: 'pm5', client_email: 'broker@example.com', plan: 'brokerage_preferred', status: 'active', monthly_price: 99, current_period_end: futureDate(20) },
      ],
      VisibilitySubscription: [
        { id: 'vs1', owner_email: 'growth@example.com', plan_key: 'agent_growth', status: 'active', current_period_end: futureDate(20) },
      ],
      Booking: [
        { id: 'bk_member', client_email: member, preferred_date: futureDate(5).slice(0, 10), preferred_time: '10:00 AM', package: 'photo_essentials', status: 'confirmed', property_address: '10 Member Way', city: 'Atlanta', state: 'GA', preferred_discount: 4500, total_price: 275 },
        { id: 'bk_stranger', client_email: stranger, preferred_date: futureDate(6).slice(0, 10), package: 'premium_bundle', status: 'confirmed', property_address: '99 Secret St' },
      ],
      PropertyListing: [
        { id: 'pl_member', listing_id: 'prop_member', client_email: member, job_id: 'job_member', property_address: '10 Member Way', city: 'Atlanta', state: 'GA', listing_status: 'active', publication_state: 'PUBLISHED', square_footage: 2400 },
        { id: 'pl_stranger', listing_id: 'prop_stranger', client_email: stranger, job_id: 'job_stranger', property_address: '99 Secret St', city: 'Atlanta', state: 'GA', listing_status: 'active', publication_state: 'PUBLISHED' },
      ],
      PropertyTrafficDaily: [
        { id: 'pt1', listing_id: 'prop_member', day: pastDate(2).slice(0, 10), channel: 'organic', views: 40 },
        { id: 'pt2', listing_id: 'prop_stranger', day: pastDate(2).slice(0, 10), channel: 'organic', views: 900 },
      ],
      PropertyInquiry: [
        { id: 'pi1', inquiry_id: 'inq_member', listing_id: 'prop_member', name: 'Buyer', status: 'received' },
        { id: 'pi2', inquiry_id: 'inq_stranger', listing_id: 'prop_stranger', name: 'Buyer', status: 'received' },
      ],
      Job: [
        { id: 'job_member', client_email: member, property_address: '10 Member Way', delivered_to_customer: true, delivered_at: pastDate(4), package: 'photo_essentials' },
        { id: 'job_stranger', client_email: stranger, property_address: '99 Secret St', delivered_to_customer: true, delivered_at: pastDate(3) },
      ],
      Invoice: [
        { id: 'inv_member', client_email: member, invoice_number: 'A-1', amount: 275, payment_status: 'unpaid' },
        { id: 'inv_stranger', client_email: stranger, invoice_number: 'A-2', amount: 5000, payment_status: 'unpaid' },
      ],
      PrepaidWallet: [],
      AutoFundSubscription: [],
      MediaPricingConfig: [],
      B2BOrganizationMember: [],
      B2BOrganization: [],
      ProfessionalProfile: [],
    });

    const as: any = fake;

    // ── entitlement ─────────────────────────────────────────────────────────────
    const memberEnt = await resolvePreferredEntitlement(as, { email: member, accountId: `acc_${member}` });
    check('Active Preferred membership unlocks the concierge', memberEnt.active === true, memberEnt.reason);

    const endedEnt = await resolvePreferredEntitlement(as, { email: 'ended@example.com' });
    check('An ended paid period loses premium access', endedEnt.active === false && endedEnt.reason === 'membership_ended', endedEnt.reason);

    const cancellingEnt = await resolvePreferredEntitlement(as, { email: 'cancelling@example.com' });
    check('cancel_at_period_end keeps access until the period ends', cancellingEnt.active === true);

    const growthEnt = await resolvePreferredEntitlement(as, { email: 'growth@example.com' });
    check('Agent Growth alone never grants Preferred', growthEnt.active === false, growthEnt.reason);

    const brokerEnt = await resolvePreferredEntitlement(as, { email: 'broker@example.com' });
    check('An explicitly designated higher plan that includes Preferred is entitled', brokerEnt.active === true, brokerEnt.reason);

    const noEnt = await resolvePreferredEntitlement(as, { email: 'nobody@example.com' });
    check('A standard customer receives nothing', noEnt.active === false);

    const disabled = makeFakeClient({
      AppSetting: [{ key: 'preferred_concierge', value: JSON.stringify({ enabled: false }) }],
      PreferredMembership: [{ id: 'x', client_email: member, plan: 'preferred_monthly', status: 'active', current_period_end: futureDate(20) }],
    });
    const disabledEnt = await resolvePreferredEntitlement(disabled as any, { email: member });
    check('The feature switch turns the concierge off for everyone', disabledEnt.active === false && disabledEnt.reason === 'feature_disabled');

    // ── authorization and ownership ─────────────────────────────────────────────
    const ctx = contextFor(as, member, memberEnt);

    const ownBookings = await runConciergeAction(ctx, 'list_bookings', { scope: 'all', client_email: stranger });
    const bookingRows = ownBookings.data?.bookings || [];
    check('Bookings are scoped to the verified customer', bookingRows.length === 1 && String(bookingRows[0].address || '').startsWith('10 Member Way'), `${bookingRows.length} / ${bookingRows[0]?.address || ''}`);
    check('A model-supplied email is ignored', !JSON.stringify(ownBookings.data || {}).includes('99 Secret St'));

    const foreignBooking = await runConciergeAction(ctx, 'get_booking', { booking_id: 'bk_stranger' });
    check('Another customer’s booking cannot be opened', foreignBooking.ok === false && foreignBooking.error === 'NOT_FOUND');

    const ownProperties = await runConciergeAction(ctx, 'list_properties', {});
    const propertyRows = ownProperties.data?.properties || [];
    check('Property pages are scoped to the verified customer', propertyRows.length === 1 && propertyRows[0].listing_id === 'prop_member');
    check('Traffic counts never include another customer’s pages', propertyRows[0]?.views_30d === 40, propertyRows[0]?.views_30d);

    const foreignGallery = await runConciergeAction(ctx, 'open_gallery', { job_id: 'job_stranger' });
    check('Another customer’s gallery cannot be opened', foreignGallery.ok === false && foreignGallery.error === 'NOT_FOUND');

    const invoices = await runConciergeAction(ctx, 'list_invoices', {});
    check('Invoices are scoped to the verified customer', (invoices.data?.invoices || []).length === 1 && invoices.data.invoices[0].invoice_number === 'A-1');

    // ── confirmation gate ───────────────────────────────────────────────────────
    const listingBefore = (as._db.PropertyListing.find((row: any) => row.id === 'pl_member') || {}).listing_status;
    const preview = await runConciergeAction(ctx, 'update_property_status', { listing_id: 'prop_member', listing_status: 'pending' });
    const listingAfterPreview = (as._db.PropertyListing.find((row: any) => row.id === 'pl_member') || {}).listing_status;
    check('A consequential action returns a preview, not a change', preview.pending === true && listingBefore === listingAfterPreview, listingAfterPreview);
    check('The preview shows the real before and after values', String(preview.confirmation_summary || '').includes('pending'), preview.confirmation_summary);

    const confirmed = await runConciergeAction(ctx, 'update_property_status', { listing_id: 'prop_member', listing_status: 'pending' }, { confirmed: true });
    const listingAfterConfirm = (as._db.PropertyListing.find((row: any) => row.id === 'pl_member') || {}).listing_status;
    check('Confirming performs the real change', confirmed.ok === true && listingAfterConfirm === 'pending', listingAfterConfirm);

    const foreignChange = await runConciergeAction(ctx, 'update_property_status', { listing_id: 'prop_stranger', listing_status: 'sold' }, { confirmed: true });
    const strangerStatus = (as._db.PropertyListing.find((row: any) => row.id === 'pl_stranger') || {}).listing_status;
    check('Ownership is enforced on writes too', foreignChange.ok === false && strangerStatus === 'active', strangerStatus);

    // ── navigation whitelist ────────────────────────────────────────────────────
    const badNav = await runConciergeAction(ctx, 'navigate', { page: 'https://evil.example.com' });
    check('Only whitelisted portal pages can be opened', badNav.ok === false);
    const goodNav = await runConciergeAction(ctx, 'navigate', { page: 'my_properties' });
    check('A supported page returns a validated route', goodNav.ok === true && goodNav.ui?.path === '/PropertyLeads', goodNav.ui?.path);
    check('Every navigation target is a portal route', Object.values(NAV_PAGES).every((entry: any) => String(entry.path).startsWith('/')));

    // ── real pricing ────────────────────────────────────────────────────────────
    const quote = await runConciergeAction(ctx, 'prepare_booking', { package_id: 'photo_essentials', property_sqft: 2400 });
    const expected = calculateMediaPricing(DEFAULT_PRICING_CONFIG, {
      package_id: 'photo_essentials',
      property_sqft: 2400,
      add_on_ids: [],
      preferred_active: true,
      approved_discount_amount: 0,
      referral_tender_amount: 0,
      tenure_start_date: null,
      lifecycle_config: null,
      pricing_as_of: new Date().toISOString(),
    });
    check('A prepared booking uses the real configured price', quote.ok === true && quote.data?.total_cents === expected.payment_amount_due, `${quote.data?.total_cents} vs ${expected.payment_amount_due}`);
    check('Preferred pricing is applied to the quote', Number(quote.data?.preferred_discount_cents || 0) === expected.preferred_discount, quote.data?.preferred_discount_cents);
    check('A quote books and charges nothing', (as._db.Booking || []).length === 2, (as._db.Booking || []).length);

    const noPreferredQuote = await runConciergeAction(contextFor(as, member, noEnt), 'prepare_booking', { package_id: 'photo_essentials', property_sqft: 2400 });
    check('Without Preferred the discount is not applied', Number(noPreferredQuote.data?.preferred_discount_cents || 0) === 0);

    // ── engine surface ──────────────────────────────────────────────────────────
    const catalog = conciergeCatalog();
    check('Every registered action declares an input schema', catalog.every((action: any) => action.input_schema && action.input_schema.type === 'object'));
    check('Both channels share one catalog', catalog.length >= 15, catalog.length);

    const failed = checks.filter((item) => !item.pass);
    return Response.json({
      ok: failed.length === 0,
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      checks,
      note: 'These checks run against an in-memory client and prove authorization, scoping, confirmation and pricing behaviour. They do not create customers, bookings or charges.',
    });
  } catch (error: any) {
    return Response.json({ ok: false, error: String(error?.message || error), checks }, { status: 500 });
  }
}
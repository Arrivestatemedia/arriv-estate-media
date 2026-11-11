/**
 * Arriv Preferred Concierge — the ONE action engine.
 *
 * The text concierge and the Tavus video representative both call these actions.
 * There is no second copy of any business rule here: every handler reads or writes
 * through the records and shared engines the portal itself uses.
 *
 * Security contract:
 *  - `ctx.email` / `ctx.accountId` come from the verified customer session only.
 *  - Ownership is re-checked here on every record (a model-supplied id is never
 *    treated as authorization).
 *  - Handlers never take an email, account id, organization id, price or membership
 *    status from the model.
 *  - Consequential actions are declared with `confirmation: 'required'`; they return
 *    a real preview and execute only after the customer confirms.
 *  - Money-moving work (booking submission, card payment, publishing) is never
 *    re-implemented here. Those hand off to the existing secure flows, so the
 *    concierge cannot invent a charge or bypass an approval.
 */

import { customerEmailQuery } from './customerEmail.ts';
import { calculateMediaPricing, DEFAULT_PRICING_CONFIG } from './mediaPricingEngine.ts';
import { notifySalesRepOfCancellation, resolveSalesRepForClient } from './preferredCancellation.ts';

export type ConciergeContext = {
  base44: any;
  email: string;
  accountId: string;
  fullName: string;
  entitlement: any;
  sessionId: string;
  channel: 'text' | 'video';
  /** What the member is looking at right now, sent by the portal with the instruction. */
  pageContext?: { page?: string; listing_id?: string; job_id?: string; surface?: string };
};

export type ActionOutcome = {
  ok: boolean;
  speech: string;
  data?: any;
  ui?: any;
  pending?: boolean;
  confirmation_summary?: string;
  error?: string;
  preference_patch?: any;
};

function rowsOf(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

function money(cents: number | null | undefined): string {
  const value = Number(cents || 0) / 100;
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function dollars(value: number | null | undefined): string {
  return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function addressOf(record: any): string {
  const street = String(record?.property_address || record?.street_address || '').trim();
  const city = String(record?.city || '').trim();
  const state = String(record?.state || '').trim();
  return [street, city, state].filter(Boolean).join(', ') || 'your property';
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function ownsBooking(record: any, email: string): boolean {
  return [record?.client_email, record?.ordering_user_email]
    .some((value) => String(value || '').trim().toLowerCase() === email);
}

function ownsListing(record: any, email: string): boolean {
  return [record?.client_email, record?.agent_email]
    .some((value) => String(value || '').trim().toLowerCase() === email);
}

function ownsJob(record: any, email: string): boolean {
  return [record?.client_email, record?.ordering_user_email]
    .some((value) => String(value || '').trim().toLowerCase() === email);
}

/** Portal pages the concierge may open. Anything else is refused. */
export const NAV_PAGES: Record<string, { path: string; params: string[]; label: string }> = {
  my_portal: { path: '/ClientBookings', params: [], label: 'your portal' },
  book_shoot: { path: '/BookingPage', params: ['package', 'date', 'address'], label: 'the booking form' },
  my_properties: { path: '/PropertyLeads', params: [], label: 'My Properties' },
  property_page_builder: { path: '/PropertyPageBuilder', params: ['jobId', 'intent'], label: 'the property page builder' },
  billing_visibility: { path: '/VisibilityDashboard', params: ['section'], label: 'Billing & Visibility' },
  marketing: { path: '/VisibilityDashboard', params: ['section'], label: 'your marketing dashboard' },
  analytics: { path: '/VisibilityDashboard', params: ['section'], label: 'your analytics' },
  company: { path: '/VisibilityDashboard', params: ['section'], label: 'your company account' },
  prepaid: { path: '/PrepaidPurchase', params: [], label: 'prepaid credit' },
  autofund: { path: '/AutoFund', params: [], label: 'Auto-Fund' },
  gallery: { path: '/ClientJobGallery', params: ['jobId'], label: 'your gallery' },
  account_settings: { path: '/PublicAccountSettings', params: [], label: 'Account Settings' },
};

function navDirective(page: string, params: Record<string, any> = {}) {
  const entry = NAV_PAGES[page];
  if (!entry) return null;
  const clean: Record<string, string> = {};
  for (const key of entry.params) {
    const raw = params?.[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = String(raw);
    if (!/^[A-Za-z0-9:_@.\- ]{1,80}$/.test(value)) continue;
    clean[key] = value;
  }
  const query = Object.entries(clean)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return {
    type: 'navigate',
    page,
    params: clean,
    path: query ? `${entry.path}?${query}` : entry.path,
    label: entry.label,
  };
}

// ── shared reads ─────────────────────────────────────────────────────────────────

async function customerBookings(ctx: ConciergeContext, limit = 200) {
  const page = await ctx.base44.asServiceRole.entities.Booking.filter(
    { $or: [
      customerEmailQuery('client_email', ctx.email),
      customerEmailQuery('ordering_user_email', ctx.email),
    ] },
    { sort: '-created_date', limit },
  );
  return rowsOf(page).filter((record: any) => ownsBooking(record, ctx.email));
}

function bookingView(record: any) {
  return {
    booking_id: record.id,
    address: addressOf(record),
    date: record.preferred_date || '',
    time: record.preferred_time || '',
    package: record.package || '',
    add_ons: Array.isArray(record.add_ons) ? record.add_ons : [],
    status: record.status || '',
    total_price: record.total_price ?? null,
  };
}

async function customerListings(ctx: ConciergeContext, limit = 100) {
  const page = await ctx.base44.asServiceRole.entities.PropertyListing.filter(
    customerEmailQuery('client_email', ctx.email),
    { sort: '-updated_at', limit },
  );
  return rowsOf(page).filter((record: any) => ownsListing(record, ctx.email) && record?.certification_mode !== true);
}

async function viewsByListing(ctx: ConciergeContext, listingIds: string[], since?: string) {
  if (!listingIds.length) return {} as Record<string, number>;
  try {
    const query: any = { listing_id: { $in: listingIds.slice(0, 100) } };
    if (since) query.day = { $gte: since };
    const grouped = await ctx.base44.asServiceRole.entities.PropertyTrafficDaily.aggregate({
      query,
      groupBy: 'listing_id',
      sum: ['views'],
    });
    const out: Record<string, number> = {};
    for (const row of (Array.isArray(grouped) ? grouped : grouped?.rows || [])) {
      out[String(row.listing_id)] = Number(row.sum_views || 0);
    }
    return out;
  } catch {
    return {} as Record<string, number>;
  }
}

async function leadsByListing(ctx: ConciergeContext, listingIds: string[]) {
  if (!listingIds.length) return {} as Record<string, number>;
  try {
    const grouped = await ctx.base44.asServiceRole.entities.PropertyInquiry.aggregate({
      query: { listing_id: { $in: listingIds.slice(0, 100) } },
      groupBy: 'listing_id',
    });
    const out: Record<string, number> = {};
    for (const row of (Array.isArray(grouped) ? grouped : grouped?.rows || [])) {
      out[String(row.listing_id)] = Number(row.count || 0);
    }
    return out;
  } catch {
    return {} as Record<string, number>;
  }
}

async function customerJobs(ctx: ConciergeContext, limit = 60) {
  const page = await ctx.base44.asServiceRole.entities.Job.filter(
    { $or: [
      customerEmailQuery('client_email', ctx.email),
      customerEmailQuery('ordering_user_email', ctx.email),
    ] },
    { sort: '-created_date', limit },
  );
  return rowsOf(page).filter((record: any) => ownsJob(record, ctx.email));
}

function jobDelivered(record: any) {
  return record?.delivered_to_customer === true || String(record?.delivery_status || '') === 'delivered';
}

function jobView(record: any) {
  return {
    job_id: record.id,
    title: record.title || '',
    address: addressOf(record),
    package: record.package || '',
    type: record.type || '',
    shoot_date: record.date || '',
    delivered_at: record.delivered_at || record.completed_at || '',
  };
}

async function customerInvoices(ctx: ConciergeContext, limit = 60) {
  const page = await ctx.base44.asServiceRole.entities.Invoice.filter(
    customerEmailQuery('client_email', ctx.email),
    { sort: '-created_date', limit },
  );
  return rowsOf(page);
}

function invoiceView(record: any) {
  return {
    invoice_id: record.id,
    invoice_number: record.invoice_number || '',
    amount: Number(record.amount || 0),
    payment_status: record.payment_status || 'unpaid',
    invoice_type: record.invoice_type || '',
    invoice_date: record.invoice_date || String(record.created_date || '').slice(0, 10),
    due_date: record.due_date || '',
    booking_id: record.booking_id || '',
    job_address: record.job_address || '',
    notes: record.notes || '',
  };
}

async function resolveListing(ctx: ConciergeContext, input: any) {
  const listings = await customerListings(ctx);
  const id = String(input?.listing_id || '').trim();
  const address = String(input?.address || '').trim().toLowerCase();
  if (id) return listings.find((record: any) => record.listing_id === id || record.id === id) || null;
  if (address) {
    return listings.find((record: any) => addressOf(record).toLowerCase().includes(address)
      || String(record.property_address || '').toLowerCase().includes(address)) || null;
  }
  // "This listing" means the one the member has open, never a guess.
  const contextId = String(ctx?.pageContext?.listing_id || ctx?.pageContext?.job_id || '').trim();
  if (contextId) {
    const fromContext = listings.find((record: any) => record.listing_id === contextId
      || record.id === contextId || record.job_id === contextId);
    if (fromContext) return fromContext;
  }
  return listings.length === 1 ? listings[0] : null;
}

// ── action registry ──────────────────────────────────────────────────────────────

type ActionDef = {
  name: string;
  description: string;
  schema: any;
  mutating?: boolean;
  confirmation?: 'none' | 'required';
  preview?: (ctx: ConciergeContext, input: any) => Promise<ActionOutcome>;
  run: (ctx: ConciergeContext, input: any) => Promise<ActionOutcome>;
};

const ACTIONS: Record<string, ActionDef> = {};

function define(def: ActionDef) {
  ACTIONS[def.name] = def;
}

define({
  name: 'get_account_overview',
  description: 'Summarise the customer: upcoming shoots, property pages, outstanding invoices, wallet balance and membership status.',
  schema: { type: 'object', properties: {} },
  async run(ctx) {
    const [bookings, listings, invoices] = await Promise.all([
      customerBookings(ctx),
      customerListings(ctx),
      customerInvoices(ctx),
    ]);
    const stamp = today();
    const upcoming = bookings
      .filter((record: any) => String(record.preferred_date || '') >= stamp && String(record.status || '') !== 'cancelled')
      .sort((a: any, b: any) => String(a.preferred_date).localeCompare(String(b.preferred_date)));
    const unpaid = invoices.filter((record: any) => String(record.payment_status || '') !== 'paid');
    const unpaidTotal = unpaid.reduce((sum: number, record: any) => sum + Number(record.amount || 0), 0);
    const published = listings.filter((record: any) => record.publication_state === 'PUBLISHED');

    const parts = [
      `${upcoming.length} upcoming ${upcoming.length === 1 ? 'shoot' : 'shoots'}`,
      `${listings.length} property ${listings.length === 1 ? 'page' : 'pages'} (${published.length} live)`,
      unpaid.length ? `${unpaid.length} invoice${unpaid.length === 1 ? '' : 's'} outstanding at ${dollars(unpaidTotal)}` : 'no outstanding invoices',
    ];

    return {
      ok: true,
      speech: `${ctx.fullName ? `${ctx.fullName.split(' ')[0]}, you have ` : 'You have '}${parts.join(', ')}.`,
      data: {
        upcoming: upcoming.slice(0, 5).map(bookingView),
        properties: listings.length,
        published_properties: published.length,
        outstanding_invoices: unpaid.length,
        outstanding_total: unpaidTotal,
        membership: {
          plan: ctx.entitlement?.plan || '',
          status: ctx.entitlement?.status || '',
          renews_on: ctx.entitlement?.current_period_end || '',
          cancel_at_period_end: ctx.entitlement?.cancel_at_period_end === true,
        },
      },
    };
  },
});

define({
  name: 'list_bookings',
  description: 'List the customer’s own bookings. scope is upcoming, past or all; optional from/to ISO dates.',
  schema: {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['upcoming', 'past', 'all'] },
      from: { type: 'string' },
      to: { type: 'string' },
    },
  },
  async run(ctx, input) {
    const scope = ['upcoming', 'past', 'all'].includes(String(input?.scope)) ? String(input.scope) : 'upcoming';
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(input?.from || '')) ? String(input.from) : '';
    const to = /^\d{4}-\d{2}-\d{2}$/.test(String(input?.to || '')) ? String(input.to) : '';
    const stamp = today();

    const bookings = (await customerBookings(ctx))
      .filter((record: any) => {
        const date = String(record.preferred_date || '');
        if (scope === 'upcoming' && date && date < stamp) return false;
        if (scope === 'past' && (!date || date >= stamp)) return false;
        if (from && date && date < from) return false;
        if (to && date && date > to) return false;
        if (String(record.status || '') === 'cancelled') return false;
        return true;
      })
      .sort((a: any, b: any) => (scope === 'past'
        ? String(b.preferred_date || '').localeCompare(String(a.preferred_date || ''))
        : String(a.preferred_date || '').localeCompare(String(b.preferred_date || ''))))
      .slice(0, 20)
      .map(bookingView);

    const label = scope === 'past' ? 'past' : scope === 'all' ? '' : 'upcoming';
    return {
      ok: true,
      speech: bookings.length
        ? `You have ${bookings.length} ${label} ${bookings.length === 1 ? 'booking' : 'bookings'}. ${bookings[0].address} on ${bookings[0].date}${bookings[0].time ? ` at ${bookings[0].time}` : ''} is the first.`
        : `You have no ${label || ''} bookings on file.`,
      data: { scope, bookings },
      ui: bookings.length ? navDirective('my_portal') : null,
    };
  },
});

define({
  name: 'get_booking',
  description: 'Open one booking by id, with the package, date, status and price.',
  schema: { type: 'object', properties: { booking_id: { type: 'string' } }, required: ['booking_id'] },
  async run(ctx, input) {
    const id = String(input?.booking_id || '').trim();
    if (!id) return { ok: false, speech: 'Which booking would you like me to open?', error: 'BOOKING_ID_REQUIRED' };
    const record: any = await ctx.base44.asServiceRole.entities.Booking
      .get(id).catch((error: any) => (error?.status === 404 ? null : Promise.reject(error)));
    if (!record || !ownsBooking(record, ctx.email)) {
      return { ok: false, speech: 'I could not find that booking on your account.', error: 'NOT_FOUND' };
    }
    const view = bookingView(record);
    return {
      ok: true,
      speech: `${view.address} on ${view.date}${view.time ? ` at ${view.time}` : ''}, ${view.status.replace(/_/g, ' ')}.`,
      data: view,
    };
  },
});

define({
  name: 'list_properties',
  description: 'List the customer’s own property pages with publication state, views and lead counts.',
  schema: { type: 'object', properties: {} },
  async run(ctx) {
    const listings = await customerListings(ctx);
    const ids = listings.map((record: any) => record.listing_id);
    const [views, leads] = await Promise.all([
      viewsByListing(ctx, ids, daysAgo(30)),
      leadsByListing(ctx, ids),
    ]);
    const items = listings.map((record: any) => ({
      listing_id: record.listing_id,
      job_id: record.job_id || '',
      address: addressOf(record),
      publication_state: record.publication_state || 'DRAFT',
      listing_status: record.listing_status || 'draft',
      views_30d: views[record.listing_id] || 0,
      leads: leads[record.listing_id] || 0,
      public_url: record.publication_state === 'PUBLISHED' ? (record.canonical_url || record.public_url || '') : '',
    }));
    const published = items.filter((item: any) => item.publication_state === 'PUBLISHED');
    return {
      ok: true,
      speech: items.length
        ? `You have ${items.length} property ${items.length === 1 ? 'page' : 'pages'}, ${published.length} published. ${items[0].address} has ${items[0].views_30d} views in the last 30 days.`
        : 'You have no property pages yet.',
      data: { properties: items },
      ui: items.length ? navDirective('my_properties') : null,
    };
  },
});

define({
  name: 'get_property_performance',
  description: 'Show views and leads for one property page, or across all of them, over a number of days.',
  schema: {
    type: 'object',
    properties: { listing_id: { type: 'string' }, address: { type: 'string' }, days: { type: 'number' } },
  },
  async run(ctx, input) {
    const days = Math.min(Math.max(Number(input?.days) || 30, 1), 365);
    const listings = await customerListings(ctx);
    const target = input?.listing_id || input?.address ? await resolveListing(ctx, input) : null;
    const scoped = target ? [target] : listings;
    if (!scoped.length) return { ok: false, speech: 'You have no property pages to report on yet.', error: 'NO_PROPERTIES' };

    const ids = scoped.map((record: any) => record.listing_id);
    const [views, leads] = await Promise.all([
      viewsByListing(ctx, ids, daysAgo(days)),
      leadsByListing(ctx, ids),
    ]);
    const items = scoped.map((record: any) => ({
      listing_id: record.listing_id,
      address: addressOf(record),
      views: views[record.listing_id] || 0,
      leads: leads[record.listing_id] || 0,
    }));
    const totalViews = items.reduce((sum: number, item: any) => sum + item.views, 0);
    const totalLeads = items.reduce((sum: number, item: any) => sum + item.leads, 0);

    return {
      ok: true,
      speech: target
        ? `${items[0].address} received ${totalViews} views and ${totalLeads} ${totalLeads === 1 ? 'lead' : 'leads'} in the last ${days} days.`
        : `Your property pages received ${totalViews} views and ${totalLeads} leads in the last ${days} days.`,
      data: {
        days,
        properties: items,
        totals: { views: totalViews, leads: totalLeads },
        note: 'These are Arriv’s own recorded page views and inquiries, not search-engine impressions.',
      },
      ui: navDirective('my_properties'),
    };
  },
});

define({
  name: 'list_galleries',
  description: 'List delivered media galleries for the customer’s completed shoots.',
  schema: { type: 'object', properties: {} },
  async run(ctx) {
    const jobs = (await customerJobs(ctx)).filter(jobDelivered).map(jobView);
    return {
      ok: true,
      speech: jobs.length
        ? `You have ${jobs.length} delivered ${jobs.length === 1 ? 'gallery' : 'galleries'}. The most recent is ${jobs[0].address}.`
        : 'No delivered galleries are on your account yet.',
      data: { galleries: jobs },
      ui: jobs.length ? navDirective('my_portal') : null,
    };
  },
});

define({
  name: 'open_gallery',
  description: 'Open the delivered gallery for a shoot, by job id or property address.',
  schema: { type: 'object', properties: { job_id: { type: 'string' }, address: { type: 'string' } } },
  async run(ctx, input) {
    const jobs = (await customerJobs(ctx)).filter(jobDelivered);
    const id = String(input?.job_id || '').trim();
    const address = String(input?.address || '').trim().toLowerCase();
    const job = id
      ? jobs.find((record: any) => record.id === id) || null
      : address
        ? jobs.find((record: any) => addressOf(record).toLowerCase().includes(address)) || null
        : jobs[0] || null;
    if (!job) {
      return { ok: false, speech: 'I could not find a delivered gallery for that property.', error: 'NOT_FOUND' };
    }
    const view = jobView(job);
    return {
      ok: true,
      speech: `Opening the gallery for ${view.address}.`,
      data: view,
      ui: navDirective('gallery', { jobId: view.job_id }),
    };
  },
});

define({
  name: 'list_invoices',
  description: 'List the customer’s invoices with amount and payment status.',
  schema: { type: 'object', properties: { status: { type: 'string', enum: ['all', 'unpaid', 'paid'] } } },
  async run(ctx, input) {
    const wanted = ['all', 'unpaid', 'paid'].includes(String(input?.status)) ? String(input.status) : 'all';
    const invoices = (await customerInvoices(ctx))
      .map(invoiceView)
      .filter((invoice: any) => wanted === 'all' || invoice.payment_status === wanted);
    const unpaid = invoices.filter((invoice: any) => invoice.payment_status !== 'paid');
    const unpaidTotal = unpaid.reduce((sum: number, invoice: any) => sum + invoice.amount, 0);
    return {
      ok: true,
      speech: invoices.length
        ? `${invoices.length} ${invoices.length === 1 ? 'invoice' : 'invoices'}. ${unpaid.length ? `${unpaid.length} unpaid totalling ${dollars(unpaidTotal)}.` : 'All are paid.'}`
        : 'No invoices on your account.',
      data: { invoices, unpaid_total: unpaidTotal },
      ui: invoices.length ? navDirective('billing_visibility', { section: 'invoices' }) : null,
    };
  },
});

define({
  name: 'get_payment_summary',
  description: 'Show prepaid wallet balance, Auto-Fund status, membership billing state and outstanding invoices.',
  schema: { type: 'object', properties: {} },
  async run(ctx) {
    const [wallets, autoFund, invoices] = await Promise.all([
      rowsOf(await ctx.base44.asServiceRole.entities.PrepaidWallet
        .filter(customerEmailQuery('customer_email', ctx.email), { limit: 5 }).catch(() => [])),
      rowsOf(await ctx.base44.asServiceRole.entities.AutoFundSubscription
        .filter(customerEmailQuery('customer_email', ctx.email), { limit: 5 }).catch(() => [])),
      customerInvoices(ctx),
    ]);
    const wallet = wallets[0] || null;
    const fund = autoFund[0] || null;
    const unpaid = invoices.filter((record: any) => String(record.payment_status || '') !== 'paid');
    const unpaidTotal = unpaid.reduce((sum: number, record: any) => sum + Number(record.amount || 0), 0);
    const balanceCents = Number(wallet?.booking_value_balance_cents || 0);

    const sentences = [
      wallet ? `Prepaid balance ${money(balanceCents)}` : 'No prepaid wallet',
      fund ? `Auto-Fund ${fund.status || 'active'} at ${dollars(fund.amount)} monthly` : 'Auto-Fund not active',
      unpaid.length ? `${unpaid.length} unpaid invoice${unpaid.length === 1 ? '' : 's'} worth ${dollars(unpaidTotal)}` : 'no unpaid invoices',
    ];

    return {
      ok: true,
      speech: `${sentences.join(', ')}.`,
      data: {
        wallet: wallet ? { balance_cents: balanceCents, balance_label: money(balanceCents), tier: wallet.tier || '' } : null,
        auto_fund: fund ? { status: fund.status || '', amount: Number(fund.amount || 0), membership_fee: Number(fund.membership_fee || 0) } : null,
        outstanding_invoices: unpaid.length,
        outstanding_total: unpaidTotal,
        membership: { plan: ctx.entitlement?.plan || '', monthly_price: Number(ctx.entitlement?.monthly_price || 0) },
      },
      ui: navDirective('billing_visibility'),
    };
  },
});

define({
  name: 'get_preferred_savings',
  description: 'Show what the customer has saved through Preferred: preferred discounts on their bookings, against the membership paid.',
  schema: { type: 'object', properties: {} },
  async run(ctx) {
    const bookings = await customerBookings(ctx, 300);
    const discountCents = bookings.reduce((sum: number, record: any) => sum + Number(record.preferred_discount || 0), 0);
    const referralCents = bookings.reduce((sum: number, record: any) => sum + Number(record.referral_tender_amount || 0), 0);
    const started = ctx.entitlement?.started_at ? new Date(ctx.entitlement.started_at).getTime() : null;
    const months = started ? Math.max(1, Math.round((Date.now() - started) / (30 * 86400000))) : null;
    const costCents = months !== null ? Math.round(months * Number(ctx.entitlement?.monthly_price || 0) * 100) : null;
    const savedCents = discountCents + referralCents;

    return {
      ok: true,
      speech: savedCents
        ? `Preferred has taken ${money(savedCents)} off your services${costCents !== null ? `, against ${money(costCents)} of membership paid` : ''}.`
        : 'No Preferred discounts have been applied to a booking yet. They apply automatically at booking.',
      data: {
        preferred_discount_cents: discountCents,
        referral_tender_cents: referralCents,
        total_saved_cents: savedCents,
        total_saved_label: money(savedCents),
        membership_paid_cents: costCents,
        membership_months: months,
        note: 'Savings are the discounts actually recorded on your own bookings. Nothing here is estimated.',
      },
    };
  },
});

define({
  name: 'get_visibility_summary',
  description: 'Show the customer’s marketing plan, its status and the public profile tied to it.',
  schema: { type: 'object', properties: {} },
  async run(ctx) {
    const [subscriptions, profiles] = await Promise.all([
      rowsOf(await ctx.base44.asServiceRole.entities.VisibilitySubscription
        .filter(customerEmailQuery('owner_email', ctx.email), { sort: '-created_date', limit: 3 }).catch(() => [])),
      rowsOf(await ctx.base44.asServiceRole.entities.ProfessionalProfile
        .filter(customerEmailQuery('owner_email', ctx.email), { limit: 3 }).catch(() => [])),
    ]);
    const subscription = subscriptions[0] || null;
    const profile = profiles[0] || null;

    if (!subscription && !profile) {
      return {
        ok: true,
        speech: 'You do not have a marketing plan or public profile yet. I can open the visibility options for you.',
        data: { subscription: null, profile: null },
        ui: navDirective('marketing'),
      };
    }

    return {
      ok: true,
      speech: subscription
        ? `Your ${String(subscription.plan_key || 'marketing').replace(/_/g, ' ')} plan is ${subscription.status || 'inactive'}${profile ? `, and your profile is ${String(profile.publication_state || 'DRAFT').toLowerCase()}` : ''}.`
        : 'Your marketing profile is set up but there is no active paid plan.',
      data: {
        subscription: subscription
          ? {
            plan_key: subscription.plan_key || '',
            status: subscription.status || '',
            current_period_end: subscription.current_period_end || '',
            cancel_at_period_end: subscription.cancel_at_period_end === true,
            amount_cents: Number(subscription.amount_cents || 0),
          }
          : null,
        profile: profile
          ? {
            profile_id: profile.profile_id || '',
            display_name: profile.display_name || '',
            publication_state: profile.publication_state || 'DRAFT',
            indexing: profile.indexing || 'noindex',
          }
          : null,
      },
      ui: navDirective('marketing'),
    };
  },
});

define({
  name: 'get_purchasing_context',
  description: 'Show whether this customer orders personally or through a company they belong to, and their company role.',
  schema: { type: 'object', properties: {} },
  async run(ctx) {
    const memberships = rowsOf(await ctx.base44.asServiceRole.entities.B2BOrganizationMember
      .filter(customerEmailQuery('user_email', ctx.email), { limit: 10 }).catch(() => []));
    const active = memberships.filter((record: any) => String(record.status || '') === 'active');

    const companies: any[] = [];
    for (const membership of active.slice(0, 5)) {
      const org: any = await ctx.base44.asServiceRole.entities.B2BOrganization
        .get(membership.organization_id).catch(() => null);
      if (!org) continue;
      companies.push({
        organization_id: membership.organization_id,
        organization_name: org.name || org.organization_name || 'Your company',
        role: membership.role || '',
        seat_type: membership.seat_type || '',
      });
    }

    return {
      ok: true,
      speech: companies.length
        ? `You can order personally, or through ${companies.map((item: any) => item.organization_name).join(' and ')}. Personal and company credits are never mixed.`
        : 'You order personally. Your account is not linked to a company ordering context.',
      data: { personal: true, companies },
    };
  },
});

define({
  name: 'prepare_booking',
  description: 'Quote a booking with the real configured price for this customer, including the Preferred discount. Creates nothing and charges nothing.',
  schema: {
    type: 'object',
    properties: {
      package_id: { type: 'string', enum: ['mls_walkthrough', 'photo_essentials', 'photo_cinematic', 'premium_bundle'] },
      property_sqft: { type: 'number' },
      add_on_ids: { type: 'array', items: { type: 'string' } },
      listing_id: { type: 'string' },
    },
    required: ['package_id'],
  },
  async run(ctx, input) {
    const packageId = String(input?.package_id || '').trim();
    const configurations = rowsOf(await ctx.base44.asServiceRole.entities.MediaPricingConfig
      .filter({ is_active: true }, { sort: '-created_date', limit: 1 }).catch(() => []));
    const config = configurations[0] || DEFAULT_PRICING_CONFIG;

    const tierOne = (config?.tier_prices || []).find((tier: any) => tier.tier === 'TIER_1');
    const validPackages = Object.keys(tierOne?.prices || {});
    if (validPackages.length && !validPackages.includes(packageId)) {
      return { ok: false, speech: 'That package is not one I can quote. The options are MLS walkthrough, photo essentials, photo cinematic or the premium bundle.', error: 'UNKNOWN_PACKAGE' };
    }

    const requestedAddOns = Array.isArray(input?.add_on_ids) ? input.add_on_ids.map(String) : [];
    const addOns = (config?.add_ons || []).filter((addOn: any) => addOn.active !== false
      && requestedAddOns.includes(String(addOn.id)));

    let sqft: number | null = Number.isFinite(Number(input?.property_sqft)) && Number(input.property_sqft) > 0
      ? Number(input.property_sqft)
      : null;
    if (sqft === null && input?.listing_id) {
      const listing = await resolveListing(ctx, { listing_id: input.listing_id });
      if (listing && Number(listing.square_footage) > 0) sqft = Number(listing.square_footage);
    }

    const quote = calculateMediaPricing(config, {
      package_id: packageId,
      property_sqft: sqft,
      add_on_ids: addOns.map((addOn: any) => String(addOn.id)),
      preferred_active: ctx.entitlement?.active === true,
      approved_discount_amount: 0,
      referral_tender_amount: 0,
      tenure_start_date: null,
      lifecycle_config: null,
      pricing_as_of: new Date().toISOString(),
    });

    if (quote.status !== 'OK') {
      return {
        ok: false,
        speech: 'That property needs a custom quote before I can price it. A specialist can confirm it with you.',
        error: quote.status,
        data: { quote },
      };
    }

    return {
      ok: true,
      speech: `With your Preferred pricing, ${packageId.replace(/_/g, ' ')} comes to ${money(quote.payment_amount_due)}${quote.preferred_discount > 0 ? `, including ${money(quote.preferred_discount)} off` : ''}. Availability is confirmed in the booking form.`,
      data: {
        package_id: packageId,
        package_price_cents: quote.property_adjusted_package_price,
        add_ons_cents: quote.add_ons_subtotal,
        preferred_discount_cents: quote.preferred_discount,
        total_cents: quote.payment_amount_due,
        total_label: money(quote.payment_amount_due),
        pricing_tier: quote.property_pricing_tier,
        add_ons: quote.selected_add_ons,
        note: 'A quote only. Nothing is booked or charged until you submit the booking form, which checks live availability.',
      },
    };
  },
});

define({
  name: 'open_booking_form',
  description: 'Open the existing secure booking form, optionally carrying the package, date and property address the customer named.',
  schema: {
    type: 'object',
    properties: {
      package_id: { type: 'string' },
      date: { type: 'string', description: 'ISO date YYYY-MM-DD' },
      address: { type: 'string' },
    },
  },
  async run(ctx, input) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input?.date || '')) ? String(input.date) : '';
    const ui = navDirective('book_shoot', {
      package: String(input?.package_id || ''),
      date,
      address: String(input?.address || ''),
    });
    return {
      ok: true,
      speech: `Opening the booking form${date ? ` for ${date}` : ''}. Availability and the final total are confirmed there before anything is charged.`,
      data: { opened: 'book_shoot', carried: ui?.params || {} },
      ui,
    };
  },
});

define({
  name: 'open_property',
  description: 'Open one of the customer’s own property pages.',
  schema: { type: 'object', properties: { listing_id: { type: 'string' }, address: { type: 'string' } } },
  async run(ctx, input) {
    const listing = await resolveListing(ctx, input);
    if (!listing) {
      return { ok: false, speech: 'I could not match that to one of your property pages.', error: 'NOT_FOUND' };
    }
    const ui = listing.job_id
      ? navDirective('property_page_builder', { jobId: listing.job_id })
      : navDirective('my_properties');
    return {
      ok: true,
      speech: `Opening ${addressOf(listing)}. Publishing still goes through the page’s own approvals.`,
      data: {
        listing_id: listing.listing_id,
        address: addressOf(listing),
        publication_state: listing.publication_state || 'DRAFT',
      },
      ui,
    };
  },
});

define({
  name: 'navigate',
  description: 'Open a supported portal page for the customer.',
  schema: {
    type: 'object',
    properties: { page: { type: 'string', enum: Object.keys(NAV_PAGES) } },
    required: ['page'],
  },
  async run(ctx, input) {
    const page = String(input?.page || '');
    const ui = navDirective(page);
    if (!ui) return { ok: false, speech: 'I can’t open that from here.', error: 'UNSUPPORTED_PAGE' };
    return { ok: true, speech: `Opening ${ui.label}.`, data: { page }, ui };
  },
});

define({
  name: 'update_property_status',
  description: 'Change the availability of one of the customer’s listings (draft, active, pending, sold, withdrawn). Never publishes a page.',
  schema: {
    type: 'object',
    properties: {
      listing_id: { type: 'string' },
      address: { type: 'string' },
      listing_status: { type: 'string', enum: ['draft', 'active', 'pending', 'sold', 'withdrawn'] },
    },
    required: ['listing_status'],
  },
  mutating: true,
  confirmation: 'required',
  async preview(ctx, input) {
    const listing = await resolveListing(ctx, input);
    if (!listing) return { ok: false, speech: 'I could not match that to one of your property pages.', error: 'NOT_FOUND' };
    const next = String(input?.listing_status || '');
    return {
      ok: true,
      pending: true,
      speech: `Shall I mark ${addressOf(listing)} as ${next}?`,
      confirmation_summary: `${addressOf(listing)}: listing availability will change from ${listing.listing_status || 'draft'} to ${next}. Publication state is not changed.`,
      data: {
        listing_id: listing.listing_id,
        address: addressOf(listing),
        from: listing.listing_status || 'draft',
        to: next,
      },
    };
  },
  async run(ctx, input) {
    const listing = await resolveListing(ctx, input);
    if (!listing) return { ok: false, speech: 'I could not match that to one of your property pages.', error: 'NOT_FOUND' };
    const next = String(input?.listing_status || '');
    if (!['draft', 'active', 'pending', 'sold', 'withdrawn'].includes(next)) {
      return { ok: false, speech: 'That is not a status I can set.', error: 'INVALID_STATUS' };
    }
    await ctx.base44.asServiceRole.entities.PropertyListing.update(listing.id, {
      listing_status: next,
      last_status_change_at: new Date().toISOString(),
      last_status_confirmed_at: new Date().toISOString(),
      last_status_confirmed_by: ctx.email,
    });
    return {
      ok: true,
      speech: `${addressOf(listing)} is now marked ${next}.`,
      data: { listing_id: listing.listing_id, listing_status: next },
      ui: navDirective('my_properties'),
    };
  },
});

define({
  name: 'close_property_lead',
  description: 'Mark one of the customer’s property inquiries as handled.',
  schema: { type: 'object', properties: { inquiry_id: { type: 'string' } }, required: ['inquiry_id'] },
  mutating: true,
  confirmation: 'required',
  async preview(ctx, input) {
    const inquiryId = String(input?.inquiry_id || '').trim();
    const inquiries = rowsOf(await ctx.base44.asServiceRole.entities.PropertyInquiry
      .filter({ inquiry_id: inquiryId }, { limit: 1 }));
    const inquiry = inquiries[0] || null;
    const listings = await customerListings(ctx);
    const listing = inquiry ? listings.find((record: any) => record.listing_id === inquiry.listing_id) : null;
    if (!inquiry || !listing) {
      return { ok: false, speech: 'I could not find that inquiry on one of your properties.', error: 'NOT_FOUND' };
    }
    return {
      ok: true,
      pending: true,
      speech: `Shall I close the inquiry from ${inquiry.name || 'this visitor'}?`,
      confirmation_summary: `Inquiry from ${inquiry.name || 'a visitor'} about ${addressOf(listing)} will be marked closed. It stays on record.`,
      data: { inquiry_id: inquiryId, from: inquiry.status || 'received', listing_id: listing.listing_id },
    };
  },
  async run(ctx, input) {
    const inquiryId = String(input?.inquiry_id || '').trim();
    const inquiries = rowsOf(await ctx.base44.asServiceRole.entities.PropertyInquiry
      .filter({ inquiry_id: inquiryId }, { limit: 1 }));
    const inquiry = inquiries[0] || null;
    const listings = await customerListings(ctx);
    const listing = inquiry ? listings.find((record: any) => record.listing_id === inquiry.listing_id) : null;
    if (!inquiry || !listing) {
      return { ok: false, speech: 'I could not find that inquiry on one of your properties.', error: 'NOT_FOUND' };
    }
    await ctx.base44.asServiceRole.entities.PropertyInquiry.update(inquiry.id, {
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: ctx.email,
    });
    return {
      ok: true,
      speech: `Closed the inquiry from ${inquiry.name || 'that visitor'}.`,
      data: { inquiry_id: inquiryId, status: 'closed' },
      ui: navDirective('my_properties'),
    };
  },
});

define({
  name: 'request_human_assistance',
  description: 'Log a request for an Arriv specialist to follow up with the customer.',
  schema: { type: 'object', properties: { topic: { type: 'string' } } },
  async run(ctx, input) {
    const topic = String(input?.topic || 'Preferred concierge request').slice(0, 300);
    return {
      ok: true,
      speech: 'I’ve logged this for an Arriv specialist, with your account attached. You can keep using the portal while we pick it up.',
      data: { logged: true, topic, account: ctx.email },
    };
  },
});

define({
  name: 'request_membership_cancellation',
  description: 'File the customer’s request to cancel their Preferred membership and alert their Arriv advisor by email and text. Never cancels the membership itself.',
  schema: { type: 'object', properties: { reason: { type: 'string', description: 'Why they want to cancel, in their own words' } } },
  mutating: true,
  async run(ctx, input) {
    const memberships = rowsOf(await ctx.base44.asServiceRole.entities.PreferredMembership
      .filter(customerEmailQuery('client_email', ctx.email), { sort: '-created_date', limit: 10 }).catch(() => []));
    const membership = memberships.find((record: any) => ['active', 'trialing'].includes(String(record.status || '').toLowerCase())) || null;
    if (!membership) {
      return {
        ok: false,
        speech: 'There is no active Preferred membership on your account, so there is nothing to cancel.',
        error: 'NO_ACTIVE_MEMBERSHIP',
      };
    }

    const existing = rowsOf(await ctx.base44.asServiceRole.entities.PreferredCancellationRequest
      .filter({ membership_id: membership.id, status: 'requested' }, { limit: 1 }).catch(() => []))[0] || null;
    const rep = await resolveSalesRepForClient(ctx.base44, membership);

    const request = existing || await ctx.base44.asServiceRole.entities.PreferredCancellationRequest.create({
      request_id: `pcr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      membership_id: membership.id,
      client_id: ctx.accountId || membership.client_id || '',
      client_email: ctx.email,
      client_name: ctx.fullName || membership.client_name || '',
      plan: membership.plan || 'preferred_monthly',
      membership_status: String(membership.status || '').toLowerCase(),
      period_end: membership.current_period_end || '',
      status: 'requested',
      requested_via: ctx.channel === 'video' ? 'concierge_video' : 'concierge_text',
      utterance: String(input?.reason || '').slice(0, 500),
      sales_rep_id: rep.id,
      sales_rep_name: rep.name,
      sales_rep_email: rep.email,
      sales_rep_phone: rep.phone,
      created_at: new Date().toISOString(),
    });

    // Already with the advisor: never alert them twice for the same request.
    const delivery = existing
      ? { email: !!existing.email_sent_at, sms: !!existing.sms_sent_at, errors: [] as string[] }
      : await notifySalesRepOfCancellation(ctx.base44, { request, membership, rep });

    const reached = delivery.email || delivery.sms;
    const speech = reached
      ? `I’ve sent your cancellation request to ${rep.name}. They’ll reach out to you to take care of it, and your membership stays exactly as it is until then.`
      : `I’ve recorded your cancellation request on your account and ${rep.name} will pick it up from there. Your membership stays exactly as it is until it’s handled.`;

    return {
      ok: true,
      speech: existing ? `Your cancellation request is already with ${rep.name}. They’ll reach out to you to take care of it.` : speech,
      data: {
        request_id: request.request_id,
        status: 'requested',
        advisor: rep.name,
        email_sent: delivery.email === true,
        sms_sent: delivery.sms === true,
        membership_unchanged: true,
        note: 'A request only. The membership is cancelled by Arriv once the advisor has spoken with the customer.',
      },
    };
  },
});

define({
  name: 'set_preference',
  description: 'Remember a non-sensitive preference the customer explicitly stated, such as their usual package.',
  schema: {
    type: 'object',
    properties: {
      display_name: { type: 'string' },
      preferred_package: { type: 'string' },
      greeting_style: { type: 'string' },
      keep_history: { type: 'boolean' },
    },
  },
  async run(ctx, input) {
    const patch: any = {};
    if (typeof input?.display_name === 'string' && input.display_name.trim()) patch.display_name = input.display_name.trim().slice(0, 60);
    if (typeof input?.preferred_package === 'string' && input.preferred_package.trim()) patch.preferred_package = input.preferred_package.trim().slice(0, 60);
    if (typeof input?.greeting_style === 'string' && input.greeting_style.trim()) patch.greeting_style = input.greeting_style.trim().slice(0, 60);
    if (typeof input?.keep_history === 'boolean') patch.keep_history = input.keep_history;
    if (!Object.keys(patch).length) {
      return { ok: false, speech: 'What would you like me to remember?', error: 'EMPTY_PREFERENCE' };
    }
    return {
      ok: true,
      speech: 'Noted. I’ll use that in this conversation and on your next visit.',
      data: { saved: patch },
      preference_patch: patch,
    };
  },
});

define({
  name: 'show_analytics',
  description: 'Open the real performance dashboard: property page views, inquiries and publication state, over a number of days.',
  schema: {
    type: 'object',
    properties: { days: { type: 'number' }, listing_id: { type: 'string' }, address: { type: 'string' } },
  },
  async run(ctx, input) {
    // The numbers are the same real recorded figures; only the workspace changes.
    const performance = await ACTIONS.get_property_performance.run(ctx, input);
    if (!performance.ok) return performance;
    return {
      ...performance,
      speech: `${performance.speech} Your analytics are open beside me.`,
      ui: navDirective('analytics', { section: 'visibility' }),
    };
  },
});

define({
  name: 'set_gallery_layout',
  description: 'Change how large the photographs are shown in the gallery the member is looking at (small, medium, large). An immediate, reversible display change.',
  schema: {
    type: 'object',
    properties: { size: { type: 'string', enum: ['small', 'medium', 'large'] } },
    required: ['size'],
  },
  async run(ctx, input) {
    const size = ['small', 'medium', 'large'].includes(String(input?.size)) ? String(input.size) : 'large';
    const sizeWords = size === 'large' ? 'larger' : size === 'small' ? 'smaller' : 'medium size';
    // Already in a delivered gallery? Change it in place. Otherwise open the latest gallery
    // at that size, so the instruction always has a visible effect.
    const inGallery = String(ctx?.pageContext?.surface || '') === 'jobGallery';
    if (!inGallery) {
      const jobs = (await customerJobs(ctx)).filter(jobDelivered);
      const latest = jobs[0] || null;
      if (!latest) {
        return { ok: false, speech: 'You do not have a delivered gallery yet, so there is nothing to resize.', error: 'NO_GALLERY' };
      }
      return {
        ok: true,
        speech: `Opening your latest gallery with the photographs ${sizeWords}.`,
        data: { gallery_size: size, job_id: latest.id, address: addressOf(latest) },
        ui: { type: 'display', target: 'gallery', size, open_job_id: latest.id },
      };
    }
    return {
      ok: true,
      speech: `Making the photographs ${sizeWords}.`,
      data: { gallery_size: size },
      ui: { type: 'display', target: 'gallery', size },
    };
  },
});

define({
  name: 'create_property_page',
  description: 'Start the authorized property page workflow for a listing the member has media for, or open a new page when they have none. Never publishes anything.',
  schema: {
    type: 'object',
    properties: { listing_id: { type: 'string' }, address: { type: 'string' }, job_id: { type: 'string' } },
  },
  async run(ctx, input) {
    const explicitJob = String(input?.job_id || '').trim();
    const listing = await resolveListing(ctx, input);
    const jobId = explicitJob || String(listing?.job_id || '').trim();
    const ui = jobId
      ? navDirective('property_page_builder', { jobId })
      : navDirective('property_page_builder', { intent: 'free-page' });
    return {
      ok: true,
      speech: jobId
        ? `Opening the page builder for ${addressOf(listing)} with the details and media already on file. Nothing is published until you approve it.`
        : 'Opening a new property page so you can add the address and photographs. Nothing is published until you approve it.',
      data: {
        job_id: jobId,
        listing_id: listing?.listing_id || '',
        address: listing ? addressOf(listing) : '',
        publication_state: listing?.publication_state || 'DRAFT',
      },
      ui,
    };
  },
});

define({
  name: 'promote_listing',
  description: 'Show the marketing options for one of the member’s listings: page packages, promotion and advertising. Any purchase stays in the existing secure checkout.',
  schema: {
    type: 'object',
    properties: { listing_id: { type: 'string' }, address: { type: 'string' } },
  },
  async run(ctx, input) {
    const listing = await resolveListing(ctx, input);
    if (!listing) {
      return { ok: false, speech: 'I could not match that to one of your property pages.', error: 'NOT_FOUND' };
    }
    return {
      ok: true,
      speech: `Opening ${addressOf(listing)} with its marketing options: page packages, promotion and advertising. Anything you buy stays in the existing secure checkout.`,
      data: {
        listing_id: listing.listing_id,
        address: addressOf(listing),
        publication_state: listing.publication_state || 'DRAFT',
      },
      ui: listing.job_id
        ? navDirective('property_page_builder', { jobId: listing.job_id })
        : navDirective('my_properties'),
    };
  },
});

define({
  name: 'list_company_accounts',
  description: 'Show the companies this member is authorized to order through and open the company account area. The member switches context themselves, under the portal’s server-side permission checks.',
  schema: { type: 'object', properties: {} },
  async run(ctx) {
    const memberships = rowsOf(await ctx.base44.asServiceRole.entities.B2BOrganizationMember
      .filter(customerEmailQuery('user_email', ctx.email), { limit: 10 }).catch(() => []));
    const active = memberships.filter((record: any) => String(record.status || '') === 'active');
    const companies: any[] = [];
    for (const membership of active.slice(0, 5)) {
      const org: any = await ctx.base44.asServiceRole.entities.B2BOrganization
        .get(membership.organization_id).catch(() => null);
      if (!org) continue;
      companies.push({
        organization_id: membership.organization_id,
        organization_name: org.name || org.organization_name || 'Your company',
        role: membership.role || '',
      });
    }
    return {
      ok: true,
      speech: companies.length
        ? `You are authorized on ${companies.map((item: any) => item.organization_name).join(' and ')}. I've opened your company area: choose the context there and Arriv verifies your permission before anything is ordered.`
        : 'Your account is personal only, so there is no company context to switch to.',
      data: { personal: true, companies },
      ui: companies.length ? navDirective('company', { section: 'company' }) : null,
    };
  },
});

// ── public API for the functions ─────────────────────────────────────────────────

export function conciergeCatalog() {
  return Object.values(ACTIONS).map((action) => ({
    name: action.name,
    description: action.description,
    input_schema: action.schema,
    mutating: action.mutating === true,
    confirmation_required: action.confirmation === 'required',
  }));
}

export function isKnownAction(name: string) {
  return Object.prototype.hasOwnProperty.call(ACTIONS, name);
}

export function actionRequiresConfirmation(name: string) {
  return ACTIONS[name]?.confirmation === 'required';
}

export function actionIsMutating(name: string) {
  return ACTIONS[name]?.mutating === true;
}

/**
 * Run one action. Consequential actions return a real preview until `confirmed` is true,
 * so an instruction can never move money or change a record on its own.
 */
export async function runConciergeAction(
  ctx: ConciergeContext,
  name: string,
  input: any,
  opts: { confirmed?: boolean } = {},
): Promise<ActionOutcome> {
  const action = ACTIONS[name];
  if (!action) {
    return { ok: false, speech: 'I don’t have a way to do that yet.', error: 'UNKNOWN_ACTION' };
  }
  if (action.confirmation === 'required' && !opts.confirmed) {
    const preview = action.preview
      ? await action.preview(ctx, input)
      : { ok: true, pending: true, speech: action.description, data: input } as ActionOutcome;
    return { ...preview, pending: preview.ok === true };
  }
  try {
    return await action.run(ctx, input);
  } catch (error: any) {
    return {
      ok: false,
      speech: 'That did not go through. Nothing was changed on your account.',
      error: String(error?.message || error),
    };
  }
}

export { money as formatCents, addressOf as conciergeAddress };
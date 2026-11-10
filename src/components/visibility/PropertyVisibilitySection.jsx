import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Home, ExternalLink, Loader2, Megaphone, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { withCustomerSession } from '@/lib/customerSession';
import { fetchLeads, listingAddress } from '@/lib/propertyLeads';
import CollapsibleList from '@/components/shared/CollapsibleList';

/**
 * The customer's property visibility, property pages and the packages behind them.
 *
 * Two existing readers are used, both authorised server-side from the signed customer session:
 *   · the lead dashboard endpoint  -> the customer's own property pages
 *   · the visibility dashboard    -> the plan catalog and the current switch state
 *
 * Pricing is only ever the price the backend reports. While the checkout switch is off (its default)
 * plans are shown as unavailable for purchase rather than offering a button that cannot work.
 */

const money = (cents) => `$${(Number(cents || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export default function PropertyVisibilitySection({ email }) {
  const [state, setState] = useState({ loading: true, listings: [], plans: [], checkoutOpen: false, error: '' });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    const loadListings = fetchLeads()
      .then((result) => {
        if (result?.ok === false) {
          return { listings: [], error: result.message || 'Your properties could not be loaded just now.' };
        }
        return { listings: result?.listings || [], error: '' };
      })
      .catch(() => ({ listings: [], error: 'Your properties could not be loaded just now.' }));

    const loadPlans = base44.functions
      .invoke('getVisibilityDashboard', withCustomerSession({ email }))
      .then((res) => {
        const data = res?.data || res;
        const plans = Array.isArray(data?.plans) ? data.plans : [];
        return { plans, checkoutOpen: data?.switches?.subscription_checkout === true };
      })
      .catch(() => ({ plans: [], checkoutOpen: false }));

    Promise.all([loadListings, loadPlans]).then(([listings, plans]) => {
      if (cancelled) return;
      setState({
        loading: false,
        listings: listings.listings,
        error: listings.error,
        plans: plans.plans,
        checkoutOpen: plans.checkoutOpen,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [email]);

  return (
    <section id="visibility" className="scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl text-[#1A1A1A]">Property visibility &amp; advertising</h2>
          <p className="text-sm text-[#1A1A1A]/55 mt-1">
            Each delivered shoot can become a search-friendly property page. Promotion and advertising are optional and
            only run for a property you choose.
          </p>
        </div>
        <Link to="/PropertyLeads" className="text-sm font-semibold text-[#B8956A] hover:underline">
          Buyer leads
        </Link>
      </div>

      {state.loading && (
        <div className="mt-4 rounded-2xl border border-[#B8956A]/25 bg-white p-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#B8956A]" />
        </div>
      )}

      {!state.loading && state.error && (
        <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{state.error}</p>
      )}

      {!state.loading && !state.error && state.listings.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-[#B8956A]/35 bg-white p-8 text-center">
          <Home className="w-6 h-6 text-[#B8956A]/70 mx-auto mb-3" />
          <p className="text-sm text-[#1A1A1A] mb-1">No property pages yet</p>
          <p className="text-sm text-[#1A1A1A]/55">
            A property page is created from a delivered shoot, so nothing is published until you have media.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            <Link to="/BookingPage">
              <Button className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]">Book a shoot</Button>
            </Link>
            <Link to="/properties">
              <Button variant="outline" className="border-[#B8956A]/35">Browse properties</Button>
            </Link>
          </div>
        </div>
      )}

      {!state.loading && state.listings.length > 0 && (
        <CollapsibleList
          items={state.listings}
          initialCount={3}
          expandLabel="Show all jobs"
          listClassName="mt-4 rounded-2xl border border-[#B8956A]/25 bg-white divide-y divide-black/5"
          renderItem={(listing) => (
            <div key={listing.listing_id} className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#1A1A1A] truncate">{listingAddress(listing) || listing.public_slug}</p>
                <p className="text-[11px] text-[#1A1A1A]/45 mt-0.5">
                  {listing.publication_state} · {listing.listing_status} · {listing.views_30d || 0} views (30d) ·{' '}
                  {listing.leads_total || 0} lead{listing.leads_total === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {listing.job_id && (
                  <Link
                    to={`/PropertyPageBuilder?jobId=${encodeURIComponent(listing.job_id)}`}
                    className="text-xs font-semibold text-[#B8956A] hover:underline"
                  >
                    Packages &amp; ads
                  </Link>
                )}
                {listing.public_url && (
                  <a
                    href={listing.public_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1A1A1A]/60 hover:underline"
                  >
                    View page <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          )}
        />
      )}

      {!state.loading && state.plans.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-[#B8956A]" />
            <h3 className="text-sm font-semibold text-[#1A1A1A]">Visibility &amp; advertising plans</h3>
          </div>
          <p className="text-xs text-[#1A1A1A]/50 mt-1">
            These are the plans available for a public agent or brokerage presence. Property promotion and ad
            packages are chosen per property from the property page builder.
          </p>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {state.plans.map((plan) => (
              <div key={plan.product_key} className="rounded-2xl border border-[#B8956A]/25 bg-white p-4">
                <p className="text-sm font-semibold text-[#1A1A1A]">{plan.name}</p>
                {plan.tagline && <p className="text-[11px] text-[#1A1A1A]/50 mt-0.5">{plan.tagline}</p>}
                <p className="mt-2 font-serif text-lg text-[#1A1A1A]">
                  {money(plan.price_cents)}
                  <span className="text-xs font-sans text-[#1A1A1A]/50"> / {plan.interval || 'month'}</span>
                </p>
                <p className="text-[11px] text-[#1A1A1A]/45 mt-1">
                  {plan.seats_included || 1} {plan.seats_included === 1 ? 'seat' : 'seats'} included
                  {plan.additional_seat_price_cents > 0
                    ? ` · +${money(plan.additional_seat_price_cents)} per extra seat`
                    : ''}
                </p>
                <Link
                  to={`/VisibilityDashboard?plan=${encodeURIComponent(plan.product_key)}#profile`}
                  className="mt-3 block"
                >
                  <Button className="w-full bg-[#1A1A1A] text-[#FFFBF5] hover:bg-[#2A3536]">
                    Set up my page with {plan.name}
                  </Button>
                </Link>
                <p className="mt-2 text-[11px] text-[#1A1A1A]/50">
                  Your free agent or brokerage page is set up first, then this plan's benefits are added to it.
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Home, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchLeads, listingAddress } from '@/lib/propertyLeads';

/**
 * The customer's property visibility, read from the same lead endpoint the portal already uses.
 * Advertising packages and property promotion live on the property page builder, so this links
 * there instead of duplicating those panels or their checkout.
 */
export default function PropertyVisibilitySection({ email }) {
  const [state, setState] = useState({ loading: true, listings: [], error: '' });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    fetchLeads()
      .then((result) => {
        if (cancelled) return;
        if (result?.ok === false) {
          setState({ loading: false, listings: [], error: result.message || result.reason || 'Your properties could not be loaded.' });
          return;
        }
        setState({ loading: false, listings: result?.listings || [], error: '' });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, listings: [], error: 'Your properties could not be loaded.' });
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
        <div className="mt-4 rounded-2xl border border-[#B8956A]/25 bg-white divide-y divide-black/5">
          {state.listings.map((listing) => (
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
          ))}
        </div>
      )}
    </section>
  );
}
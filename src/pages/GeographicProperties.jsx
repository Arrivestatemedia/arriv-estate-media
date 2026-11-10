import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, MapPin } from 'lucide-react';
import { fetchMarket, formatAmount } from '@/lib/professionalVisibility';
import useSeoMeta, { useNotFoundStatus } from '@/lib/seoMeta';

export default function GeographicProperties() {
  const { marketSlug } = useParams();
  const [state, setState] = useState({ loading: true, missing: false, market: null, listings: [], agents: [], seo: null });

  useNotFoundStatus(!state.loading && state.missing);
  useSeoMeta(state.seo);

  useEffect(() => {
    let active = true;
    setState({ loading: true, missing: false, market: null, listings: [], agents: [], seo: null });
    fetchMarket(marketSlug)
      .then((result) => {
        if (!active) return;
        if (!result?.ok) {
          setState({ loading: false, missing: true, market: null, listings: [], agents: [], seo: null });
          return;
        }
        setState({
          loading: false,
          missing: false,
          market: result.market,
          listings: result.listings || [],
          agents: result.agents || [],
          seo: result.seo,
        });
      })
      .catch(() => active && setState({ loading: false, missing: true, market: null, listings: [], agents: [], seo: null }));
    return () => {
      active = false;
    };
  }, [marketSlug]);

  if (state.loading) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-[#1A1A1A]/15 border-t-[#B8956A] rounded-full animate-spin" />
      </div>
    );
  }

  if (state.missing || !state.market) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="font-serif text-3xl text-[#1A1A1A]">No property page for this area yet</h1>
          <p className="text-[#1A1A1A]/60 mt-3">
            We publish a city page only when it has genuine published properties to show. Arriv does not create empty
            location pages.
          </p>
          <Link to="/properties" className="inline-flex items-center gap-1 text-[#B8956A] mt-5">
            Browse all properties <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  const market = state.market;

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Link to="/properties" className="inline-flex items-center gap-1 text-sm text-[#1A1A1A]/50 hover:text-[#1A1A1A]">
          <ArrowLeft className="w-4 h-4" />
          All properties
        </Link>

        <p className="text-xs uppercase tracking-[0.2em] text-[#B8956A] mt-6">Local discovery</p>
        <h1 className="font-serif text-4xl md:text-5xl text-[#1A1A1A] mt-2">{market.title}</h1>
        <p className="text-[#1A1A1A]/60 mt-3 max-w-2xl flex items-center gap-1">
          <MapPin className="w-4 h-4 text-[#B8956A]" />
          {market.listings_count} published {market.listings_count === 1 ? 'property' : 'properties'}
          {market.intro ? ` · ${market.intro}` : ''}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
          {state.listings.map((listing) => (
            <Link
              key={listing.listing_id}
              to={`/properties/${listing.public_slug}`}
              className="rounded-2xl border border-[#1A1A1A]/10 bg-white p-5 hover:border-[#B8956A] transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-[#1A1A1A]/40">{listing.listing_status || 'Active'}</p>
                {listing.placement_label && (
                  <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#B8956A]/15 text-[#8C6F45]">
                    {listing.placement_label}
                  </span>
                )}
              </div>
              <h2 className="font-serif text-xl text-[#1A1A1A] mt-2 leading-snug">{listing.property_address}</h2>
              <p className="text-sm text-[#1A1A1A]/50 mt-1">{[listing.city, listing.state].filter(Boolean).join(', ')}</p>
              <p className="text-[#8C6F45] mt-3">
                {listing.listing_price ? formatAmount(listing.listing_price) : 'Price not published'}
              </p>
              <p className="text-xs text-[#1A1A1A]/45 mt-1">
                {[listing.bedrooms ? `${listing.bedrooms} bd` : '', listing.bathrooms ? `${listing.bathrooms} ba` : '', listing.square_footage ? `${listing.square_footage} sqft` : '']
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </Link>
          ))}
        </div>

        {state.agents.length > 0 && (
          <div className="mt-12">
            <h2 className="font-serif text-2xl text-[#1A1A1A]">Agents in {market.city}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              {state.agents.map((agent) => (
                <Link key={agent.profile_id} to={agent.path} className="rounded-xl border border-[#1A1A1A]/10 bg-white p-4 hover:border-[#B8956A]">
                  <p className="font-medium text-[#1A1A1A]">{agent.display_name}</p>
                  <p className="text-xs text-[#1A1A1A]/50 mt-0.5">{agent.brokerage_name || agent.headline || 'Real estate agent'}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-[#1A1A1A]/40 mt-10 max-w-3xl">
          Arriv Estate Media is a real estate media company. This page lists properties Arriv photographed and that the
          owner published, plus professionals who chose to publish a profile. Arriv is not the listing brokerage and
          does not act as your agent. All housing is offered without regard to race, color, religion, sex, disability,
          familial status or national origin.
        </p>
      </div>
    </div>
  );
}
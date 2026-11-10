import React, { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BadgeCheck, MapPin, Phone } from 'lucide-react';
import ProfileInquiryForm from '@/components/visibility/ProfileInquiryForm';
import { fetchProfessionalProfile, formatPrice } from '@/lib/professionalVisibility';
import useSeoMeta, { useNotFoundStatus } from '@/lib/seoMeta';

export default function PublicProfessionalProfile() {
  const { slug } = useParams();
  const location = useLocation();
  const profileType = location.pathname.startsWith('/brokerages') ? 'brokerage' : 'agent';
  const [state, setState] = useState({ loading: true, missing: false, profile: null, seo: null });

  useNotFoundStatus(!state.loading && state.missing);
  useSeoMeta(state.seo);

  useEffect(() => {
    let active = true;
    setState({ loading: true, missing: false, profile: null, seo: null });
    fetchProfessionalProfile({ profileType, slug })
      .then((result) => {
        if (!active) return;
        if (!result?.ok || !result.profile) {
          setState({ loading: false, missing: true, profile: null, seo: null });
          return;
        }
        setState({ loading: false, missing: false, profile: result.profile, seo: result.seo });
      })
      .catch(() => active && setState({ loading: false, missing: true, profile: null, seo: null }));
    return () => {
      active = false;
    };
  }, [profileType, slug]);

  if (state.loading) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-[#1A1A1A]/15 border-t-[#B8956A] rounded-full animate-spin" />
      </div>
    );
  }

  if (state.missing || !state.profile) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="font-serif text-3xl text-[#1A1A1A]">This profile isn’t available</h1>
          <p className="text-[#1A1A1A]/60 mt-3">
            It may not be published yet, or the link may have changed. Arriv only shows profiles their owner has
            authorized and we have approved.
          </p>
          <Link to="/agents" className="inline-flex items-center gap-1 text-[#B8956A] mt-5">
            Browse agents <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  const profile = state.profile;
  const listings = profile.listings || [];
  const roster = profile.roster || [];

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link to={profileType === 'brokerage' ? '/brokerages' : '/agents'} className="inline-flex items-center gap-1 text-sm text-[#1A1A1A]/50 hover:text-[#1A1A1A]">
          <ArrowLeft className="w-4 h-4" />
          All {profileType === 'brokerage' ? 'brokerages' : 'agents'}
        </Link>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="flex items-start gap-5">
              {profile.photo_url || profile.logo_url ? (
                <img
                  src={profile.photo_url || profile.logo_url}
                  alt={profile.display_name}
                  className="w-20 h-20 rounded-2xl object-cover border border-[#1A1A1A]/10"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-[#B8956A]/15 flex items-center justify-center font-serif text-2xl text-[#8C6F45]">
                  {(profile.display_name || '?').slice(0, 1)}
                </div>
              )}
              <div>
                <h1 className="font-serif text-3xl md:text-4xl text-[#1A1A1A]">{profile.display_name}</h1>
                {profile.headline && <p className="text-[#1A1A1A]/60 mt-1">{profile.headline}</p>}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-[#1A1A1A]/60">
                  {(profile.city || profile.state) && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-4 h-4 text-[#B8956A]" />
                      {[profile.city, profile.state].filter(Boolean).join(', ')}
                    </span>
                  )}
                  {profile.contact_phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="w-4 h-4 text-[#B8956A]" />
                      {profile.contact_phone}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {(profile.brokerage_name || profile.license_number) && (
              <div className="mt-5 flex flex-wrap gap-2">
                {profile.brokerage_name && (
                  <span className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-white border border-[#1A1A1A]/10 text-[#1A1A1A]/70">
                    <BadgeCheck className="w-3.5 h-3.5 text-[#B8956A]" />
                    {profile.brokerage_name} (affiliation verified)
                  </span>
                )}
                {profile.license_number && (
                  <span className="text-xs px-3 py-1.5 rounded-full bg-white border border-[#1A1A1A]/10 text-[#1A1A1A]/70">
                    Licence {profile.license_number}{profile.license_state ? ` (${profile.license_state})` : ''} · verified
                  </span>
                )}
              </div>
            )}

            {profile.bio && (
              <div className="mt-8">
                <h2 className="font-serif text-xl text-[#1A1A1A]">About</h2>
                <p className="text-[#1A1A1A]/75 mt-2 leading-relaxed whitespace-pre-line">{profile.bio}</p>
              </div>
            )}

            {(profile.service_areas || []).length > 0 && (
              <div className="mt-8">
                <h2 className="font-serif text-xl text-[#1A1A1A]">Service areas</h2>
                <div className="flex flex-wrap gap-2 mt-2">
                  {profile.service_areas.map((area) => (
                    <span key={area} className="text-xs px-3 py-1.5 rounded-full bg-white border border-[#1A1A1A]/10 text-[#1A1A1A]/70">
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {roster.length > 0 && (
              <div className="mt-8">
                <h2 className="font-serif text-xl text-[#1A1A1A]">Agents</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  {roster.map((agent) => (
                    <Link key={agent.path} to={agent.path} className="rounded-xl border border-[#1A1A1A]/10 bg-white p-4 hover:border-[#B8956A]">
                      <p className="font-medium text-[#1A1A1A]">{agent.display_name}</p>
                      <p className="text-xs text-[#1A1A1A]/50 mt-0.5">{agent.headline || 'Real estate agent'}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-10">
              <h2 className="font-serif text-xl text-[#1A1A1A]">Properties</h2>
              {listings.length === 0 ? (
                <p className="text-sm text-[#1A1A1A]/55 mt-2">
                  No published properties are attached to this profile right now.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  {listings.map((listing) => (
                    <Link
                      key={listing.listing_id}
                      to={`/properties/${listing.public_slug}`}
                      className="rounded-xl border border-[#1A1A1A]/10 bg-white p-4 hover:border-[#B8956A]"
                    >
                      <p className="font-medium text-[#1A1A1A]">{listing.property_address}</p>
                      <p className="text-xs text-[#1A1A1A]/50 mt-0.5">
                        {[listing.city, listing.state].filter(Boolean).join(', ')}
                      </p>
                      <p className="text-sm text-[#8C6F45] mt-2">
                        {listing.listing_price ? formatPrice(listing.listing_price) : 'Price not published'}
                        {listing.bedrooms ? ` · ${listing.bedrooms} bd` : ''}
                        {listing.bathrooms ? ` · ${listing.bathrooms} ba` : ''}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-6">
              <ProfileInquiryForm
                profileType={profileType}
                slug={profile.slug}
                displayName={profile.display_name}
                disclosures={profile.disclosures}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
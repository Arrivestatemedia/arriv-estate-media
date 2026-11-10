import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, MapPin, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { fetchDirectory } from '@/lib/professionalVisibility';
import useSeoMeta, { useNotFoundStatus } from '@/lib/seoMeta';

const TABS = [
  { key: 'agent', label: 'Agents', path: '/agents' },
  { key: 'brokerage', label: 'Brokerages', path: '/brokerages' },
];

export default function AgentDirectory({ profileType = 'agent' }) {
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState({ loading: true, profiles: [], total: 0, disclosures: [] });
  const [query, setQuery] = useState(params.get('q') || '');

  useNotFoundStatus(false);

  useEffect(() => {
    let active = true;
    setState((prev) => ({ ...prev, loading: true }));
    fetchDirectory({ profileType, q: params.get('q') || '', state: params.get('state') || '' })
      .then((result) => {
        if (!active) return;
        setState({ loading: false, profiles: result.profiles || [], total: result.total || 0, disclosures: result.disclosures || [] });
      })
      .catch(() => active && setState({ loading: false, profiles: [], total: 0, disclosures: [] }));
    return () => {
      active = false;
    };
  }, [profileType, params]);

  useSeoMeta({
    title: profileType === 'brokerage' ? 'Real estate brokerages on Arriv Estate Media' : 'Real estate agents on Arriv Estate Media',
    meta_description:
      profileType === 'brokerage'
        ? 'Browse real estate brokerages with a public profile on Arriv Estate Media and contact the one you choose.'
        : 'Browse real estate agents with a public profile on Arriv Estate Media, see the properties they represent and contact the agent directly.',
    canonical_url: `${window.location.origin}${profileType === 'brokerage' ? '/brokerages' : '/agents'}`,
    robots: 'index, follow',
  });

  const submitSearch = (event) => {
    event.preventDefault();
    const next = new URLSearchParams(params);
    if (query.trim()) next.set('q', query.trim());
    else next.delete('q');
    setParams(next);
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <p className="text-xs uppercase tracking-[0.2em] text-[#B8956A]">Arriv Estate Media</p>
        <h1 className="font-serif text-4xl md:text-5xl text-[#1A1A1A] mt-2">
          {profileType === 'brokerage' ? 'Brokerages' : 'Agents'}
        </h1>
        <p className="text-[#1A1A1A]/60 mt-3 max-w-2xl">
          Public profiles of real estate professionals who work with Arriv. Arriv is a media company: we host these
          profiles, we do not represent you in a transaction.
        </p>

        <div className="flex flex-wrap items-center gap-2 mt-6">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              to={tab.path}
              className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                tab.key === profileType
                  ? 'bg-[#1A1A1A] text-[#FFFBF5] border-[#1A1A1A]'
                  : 'bg-white text-[#1A1A1A]/70 border-[#1A1A1A]/10 hover:border-[#B8956A]'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <form onSubmit={submitSearch} className="mt-6 flex gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#1A1A1A]/35 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, city or service area"
              className="pl-9 bg-white"
            />
          </div>
        </form>

        {state.loading ? (
          <div className="mt-16 flex justify-center">
            <div className="w-7 h-7 border-2 border-[#1A1A1A]/15 border-t-[#B8956A] rounded-full animate-spin" />
          </div>
        ) : state.profiles.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-[#1A1A1A]/10 bg-white p-8 text-center">
            <h2 className="font-serif text-xl text-[#1A1A1A]">No published profiles here yet</h2>
            <p className="text-sm text-[#1A1A1A]/60 mt-2">
              Profiles appear here once their owner authorizes publication and Arriv approves them. We do not list
              placeholder or unverified profiles.
            </p>
            <Link to="/properties" className="inline-flex items-center gap-1 text-sm text-[#B8956A] mt-4">
              Browse properties <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <>
            <p className="text-xs text-[#1A1A1A]/45 mt-6">{state.total} published profile{state.total === 1 ? '' : 's'}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {state.profiles.map((profile) => (
                <Link
                  key={profile.profile_id}
                  to={profile.path}
                  className="group rounded-2xl border border-[#1A1A1A]/10 bg-white p-5 hover:border-[#B8956A] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {profile.photo_url || profile.logo_url ? (
                      <img
                        src={profile.photo_url || profile.logo_url}
                        alt={profile.display_name}
                        className="w-12 h-12 rounded-full object-cover border border-[#1A1A1A]/10"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[#B8956A]/15 flex items-center justify-center font-serif text-lg text-[#8C6F45]">
                        {(profile.display_name || '?').slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="font-medium text-[#1A1A1A] truncate">{profile.display_name}</h3>
                      <p className="text-xs text-[#1A1A1A]/50 truncate">{profile.brokerage_name || profile.headline || ''}</p>
                    </div>
                  </div>
                  {(profile.city || profile.state) && (
                    <p className="text-sm text-[#1A1A1A]/60 mt-3 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#B8956A]" />
                      {[profile.city, profile.state].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {profile.placement_label && (
                    <p className="text-[11px] uppercase tracking-wide text-[#8C6F45] mt-3">{profile.placement_label}</p>
                  )}
                  <span className="inline-flex items-center gap-1 text-sm text-[#B8956A] mt-3 group-hover:gap-2 transition-all">
                    View profile <ArrowRight className="w-4 h-4" />
                  </span>
                </Link>
              ))}
            </div>
            <div className="mt-8 space-y-2">
              <p className="text-[11px] text-[#1A1A1A]/40">
                Priority placement is a paid subscription benefit and does not reflect an endorsement, ranking of quality
                or any claim about results.
              </p>
              {state.disclosures.slice(0, 2).map((line) => (
                <p key={line} className="text-[11px] text-[#1A1A1A]/40">{line}</p>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
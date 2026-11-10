import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { adminVisibility, formatDate, formatPrice } from '@/lib/professionalVisibility';

const STATE_STYLES = {
  PUBLISHED: 'bg-[#B8956A]/15 text-[#8C6F45]',
  READY_FOR_REVIEW: 'bg-amber-100 text-amber-800',
  DRAFT: 'bg-slate-100 text-slate-700',
  UNPUBLISHED: 'bg-slate-100 text-slate-700',
  ARCHIVED: 'bg-slate-100 text-slate-500',
};

export default function AdminVisibility() {
  const [state, setState] = useState({ loading: true, overview: null, plans: [], profiles: [], markets: [], subscriptions: [], inquiries: [] });
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [marketForm, setMarketForm] = useState({ city: '', state: '', intro: '', minimum_published_listings: 3, indexing: 'noindex' });

  const run = useCallback(async (label, fn) => {
    setBusy(label);
    setNotice('');
    try {
      const result = await fn();
      if (result?.ok === false) setNotice(result.error || 'That action could not be completed.');
      return result;
    } catch (error) {
      setNotice('That action could not be completed.');
      return null;
    } finally {
      setBusy('');
    }
  }, []);

  const load = useCallback(async () => {
    const [overview, plans, profiles, markets, subscriptions, inquiries] = await Promise.all([
      adminVisibility('overview').catch(() => null),
      adminVisibility('plans').catch(() => ({ plans: [] })),
      adminVisibility('profiles').catch(() => ({ profiles: [] })),
      adminVisibility('markets').catch(() => ({ markets: [] })),
      adminVisibility('subscriptions').catch(() => ({ subscriptions: [] })),
      adminVisibility('inquiries').catch(() => ({ inquiries: [] })),
    ]);
    setState({
      loading: false,
      overview,
      plans: plans?.plans || [],
      profiles: profiles?.profiles || [],
      markets: markets?.markets || [],
      subscriptions: subscriptions?.subscriptions || [],
      inquiries: inquiries?.inquiries || [],
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSwitch = async (name, enabled) => {
    if (!window.confirm(`Turn ${enabled ? 'ON' : 'OFF'} ${name.replace(/_/g, ' ')}? This changes live behaviour immediately.`)) return;
    await run('switch', () => adminVisibility('set_switch', { switchName: name, enabled, confirm: true }));
    await load();
  };

  const publishMarket = async (marketId) => {
    const result = await run('market', () => adminVisibility('market_publish', { marketId }));
    if (result?.ok === false) setNotice(result.error || 'This market cannot be published yet.');
    await load();
  };

  const saveMarket = async () => {
    await run('market-save', () => adminVisibility('save_market', marketForm));
    await load();
  };

  if (state.loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-[#B8956A] rounded-full animate-spin" />
      </div>
    );
  }

  const overview = state.overview || {};
  const counts = overview.counts || {};
  const switches = overview.switches || [];
  const integrations = overview.integrations || {};

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <p className="text-xs uppercase tracking-[0.2em] text-[#B8956A]">Administration</p>
      <h1 className="font-serif text-3xl md:text-4xl text-[#1A1A1A] mt-1">Visibility &amp; SEO</h1>
      <p className="text-sm text-[#1A1A1A]/55 mt-1">Profiles, subscriptions, geographic pages and lead routing.</p>

      {notice && <p className="mt-4 text-sm text-red-600">{notice}</p>}

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="profiles">Profiles</TabsTrigger>
          <TabsTrigger value="markets">Markets</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Profiles published', counts.profiles_published],
              ['Awaiting review', counts.profiles_pending_review],
              ['Active subscriptions', counts.subscriptions_active],
              ['Past due', counts.subscriptions_past_due],
              ['Markets published', counts.markets_published],
              ['Inquiries', counts.inquiries_total],
              ['Failed deliveries', counts.inquiries_failed],
              ['Unverified affiliations', counts.profiles_unverified_affiliation],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[#1A1A1A]/10 bg-white p-4">
                <p className="text-xs text-[#1A1A1A]/45">{label}</p>
                <p className="font-serif text-2xl text-[#1A1A1A] mt-1">{Number(value || 0)}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-[#1A1A1A]/10 bg-white p-5">
            <h2 className="font-serif text-xl text-[#1A1A1A]">Activation switches</h2>
            <p className="text-xs text-[#1A1A1A]/45 mt-1">Every switch is off unless you turn it on here, with confirmation.</p>
            <div className="mt-4 space-y-3">
              {switches.map((item) => (
                <div key={item.name} className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1A1A1A]/5 pb-3 last:border-0">
                  <div className="max-w-xl">
                    <p className="text-sm font-medium text-[#1A1A1A]">{item.label}</p>
                    <p className="text-xs text-[#1A1A1A]/50 mt-0.5">{item.description}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={item.enabled ? 'destructive' : 'outline'}
                    disabled={busy === 'switch'}
                    onClick={() => toggleSwitch(item.name, !item.enabled)}
                  >
                    {item.enabled ? 'Turn off' : 'Turn on'}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#1A1A1A]/10 bg-white p-5">
            <h2 className="font-serif text-xl text-[#1A1A1A]">Integrations</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-sm">
              <p className={integrations.stripe_configured ? 'text-[#1A1A1A]' : 'text-red-600'}>
                Stripe: {integrations.stripe_configured ? 'credentials present' : 'not configured'}
              </p>
              <p className={integrations.brevo_configured ? 'text-[#1A1A1A]' : 'text-red-600'}>
                Brevo: {integrations.brevo_configured ? 'credentials present' : 'not configured'}
              </p>
              <p className={integrations.edge_purge_configured ? 'text-[#1A1A1A]' : 'text-amber-700'}>
                Edge purge: {integrations.edge_purge_configured ? 'configured' : 'missing'}
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="plans" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {state.plans.map((plan) => (
              <div key={plan.product_key} className="rounded-2xl border border-[#1A1A1A]/10 bg-white p-5">
                <h3 className="font-serif text-xl text-[#1A1A1A]">{plan.name}</h3>
                <p className="text-2xl text-[#1A1A1A] mt-2">{formatPrice(plan.price_cents)}<span className="text-sm text-[#1A1A1A]/45">/mo</span></p>
                <p className="text-xs text-[#1A1A1A]/50 mt-1">Seats included: {plan.seats_included} · policy: {plan.seat_policy}</p>
                <p className={`text-xs mt-2 ${plan.stripe_price_id ? 'text-[#8C6F45]' : 'text-amber-700'}`}>
                  Stripe price: {plan.stripe_price_id || 'not configured'}
                </p>
                <p className="text-[11px] text-[#1A1A1A]/40 mt-2">Directory weight: {plan.entitlements?.directory_priority || 0}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#1A1A1A]/45 mt-4">
            Prices and seat allowances are read from the product records. Changing them here affects new subscriptions only;
            existing subscriptions keep the price they agreed.
          </p>
        </TabsContent>

        <TabsContent value="profiles" className="mt-6">
          <div className="rounded-2xl border border-[#1A1A1A]/10 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#FFFBF5] text-left text-xs uppercase tracking-wide text-[#1A1A1A]/45">
                <tr>
                  <th className="px-4 py-3">Profile</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Affiliation</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1A]/5">
                {state.profiles.map((profile) => (
                  <tr key={profile.profile_id}>
                    <td className="px-4 py-3">
                      <p className="text-[#1A1A1A]">{profile.display_name}</p>
                      <p className="text-xs text-[#1A1A1A]/45">{profile.owner_email}</p>
                    </td>
                    <td className="px-4 py-3 text-[#1A1A1A]/60">{profile.profile_type}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${STATE_STYLES[profile.publication_state] || 'bg-slate-100 text-slate-700'}`}>
                        {profile.publication_state}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {profile.profile_type === 'brokerage' ? '—' : profile.brokerage_affiliation_verified ? 'verified' : 'unverified'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" disabled={busy === 'approve'} onClick={async () => {
                          await run('approve', () => adminVisibility('admin_approve', { profileId: profile.profile_id }));
                          await load();
                        }}>Approve</Button>
                        <Button size="sm" disabled={busy === 'publish'} onClick={async () => {
                          const result = await run('publish', () => adminVisibility('admin_publish', { profileId: profile.profile_id }));
                          if (result?.blockers?.length) setNotice(result.blockers.join(' '));
                          await load();
                        }}>Publish</Button>
                        {profile.profile_type === 'agent' && !profile.brokerage_affiliation_verified && (
                          <Button size="sm" variant="outline" onClick={async () => {
                            await run('verify', () => adminVisibility('admin_verify_brokerage', { profileId: profile.profile_id, verified: true, note: 'Verified by administrator' }));
                            await load();
                          }}>Verify brokerage</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[#1A1A1A]/45 mt-3">
            Publishing needs the owner's authorization, your approval and the publication switch. Publish is refused with a
            list of what is still missing.
          </p>
        </TabsContent>

        <TabsContent value="markets" className="mt-6 space-y-6">
          <div className="rounded-2xl border border-[#1A1A1A]/10 bg-white p-5">
            <h2 className="font-serif text-xl text-[#1A1A1A]">Add or update a market</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <div>
                <Label>City</Label>
                <Input value={marketForm.city} onChange={(e) => setMarketForm({ ...marketForm, city: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>State</Label>
                <Input value={marketForm.state} maxLength={2} onChange={(e) => setMarketForm({ ...marketForm, state: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Minimum published properties</Label>
                <Input type="number" value={marketForm.minimum_published_listings} onChange={(e) => setMarketForm({ ...marketForm, minimum_published_listings: Number(e.target.value) })} className="mt-1" />
              </div>
            </div>
            <div className="mt-3">
              <Label>Factual introduction</Label>
              <Textarea rows={3} value={marketForm.intro} onChange={(e) => setMarketForm({ ...marketForm, intro: e.target.value })} className="mt-1" />
            </div>
            <Button className="mt-3 bg-[#1A1A1A] text-[#FFFBF5] hover:bg-[#2A3536]" disabled={busy === 'market-save'} onClick={saveMarket}>
              {busy === 'market-save' ? 'Saving…' : 'Save market'}
            </Button>
          </div>

          <div className="rounded-2xl border border-[#1A1A1A]/10 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#FFFBF5] text-left text-xs uppercase tracking-wide text-[#1A1A1A]/45">
                <tr>
                  <th className="px-4 py-3">Market</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Eligibility</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1A]/5">
                {state.markets.map((market) => {
                  const eligibility = market.eligibility || {};
                  return (
                    <tr key={market.market_id}>
                      <td className="px-4 py-3">{market.city}, {market.state}</td>
                      <td className="px-4 py-3 text-[#1A1A1A]/60">{market.status} · {market.indexing}</td>
                      <td className="px-4 py-3 text-xs text-[#1A1A1A]/55">
                        {eligibility.eligible ? 'eligible' : eligibility.reason || 'not evaluated'} · {Number(eligibility.published_listings || 0)} listings
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button size="sm" disabled={busy === 'market'} onClick={() => publishMarket(market.market_id)}>Publish</Button>
                          <Button size="sm" variant="outline" onClick={async () => {
                            await run('market', () => adminVisibility('market_unpublish', { marketId: market.market_id }));
                            await load();
                          }}>Unpublish</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="subscriptions" className="mt-6">
          <div className="rounded-2xl border border-[#1A1A1A]/10 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#FFFBF5] text-left text-xs uppercase tracking-wide text-[#1A1A1A]/45">
                <tr>
                  <th className="px-4 py-3">Profile</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Period end</th>
                  <th className="px-4 py-3">Owner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1A]/5">
                {state.subscriptions.map((sub) => (
                  <tr key={sub.subscription_id}>
                    <td className="px-4 py-3 text-[#1A1A1A]/70">{sub.profile_id}</td>
                    <td className="px-4 py-3">{String(sub.plan_key || '').replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">{sub.status}{sub.cancel_at_period_end ? ' · cancelling' : ''}</td>
                    <td className="px-4 py-3 text-[#1A1A1A]/60">{formatDate(sub.current_period_end)}</td>
                    <td className="px-4 py-3 text-xs text-[#1A1A1A]/50">{sub.owner_email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="leads" className="mt-6">
          <div className="rounded-2xl border border-[#1A1A1A]/10 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#FFFBF5] text-left text-xs uppercase tracking-wide text-[#1A1A1A]/45">
                <tr>
                  <th className="px-4 py-3">Received</th>
                  <th className="px-4 py-3">From</th>
                  <th className="px-4 py-3">Routed to</th>
                  <th className="px-4 py-3">Delivery</th>
                  <th className="px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1A]/5">
                {state.inquiries.map((lead) => (
                  <tr key={lead.inquiry_id}>
                    <td className="px-4 py-3 text-[#1A1A1A]/60">{formatDate(lead.created_at)}</td>
                    <td className="px-4 py-3">{lead.name}<span className="text-xs text-[#1A1A1A]/45 block">{lead.email}</span></td>
                    <td className="px-4 py-3 text-xs text-[#1A1A1A]/60">{lead.routed_to_email}</td>
                    <td className="px-4 py-3 text-xs">{String(lead.notification_status || '').replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-xs text-[#1A1A1A]/50">{lead.channel || 'direct'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
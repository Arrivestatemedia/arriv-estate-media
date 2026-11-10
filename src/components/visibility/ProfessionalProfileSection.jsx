import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ExternalLink, Eye, Inbox, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PlanCard from '@/components/visibility/PlanCard';
import SeatManager from '@/components/visibility/SeatManager';
import {
  fetchVisibilityDashboard,
  subscriptionAction,
  profileAction,
  formatDate,
  formatPrice,
  PLAN_STATE_COPY,
} from '@/lib/professionalVisibility';

const FIELD_BASE = {
  display_name: '',
  headline: '',
  bio: '',
  contact_email: '',
  contact_phone: '',
  city: '',
  state: '',
  brokerage_name: '',
  service_areas: '',
};

/**
 * The optional public agent/brokerage profile, its plan and its leads.
 *
 * A professional profile is never a prerequisite for billing, membership or property visibility, so
 * this section opens with an explicit "optional" frame and only shows the profile-creation form
 * when the customer asks for one.
 */
export default function ProfessionalProfileSection() {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [form, setForm] = useState(FIELD_BASE);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const location = useLocation();
  // A plan chosen on the billing page arrives here, so the free page is set up first and the paid
  // plan is then attached to it rather than the other way round.
  const requestedPlan = useMemo(
    () => new URLSearchParams(location.search).get('plan') || '',
    [location.search],
  );
  const [tab, setTab] = useState(requestedPlan ? 'plan' : 'overview');

  useEffect(() => {
    if (requestedPlan) setTab('plan');
  }, [requestedPlan]);

  const load = useCallback(async () => {
    try {
      const data = await fetchVisibilityDashboard();
      setState({ loading: false, data, error: '' });
      if (data?.profile) {
        setForm((prev) => ({
          ...prev,
          display_name: data.profile.display_name || '',
          headline: data.profile.headline || '',
          bio: data.profile.bio || '',
          contact_email: data.profile.contact_email || '',
          contact_phone: data.profile.contact_phone || '',
          city: data.profile.city || '',
          state: data.profile.state || '',
          brokerage_name: data.profile.brokerage_name || '',
          service_areas: (data.profile.service_areas || []).join(', '),
        }));
      }
    } catch (error) {
      setState({ loading: false, data: null, error: 'Your profile details could not be loaded.' });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Choosing a plan opens the profile form straight away when there is no page yet.
  useEffect(() => {
    if (!state.loading && !state.data?.profile && requestedPlan) setCreating(true);
  }, [state.loading, state.data, requestedPlan]);

  // Returning from Stripe Checkout: confirm the session so the dashboard shows the truth even if the
  // webhook has not landed yet.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') !== 'success') return;
    const sessionId = params.get('session_id');
    if (!sessionId) return;
    subscriptionAction('confirm', { sessionId })
      .then(() => load())
      .catch(() => {});
  }, [load]);

  const data = state.data;
  const profile = data?.profile;
  const entitlements = data?.entitlements || {};
  const subscription = data?.subscription || {};

  const run = async (label, fn) => {
    setBusy(label);
    setNotice('');
    try {
      const result = await fn();
      if (result && result.ok === false) setNotice(result.error || 'That action could not be completed.');
      else setNotice('');
      await load();
      return result;
    } catch (error) {
      setNotice('That action could not be completed.');
      return null;
    } finally {
      setBusy('');
    }
  };

  const choosePlan = async (planKey) => {
    const result = await run('plan', () => subscriptionAction('start_checkout', { profileId: profile.profile_id, planKey }));
    if (result?.checkout_url) window.location.href = result.checkout_url;
  };

  const saveProfile = () =>
    run('save', () =>
      profileAction('save', {
        profileId: profile.profile_id,
        profile_type: profile.profile_type,
        ...form,
        service_areas: String(form.service_areas || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      }),
    );

  const traffic = data?.traffic || { total_views: 0, by_channel: [] };
  const leads = data?.leads || { total: 0, delivered: 0, failed: 0, pending: 0, by_source: {}, recent: [] };
  const listings = data?.listings || [];
  const plans = data?.plans || [];

  const statusLabel = PLAN_STATE_COPY[subscription.status] || subscription.status || 'No subscription';

  const profileState = useMemo(() => {
    if (!profile) return '';
    if (profile.publication_state === 'PUBLISHED') return 'Published';
    if (profile.publication_state === 'READY_FOR_REVIEW') return 'In review';
    return 'Not published';
  }, [profile]);

  const heading = (
    <div>
      <h2 className="font-serif text-2xl text-[#1A1A1A]">Professional profile (optional)</h2>
      <p className="text-sm text-[#1A1A1A]/55 mt-1">
        A public agent or brokerage page with its own visibility plan. Everything above works without one.
      </p>
    </div>
  );

  if (state.loading) {
    return (
      <section id="profile" className="scroll-mt-24">
        {heading}
        <div className="mt-4 rounded-2xl border border-[#B8956A]/25 bg-white p-6 flex justify-center">
          <div className="w-6 h-6 border-4 border-slate-200 border-t-[#B8956A] rounded-full animate-spin" />
        </div>
      </section>
    );
  }

  if (!profile) {
    return (
      <section id="profile" className="scroll-mt-24">
        {heading}
        <div className="mt-4 rounded-2xl border border-[#B8956A]/25 bg-white p-5">
          <p className="text-sm text-[#1A1A1A]/60">
            You do not have a professional profile, and you do not need one for invoices, prepaid credit, membership or
            property visibility.
          </p>
          {!creating ? (
            <Button
              variant="outline"
              className="mt-4 border-[#B8956A]/35"
              onClick={() => setCreating(true)}
            >
              Create a profile
            </Button>
          ) : (
            <div className="mt-4 space-y-3 max-w-lg">
              <div>
                <Label>Profile name</Label>
                <Input
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  className="mt-1"
                  placeholder="Your name or brokerage name"
                />
              </div>
              <div>
                <Label>Business email</Label>
                <Input
                  value={form.contact_email}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  className="mt-1"
                  placeholder="you@brokerage.com"
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  ['agent', 'Create agent profile'],
                  ['brokerage', 'Create brokerage profile'],
                ].map(([type, label]) => (
                  <Button
                    key={type}
                    className="bg-[#1A1A1A] text-[#FFFBF5] hover:bg-[#2A3536]"
                    disabled={busy === type || !form.display_name.trim()}
                    onClick={() =>
                      run(type, () =>
                        profileAction('save', {
                          profile_type: type,
                          display_name: form.display_name,
                          contact_email: form.contact_email,
                        }),
                      )
                    }
                  >
                    {busy === type ? 'Creating…' : label}
                  </Button>
                ))}
                <Button variant="ghost" onClick={() => setCreating(false)}>
                  Not now
                </Button>
              </div>
              <p className="text-[11px] text-[#1A1A1A]/45">
                A profile stays private until you authorize it and Arriv approves it.
              </p>
            </div>
          )}
          {notice && (
            <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{notice}</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section id="profile" className="scroll-mt-24">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-[#1A1A1A]">{profile.display_name}</h2>
          <p className="text-sm text-[#1A1A1A]/55 mt-1">
            {profile.profile_type === 'brokerage' ? 'Brokerage profile' : 'Agent profile'} · {profileState}
          </p>
        </div>
        {profile.public_url ? (
          <a href={profile.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-[#B8956A]">
            View public profile <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
          <span className="text-xs text-[#1A1A1A]/40">Public page not live yet</span>
        )}
      </div>

      {notice && <p className="mt-4 text-sm text-red-600">{notice}</p>}

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="plan">Plan &amp; billing</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-[#1A1A1A]/10 bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-[#1A1A1A]/40">Property views recorded</p>
              <p className="font-serif text-3xl text-[#1A1A1A] mt-2">{traffic.total_views}</p>
              <p className="text-xs text-[#1A1A1A]/45 mt-1">From Arriv page views on your published properties.</p>
            </div>
            <div className="rounded-2xl border border-[#1A1A1A]/10 bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-[#1A1A1A]/40">Inquiries</p>
              <p className="font-serif text-3xl text-[#1A1A1A] mt-2">{leads.total}</p>
              <p className="text-xs text-[#1A1A1A]/45 mt-1">{leads.delivered} delivered · {leads.pending} pending · {leads.failed} failed</p>
            </div>
            <div className="rounded-2xl border border-[#1A1A1A]/10 bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-[#1A1A1A]/40">Plan</p>
              <p className="font-serif text-2xl text-[#1A1A1A] mt-2">{statusLabel}</p>
              <p className="text-xs text-[#1A1A1A]/45 mt-1">
                {subscription.current_period_end ? `Renews ${formatDate(subscription.current_period_end)}` : 'No billing period yet'}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#1A1A1A]/10 bg-white p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-xl text-[#1A1A1A]">Your properties</h3>
              <span className="text-xs text-[#1A1A1A]/45">Showcase limit on your plan: {entitlements.showcase_limit || 3}</span>
            </div>
            {listings.length === 0 ? (
              <p className="text-sm text-[#1A1A1A]/55 mt-3">No properties are attached to this profile yet.</p>
            ) : (
              <div className="mt-3 divide-y divide-[#1A1A1A]/5">
                {listings.map((listing) => (
                  <div key={listing.listing_id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-[#1A1A1A]">{listing.property_address}</p>
                      <p className="text-xs text-[#1A1A1A]/45">{[listing.city, listing.state].filter(Boolean).join(', ')} · {listing.listing_status}</p>
                    </div>
                    {listing.public_url ? (
                      <a href={listing.public_url} className="text-xs text-[#B8956A] inline-flex items-center gap-1">
                        View page <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-[#1A1A1A]/35">{listing.publication_state}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {(traffic.by_channel || []).length > 0 && (
            <div className="rounded-2xl border border-[#1A1A1A]/10 bg-white p-5">
              <h3 className="font-serif text-xl text-[#1A1A1A]">Lead sources</h3>
              <div className="mt-3 space-y-1.5">
                {Object.entries(leads.by_source || {}).map(([source, count]) => (
                  <div key={source} className="flex items-center justify-between text-sm">
                    <span className="text-[#1A1A1A]/65 capitalize">{source}</span>
                    <span className="text-[#1A1A1A]">{count}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[#1A1A1A]/40 mt-3">
                Arriv reports only the traffic and inquiries it records itself. We do not report search rankings, Google
                impressions or promise any lead volume.
              </p>
            </div>
          )}

          {data?.marketing_assets_available && (
            <div className="rounded-2xl border border-[#B8956A]/40 bg-[#FFFBF5] p-5 flex items-start gap-3">
              <Megaphone className="w-5 h-5 text-[#B8956A] mt-0.5" />
              <div>
                <h3 className="font-medium text-[#1A1A1A]">Marketing graphics</h3>
                <p className="text-sm text-[#1A1A1A]/60 mt-1">
                  Downloadable graphics are available from your property pages in the property page builder.
                </p>
                <a href="/PropertyPageBuilder" className="text-sm text-[#B8956A] mt-2 inline-block">Open property page builder</a>
              </div>
            </div>
          )}

          {data?.team && (
            <div className="rounded-2xl border border-[#1A1A1A]/10 bg-white p-5">
              <h3 className="font-serif text-xl text-[#1A1A1A]">Team</h3>
              <p className="text-sm text-[#1A1A1A]/55 mt-1">
                {data.team.agents} agents · {data.team.published_agents} published · {data.team.inquiries} inquiries ·{' '}
                {data.team.seats.used}/{data.team.seats.allowed} seats used
              </p>
              <div className="mt-3 divide-y divide-[#1A1A1A]/5">
                {(data.roster || []).map((agent) => (
                  <div key={agent.profile_id} className="py-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm text-[#1A1A1A]">{agent.display_name}</p>
                      <p className="text-xs text-[#1A1A1A]/45">
                        {agent.publication_state}{agent.affiliation_verified ? '' : ' · affiliation not verified'}
                      </p>
                    </div>
                    <span className="text-xs text-[#1A1A1A]/50">{agent.inquiries} leads</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="profile" className="mt-6">
          <div className="rounded-2xl border border-[#1A1A1A]/10 bg-white p-6 max-w-2xl">
            <h3 className="font-serif text-xl text-[#1A1A1A]">Profile information</h3>
            <p className="text-sm text-[#1A1A1A]/55 mt-1">Everything here appears on your public profile once it is approved.</p>
            <div className="space-y-3 mt-5">
              <div>
                <Label>Display name</Label>
                <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Headline</Label>
                <Input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Biography</Label>
                <Textarea rows={5} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="mt-1" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Business email</Label>
                  <Input value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Business phone</Label>
                  <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label>City</Label>
                  <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>State</Label>
                  <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="mt-1" maxLength={2} />
                </div>
                <div>
                  <Label>Brokerage</Label>
                  <Input value={form.brokerage_name} onChange={(e) => setForm({ ...form, brokerage_name: e.target.value })} className="mt-1" />
                </div>
              </div>
              <div>
                <Label>Service areas (comma separated)</Label>
                <Input value={form.service_areas} onChange={(e) => setForm({ ...form, service_areas: e.target.value })} className="mt-1" />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-5">
              <Button onClick={saveProfile} disabled={busy === 'save'} className="bg-[#1A1A1A] text-[#FFFBF5] hover:bg-[#2A3536]">
                {busy === 'save' ? 'Saving…' : 'Save profile'}
              </Button>
              {!profile.authorization_confirmed && (
                <Button
                  variant="outline"
                  disabled={busy === 'authorize'}
                  onClick={() => run('authorize', () => profileAction('authorize', { profileId: profile.profile_id, confirm: true }))}
                >
                  Authorize publication
                </Button>
              )}
              {profile.publication_state !== 'READY_FOR_REVIEW' && profile.publication_state !== 'PUBLISHED' && (
                <Button
                  variant="outline"
                  disabled={busy === 'submit'}
                  onClick={() => run('submit', () => profileAction('submit', { profileId: profile.profile_id }))}
                >
                  Submit for review
                </Button>
              )}
              {profile.publication_state === 'PUBLISHED' && (
                <Button
                  variant="outline"
                  disabled={busy === 'unpublish'}
                  onClick={() => run('unpublish', () => profileAction('unpublish', { profileId: profile.profile_id }))}
                >
                  Unpublish profile
                </Button>
              )}
            </div>
            <p className="text-[11px] text-[#1A1A1A]/45 mt-3">
              Publication requires your authorization, Arriv's review, and the publication switch. Unverified licences and
              affiliations are never displayed.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="plan" className="mt-6 space-y-6">
          {requestedPlan && (
            <div className="rounded-2xl border border-[#B8956A]/40 bg-[#FFFBF5] p-4">
              <p className="text-sm text-[#1A1A1A]">
                You picked{' '}
                <span className="font-semibold">
                  {(plans.find((plan) => plan.product_key === requestedPlan) || {}).name || requestedPlan}
                </span>
                . Choose it below to add the paid benefits to your page. Your page stays free until you do.
              </p>
            </div>
          )}
          <div className="rounded-2xl border border-[#1A1A1A]/10 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-serif text-xl text-[#1A1A1A]">Current plan</h3>
                <p className="text-sm text-[#1A1A1A]/60 mt-1">
                  {statusLabel}{subscription.amount_label ? ` · ${subscription.amount_label}/month` : ''}
                  {subscription.cancel_at_period_end ? ' · cancels at period end' : ''}
                </p>
              </div>
              <div className="flex gap-2">
                {subscription.status === 'active' && !subscription.cancel_at_period_end && (
                  <Button
                    variant="outline"
                    disabled={busy === 'cancel'}
                    onClick={() => run('cancel', () => subscriptionAction('cancel', { subscriptionId: subscription.record_id, confirm: true, reason: 'customer_request' }))}
                  >
                    {busy === 'cancel' ? 'Cancelling…' : 'Cancel subscription'}
                  </Button>
                )}
                {subscription.cancel_at_period_end && (
                  <Button
                    variant="outline"
                    disabled={busy === 'resume'}
                    onClick={() => run('resume', () => subscriptionAction('resume', { subscriptionId: subscription.record_id }))}
                  >
                    {busy === 'resume' ? 'Resuming…' : 'Keep my plan'}
                  </Button>
                )}
              </div>
            </div>
            {subscription.disclosure && <p className="text-[11px] text-[#1A1A1A]/45 mt-3">{subscription.disclosure}</p>}
            {data?.downgrade_policy && <p className="text-[11px] text-[#1A1A1A]/45 mt-1">{data.downgrade_policy}</p>}
          </div>

          {data?.seat_management && (
            <SeatManager
              seat={data.seat_management}
              busy={busy}
              onUpdate={(seats) =>
                run('seats', () =>
                  subscriptionAction('set_seats', { subscriptionId: subscription.record_id, seats, confirm: true }),
                )
              }
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <PlanCard
                key={plan.product_key}
                plan={plan}
                current={profile.plan_key}
                canPurchase={plan.purchasable}
                busy={busy === 'plan'}
                onChoose={choosePlan}
              />
            ))}
          </div>

          {(subscription.billing_history || []).length > 0 && (
            <div className="rounded-2xl border border-[#1A1A1A]/10 bg-white p-5">
              <h3 className="font-serif text-xl text-[#1A1A1A]">Billing history</h3>
              <div className="mt-3 divide-y divide-[#1A1A1A]/5">
                {subscription.billing_history.map((entry) => (
                  <div key={entry.invoice_id} className="py-2 flex items-center justify-between text-sm">
                    <span className="text-[#1A1A1A]/65">{formatDate(entry.paid_at || entry.period_start)}</span>
                    <span className="text-[#1A1A1A]">{formatPrice(entry.amount_cents)}</span>
                    {entry.hosted_invoice_url ? (
                      <a href={entry.hosted_invoice_url} className="text-[#B8956A] text-xs" target="_blank" rel="noreferrer">Receipt</a>
                    ) : (
                      <span className="text-xs text-[#1A1A1A]/35">{entry.status}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="leads" className="mt-6">
          <div className="rounded-2xl border border-[#1A1A1A]/10 bg-white p-5">
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-[#B8956A]" />
              <h3 className="font-serif text-xl text-[#1A1A1A]">Inquiries</h3>
            </div>
            {leads.recent.length === 0 ? (
              <p className="text-sm text-[#1A1A1A]/55 mt-3">No inquiries yet.</p>
            ) : (
              <div className="mt-3 divide-y divide-[#1A1A1A]/5">
                {leads.recent.map((lead) => (
                  <div key={lead.inquiry_id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-[#1A1A1A]">{lead.name} · {lead.email}</p>
                      <span className="text-xs text-[#1A1A1A]/45">{formatDate(lead.created_at)}</span>
                    </div>
                    <p className="text-xs text-[#1A1A1A]/45 mt-0.5">
                      Delivery: {String(lead.notification_status || '').replace(/_/g, ' ')} · Source: {lead.channel || 'direct'}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-[#1A1A1A]/40 mt-3">
              Inquiries are recorded before delivery is attempted, so a failed email never loses a lead. Full contact
              details are in the notification emails sent to you.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex items-center gap-2 text-xs text-[#1A1A1A]/40">
        <Eye className="w-3.5 h-3.5" />
        Figures come from Arriv's own recorded property traffic and inquiries.
      </div>
    </section>
  );
}
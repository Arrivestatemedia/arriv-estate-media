import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw, Inbox, ExternalLink, LogIn } from "lucide-react";
import LeadStatsGrid from "@/components/property/leads/LeadStatsGrid";
import LeadCard from "@/components/property/leads/LeadCard";
import LeadPropertyFilter from "@/components/property/leads/LeadPropertyFilter";
import {
  fetchLeads,
  hasLeadIdentity,
  leadIdentity,
  listingAddress,
  resendLead,
  setLeadStatus,
} from "@/lib/propertyLeads";
import { redirectIfSessionExpired } from "@/lib/customerSession";

// The lead inbox for the customer who owns the property page, and for an administrator.
//
// Which leads appear is decided by the server from the listing's own client_email, not here: this
// screen only renders what the endpoint returns.
export default function PropertyLeads() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");

  const identity = useMemo(() => leadIdentity(), []);
  const signedIn = hasLeadIdentity(identity);

  const load = async () => {
    setLoading(true);
    try {
      const result = await fetchLeads();
      if (result?.ok === false) {
        setError(result.message || result.reason || "Your leads could not be loaded.");
        setData(null);
      } else {
        setData(result);
        setError("");
      }
    } catch (err) {
      // No valid session (e.g. signed in before sessions existed) → sign in again rather than
      // showing a misleading empty inbox.
      if (!redirectIfSessionExpired(err)) {
        setError(err?.message || "Your leads could not be loaded.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!signedIn) {
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const runLeadAction = async (lead, action) => {
    setBusy(lead.inquiry_id);
    setNotice("");
    try {
      if (action === "close") await setLeadStatus(lead.inquiry_id, "closed");
      if (action === "reopen") await setLeadStatus(lead.inquiry_id, "routed");
      if (action === "resend") {
        const result = await resendLead(lead.inquiry_id);
        setNotice(result?.ok ? "Email sent to the listing contact." : "The email could not be sent. It will be retried.");
      }
      await load();
    } catch (err) {
      setNotice(err?.message || "That did not go through.");
    } finally {
      setBusy("");
    }
  };

  const leads = useMemo(() => {
    const list = data?.inquiries || [];
    if (filter === "all") return list;
    return list.filter((lead) => lead.listing_id === filter);
  }, [data, filter]);

  const addressFor = (listingId) =>
    listingAddress((data?.listings || []).find((listing) => listing.listing_id === listingId));

  if (!signedIn) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="rounded-2xl border border-[#B8956A]/25 bg-white p-8 text-center">
          <Inbox className="w-8 h-8 text-[#B8956A] mx-auto mb-3" />
          <h1 className="text-2xl font-serif text-[#1A1A1A] mb-2">Property leads</h1>
          <p className="text-sm text-[#1A1A1A]/55 mb-6">
            Sign in to see the buyers who inquired about your property pages.
          </p>
          <Link
            to="/SignIn"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#B8956A] text-[#1A1A1A] text-sm font-semibold hover:bg-[#A68559]"
          >
            <LogIn className="w-4 h-4" /> Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-serif text-[#1A1A1A]">Property leads</h1>
          <p className="text-sm text-[#1A1A1A]/55 mt-1">
            Every buyer inquiry on your property pages, and whether it reached the listing contact.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#B8956A]/35 text-sm font-semibold text-[#1A1A1A] hover:bg-[#B8956A]/10 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Refresh
        </button>
      </header>

      {loading && !data && (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-[#B8956A]" />
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-600/25 bg-red-600/5 px-5 py-4 text-sm text-red-700 mb-6">{error}</div>
      )}

      {data && (
        <>
          <LeadStatsGrid totals={data.totals || {}} />

          <div className="mt-6">
            <LeadPropertyFilter listings={data.listings || []} value={filter} onChange={setFilter} />
          </div>

          {notice && (
            <p className="mt-4 text-sm text-[#1A1A1A]/70 bg-[#B8956A]/10 border border-[#B8956A]/30 rounded-xl px-4 py-3">
              {notice}
            </p>
          )}

          <div className="mt-6 space-y-3">
            {leads.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[#B8956A]/35 bg-white px-6 py-14 text-center">
                <Inbox className="w-7 h-7 text-[#B8956A]/70 mx-auto mb-3" />
                <p className="text-base text-[#1A1A1A] mb-1">No inquiries yet</p>
                <p className="text-sm text-[#1A1A1A]/50">
                  Buyers who inquire from your property page will appear here, and each one is emailed to you as it arrives.
                </p>
              </div>
            )}

            {leads.map((lead) => (
              <LeadCard
                key={lead.inquiry_id}
                lead={lead}
                address={addressFor(lead.listing_id)}
                busy={busy}
                onClose={(item) => runLeadAction(item, "close")}
                onReopen={(item) => runLeadAction(item, "reopen")}
                onResend={(item) => runLeadAction(item, "resend")}
              />
            ))}
          </div>

          {(data.listings || []).length > 0 && (
            <div className="mt-8 rounded-2xl border border-[#B8956A]/25 bg-white p-5">
              <h2 className="text-sm font-semibold text-[#1A1A1A] mb-3">Your property pages</h2>
              <ul className="divide-y divide-black/5">
                {data.listings.map((listing) => (
                  <li key={listing.listing_id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-[#1A1A1A] truncate">{listingAddress(listing) || listing.public_slug}</p>
                      <p className="text-[11px] text-[#1A1A1A]/45">
                        {listing.publication_state} · {listing.listing_status} · {listing.leads_total} lead
                        {listing.leads_total === 1 ? "" : "s"} · {listing.views_30d} views (30d)
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {listing.public_url && (
                        <a
                          href={listing.public_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8a6d4a] hover:underline"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> View page
                        </a>
                      )}
                      {listing.job_id && (
                        <Link
                          to={`/PropertyPageBuilder?jobId=${encodeURIComponent(listing.job_id)}`}
                          className="text-xs font-semibold text-[#1A1A1A]/60 hover:underline"
                        >
                          Manage
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
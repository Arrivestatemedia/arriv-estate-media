import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Globe, EyeOff, RefreshCw, ExternalLink } from "lucide-react";
import { LISTING_STATUS_LABELS, PUBLICITY_CONSENT_TEXT, formatDateTime } from "@/lib/propertyVisibility";

// The publication controls. Approval is a deliberate, consented act by the authorized
// customer, and unpublishing is always available.
export default function PropertyPublishPanel({ listing, busy, run }) {
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState(listing?.listing_status || "active");

  if (!listing) return null;

  const checklist = [
    { label: "Media selected", done: (listing.selected_media || []).length > 0 },
    { label: "Content approved", done: !!listing.content_approved_at },
    { label: "Listing contact set", done: !!(listing.approved_contact_email || listing.agent_email) },
    { label: "Authority confirmed", done: listing.authority_confirmed === true },
    { label: "Brokerage approval", done: listing.brokerage_approved === true },
    { label: "Disclosures accepted", done: listing.disclosures_accepted === true },
  ];

  return (
    <section className="rounded-2xl border border-[#B8956A]/25 bg-white p-6">
      <h2 className="text-lg font-medium text-[#1A1A1A] mb-1">Publish</h2>
      <p className="text-sm text-[#1A1A1A]/50 mb-5">
        State: <span className="font-medium text-[#1A1A1A]">{listing.publication_state}</span>
        {listing.published_at ? ` · published ${formatDateTime(listing.published_at)}` : ""}
      </p>

      <ul className="grid sm:grid-cols-2 gap-2 mb-6">
        {checklist.map((item) => (
          <li key={item.label} className={`text-sm flex items-center gap-2 ${item.done ? "text-[#1A1A1A]" : "text-[#1A1A1A]/40"}`}>
            <span className={`w-2 h-2 rounded-full ${item.done ? "bg-[#B8956A]" : "bg-black/15"}`} />
            {item.label}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-3 mb-6">
        {["DRAFT", "UNPUBLISHED"].includes(listing.publication_state) && (
          <Button onClick={() => run("submit_for_review")} disabled={busy === "submit_for_review"} variant="outline" className="border-[#B8956A]/40 text-[#1A1A1A]">
            {busy === "submit_for_review" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Submit for review
          </Button>
        )}
        {listing.publication_state === "PUBLISHED" && (
          <>
            <Button onClick={() => run("unpublish", { reason: "customer request" })} disabled={busy === "unpublish"} variant="outline" className="border-black/15 text-[#1A1A1A]">
              {busy === "unpublish" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <EyeOff className="w-4 h-4 mr-2" />}
              Unpublish
            </Button>
            {listing.public_url && (
              <a href={listing.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-[#B8956A] hover:underline">
                <ExternalLink className="w-4 h-4" /> View public page
              </a>
            )}
          </>
        )}
      </div>

      {listing.publication_state === "READY_FOR_REVIEW" && (
        <div className="rounded-xl border border-[#B8956A]/30 bg-[#FFFBF5] p-4 mb-6">
          <p className="text-sm text-[#1A1A1A]/70 mb-3">{PUBLICITY_CONSENT_TEXT}</p>
          <label className="flex items-start gap-3 text-sm text-[#1A1A1A]/80 mb-4">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#B8956A]" />
            I consent to publishing this property page.
          </label>
          <Button
            onClick={async () => {
              const approved = await run("approve_publication", { consent });
              if (approved?.ok) await run("publish");
            }}
            disabled={!consent || busy === "approve_publication" || busy === "publish"}
            className="bg-gradient-to-r from-[#B8956A] to-[#8a6d4a] text-[#0a0b0f] font-semibold"
          >
            {busy === "approve_publication" || busy === "publish" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Globe className="w-4 h-4 mr-2" />}
            Approve and publish
          </Button>
        </div>
      )}

      <div className="border-t border-black/5 pt-5">
        <h3 className="text-sm font-medium text-[#1A1A1A] mb-3">Listing status</h3>
        <div className="flex flex-wrap items-center gap-3">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-black/10 px-3 py-2 text-sm bg-white">
            {["active", "pending", "sold", "withdrawn", "expired"].map((s) => (
              <option key={s} value={s}>{LISTING_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <Button onClick={() => run("update_listing_status", { status })} disabled={busy === "update_listing_status"} variant="outline" className="border-[#B8956A]/40 text-[#1A1A1A]">
            {busy === "update_listing_status" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Update status
          </Button>
          <Button onClick={() => run("confirm_status")} disabled={busy === "confirm_status"} variant="outline" className="border-black/15 text-[#1A1A1A]">
            {busy === "confirm_status" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            It&apos;s still {LISTING_STATUS_LABELS[listing.listing_status]?.toLowerCase() || "accurate"}
          </Button>
        </div>
        <p className="text-xs text-[#1A1A1A]/45 mt-3">
          Sold, withdrawn and expired listings are removed from active search results. Listings must be reconfirmed periodically; an unconfirmed listing is removed from active results and later deactivated automatically.
          {listing.status_confirmation_due_at ? ` Next confirmation due ${formatDateTime(listing.status_confirmation_due_at)}.` : ""}
        </p>
      </div>
    </section>
  );
}
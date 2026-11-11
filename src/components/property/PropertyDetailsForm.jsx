import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Check, AlertCircle, Info } from "lucide-react";

// Every refusal the drafting step can come back with, said in words the customer can act on.
const DRAFT_BLOCKED = {
  MEDIA_SELECTION_REQUIRED: "Drafting needs at least one photograph from your shoot. Choose your media in the section above, save it, then draft again.",
  FEATURE_DISABLED: "Page drafting is not switched on for this account yet, so nothing was generated.",
  FORBIDDEN: "This property page belongs to a different account, so we could not draft content for it.",
  LISTING_NOT_FOUND: "We could not find this property page. Reload the page and try again.",
  CONTENT_INCOMPLETE: "A description, page title and meta description are all required before content can be approved.",
};

const DRAFT_TONES = {
  blocked: "border-red-200 bg-red-50 text-red-800",
  note: "border-amber-200 bg-amber-50 text-amber-900",
  done: "border-[#B8956A]/40 bg-[#B8956A]/10 text-[#1A1A1A]",
};

// Property details + AI-drafted content. AI may draft; the customer reviews and approves every
// factual field before anything can be published. Missing values stay empty — never invented.
export default function PropertyDetailsForm({ listing, busy, onSave, onGenerate, onApprove }) {
  const [details, setDetails] = useState({});
  const [content, setContent] = useState({ property_description: "", seo_title: "", meta_description: "" });
  // What the drafting step told us, kept right beside the button that started it: a refusal that
  // only appears at the top of the page reads as a dead button.
  const [draftResult, setDraftResult] = useState(null);

  useEffect(() => {
    setDetails({
      property_address: listing?.property_address || "",
      city: listing?.city || "",
      state: listing?.state || "",
      zip: listing?.zip || "",
      listing_price: listing?.listing_price ?? "",
      bedrooms: listing?.bedrooms ?? "",
      bathrooms: listing?.bathrooms ?? "",
      square_footage: listing?.square_footage ?? "",
      property_type: listing?.property_type || "",
      amenities: (listing?.amenities || []).join(", "),
    });
    setContent({
      property_description: listing?.property_description || listing?.ai_draft?.property_description || "",
      seo_title: listing?.seo_title || listing?.ai_draft?.seo_title || "",
      meta_description: listing?.meta_description || listing?.ai_draft?.meta_description || "",
    });
  }, [listing?.listing_id, listing?.updated_at, listing?.ai_draft?.generated_at]);

  const set = (k) => (e) => setDetails((prev) => ({ ...prev, [k]: e.target.value }));

  const save = () => onSave({
    ...details,
    amenities: details.amenities ? details.amenities.split(",").map((a) => a.trim()).filter(Boolean) : [],
  });

  const draftWithAi = async () => {
    setDraftResult(null);
    const res = await onGenerate({ force: !!listing?.ai_draft?.generated_at });
    if (!res) {
      setDraftResult({ tone: "blocked", text: "We could not reach the drafting service. Nothing was generated — please try again." });
      return;
    }
    const reason = String(res.reason || "");
    if (res.ok === false) {
      setDraftResult({
        tone: "blocked",
        text: DRAFT_BLOCKED[reason] || res.message || "The draft could not be generated. Please try again.",
      });
      return;
    }
    if (res.cached) {
      setDraftResult({
        tone: "note",
        text: "Nothing has changed since your last draft, so it was reused instead of regenerated. Change a property detail to get fresh wording.",
      });
      return;
    }
    if (!res.listing?.ai_draft?.property_description || !res.listing?.ai_draft?.seo_title) {
      setDraftResult({ tone: "blocked", text: "The drafting service came back with no text, so nothing was saved. Please try again." });
      return;
    }
    setDraftResult({ tone: "done", text: "Draft added below. Read it, change anything you like, then approve it." });
  };

  return (
    <section className="rounded-2xl border border-[#B8956A]/25 bg-white p-6">
      <h2 className="text-lg font-medium text-[#1A1A1A] mb-1">Property details</h2>
      <p className="text-sm text-[#1A1A1A]/50 mb-5">
        We reuse the verified details from your booking where we have them. Fields you leave blank stay blank — we never invent information.
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <label className="text-sm text-[#1A1A1A]/70">Street address
          <input value={details.property_address || ""} onChange={set("property_address")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-[#1A1A1A]/70">City
          <input value={details.city || ""} onChange={set("city")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-[#1A1A1A]/70">State
          <input value={details.state || ""} onChange={set("state")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-[#1A1A1A]/70">ZIP code
          <input value={details.zip || ""} onChange={set("zip")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-[#1A1A1A]/70">Listing price (USD)
          <input type="number" value={details.listing_price} onChange={set("listing_price")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-[#1A1A1A]/70">Property type
          <select value={details.property_type || ""} onChange={set("property_type")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white">
            <option value="">Not specified</option>
            <option value="house">House</option>
            <option value="condo">Condo</option>
            <option value="townhouse">Townhouse</option>
            <option value="multi_family">Multi-family</option>
            <option value="land">Land</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="text-sm text-[#1A1A1A]/70">Bedrooms
          <input type="number" value={details.bedrooms} onChange={set("bedrooms")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-[#1A1A1A]/70">Bathrooms
          <input type="number" step="0.5" value={details.bathrooms} onChange={set("bathrooms")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-[#1A1A1A]/70">Square footage
          <input type="number" value={details.square_footage} onChange={set("square_footage")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
          {listing?.square_footage_source && <span className="text-xs text-[#1A1A1A]/40">Source: {listing.square_footage_source.replace(/_/g, " ")}</span>}
        </label>
        <label className="text-sm text-[#1A1A1A]/70">Amenities (comma separated)
          <input value={details.amenities || ""} onChange={set("amenities")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        </label>
      </div>

      <Button onClick={save} disabled={busy === "update_details"} variant="outline" className="border-[#B8956A]/40 text-[#1A1A1A]">
        {busy === "update_details" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        Save details
      </Button>

      <div className="mt-8 border-t border-black/5 pt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-medium text-[#1A1A1A]">Page content and search metadata</h3>
            <p className="text-sm text-[#1A1A1A]/50">AI can draft this once from your details. You review and approve every word before publication.</p>
          </div>
          <Button onClick={draftWithAi} disabled={busy === "generate_seo"} variant="outline" className="border-[#B8956A]/40 text-[#1A1A1A] shrink-0">
            {busy === "generate_seo" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {listing?.ai_draft?.generated_at ? "Re-draft with AI" : "Draft with AI"}
          </Button>
        </div>

        {draftResult && (
          <div className={`mb-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${DRAFT_TONES[draftResult.tone]}`}>
            {draftResult.tone === "done" ? <Info className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
            <span>{draftResult.text}</span>
          </div>
        )}

        {busy === "generate_seo" && (
          <p className="mb-4 text-sm text-[#1A1A1A]/55">Writing your page content from the photographs and details you supplied. This can take a few seconds.</p>
        )}

        <div className="space-y-4">
          <label className="text-sm text-[#1A1A1A]/70 block">Property description
            <textarea value={content.property_description} onChange={(e) => setContent({ ...content, property_description: e.target.value })} rows={5} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm text-[#1A1A1A]/70 block">Page title
            <input value={content.seo_title} onChange={(e) => setContent({ ...content, seo_title: e.target.value })} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm text-[#1A1A1A]/70 block">Meta description
            <input value={content.meta_description} onChange={(e) => setContent({ ...content, meta_description: e.target.value })} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <Button onClick={() => onApprove(content)} disabled={busy === "approve_content"} className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]">
            {busy === "approve_content" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
            Approve this content
          </Button>
          {listing?.content_approved_at && (
            <span className="text-xs text-[#1A1A1A]/50">Approved by {listing.content_approved_by}</span>
          )}
        </div>
      </div>
    </section>
  );
}
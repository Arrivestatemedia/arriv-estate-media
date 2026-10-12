import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { propertyAction, loadPropertyContext, PUBLICATION_STATE_LABELS } from "@/lib/propertyVisibility";
import { Button } from "@/components/ui/button";
import { Loader2, Home, ArrowLeft, AlertCircle } from "lucide-react";
import PropertyMediaSelector from "@/components/property/PropertyMediaSelector";
import PropertyDetailsForm from "@/components/property/PropertyDetailsForm";
import PropertyAuthorizationsForm from "@/components/property/PropertyAuthorizationsForm";
import PropertyPublishPanel from "@/components/property/PropertyPublishPanel";
import PropertyPagePreview from "@/components/property/PropertyPagePreview";

// Customer-facing builder. Opens from the delivery gallery, is entirely optional, and never
// alters the existing download experience.
export default function PropertyPageBuilder() {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get("jobId");
  const clientEmail = (localStorage.getItem("user_email") || sessionStorage.getItem("user_email") || "").toLowerCase();

  const [context, setContext] = useState(null);
  const [listing, setListing] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    if (!jobId || !clientEmail) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const ctx = await loadPropertyContext(jobId, clientEmail);
      setContext(ctx);
      setListing(ctx?.existing_listing || null);
      if (ctx?.eligible) {
        const media = await base44.functions.invoke("getJobMediaForClient", { jobId, clientEmail });
        const data = media?.data || media;
        setFiles(data.files || []);
      }
    } catch (err) {
      setError(err.message || "Could not load your order");
    } finally {
      setLoading(false);
    }
  }, [jobId, clientEmail]);

  useEffect(() => { load(); }, [load]);

  const run = async (action, payload = {}) => {
    setBusy(action);
    setNotice(null);
    try {
      const res = await propertyAction(action, { listingId: listing?.listing_id, clientEmail, ...payload });
      if (res?.listing) setListing(res.listing);
      if (res && res.ok === false) setNotice(res.message || res.reason || "That action could not be completed.");
      return res;
    } catch (err) {
      setNotice(err.message || "That action could not be completed.");
      return null;
    } finally {
      setBusy("");
    }
  };

  if (!clientEmail) return <div className="min-h-[60vh] flex items-center justify-center text-[#1A1A1A]/60">Please sign in to continue.</div>;
  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" /></div>;

  if (context?.feature_disabled && !context?.existing_listing) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <Home className="w-10 h-10 text-[#B8956A] mx-auto mb-3" />
          <h1 className="text-2xl font-serif text-[#1A1A1A] mb-2">Property pages are coming soon</h1>
          <p className="text-[#1A1A1A]/60 text-sm">This feature is not enabled yet. Your delivered media is unaffected.</p>
        </div>
      </div>
    );
  }

  if (!context?.eligible && !listing) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <AlertCircle className="w-10 h-10 text-[#B8956A] mx-auto mb-3" />
          <h1 className="text-2xl font-serif text-[#1A1A1A] mb-2">Not available yet</h1>
          <p className="text-[#1A1A1A]/60 text-sm">
            A property page can be created once your edited media has been approved and delivered.
          </p>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] px-4 py-12">
        <div className="max-w-2xl mx-auto text-center">
          <Home className="w-12 h-12 text-[#B8956A] mx-auto mb-4" />
          <h1 className="text-3xl font-serif text-[#1A1A1A] mb-3">Create Your Free Property Page</h1>
          <p className="text-[#1A1A1A]/60 mb-6">
            We&apos;ll turn {context?.job?.title || "your delivered media"} into a search-friendly property page you approve before anything goes live.
          </p>
          <Button onClick={() => run("create_draft", { jobId })} disabled={busy === "create_draft"} className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]">
            {busy === "create_draft" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Start my property page
          </Button>
          {notice && <p className="text-sm text-red-600 mt-4">{notice}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5] pb-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <Link to={`/ClientJobGallery?jobId=${jobId}`} className="inline-flex items-center gap-2 text-sm text-[#1A1A1A]/50 hover:text-[#1A1A1A] mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to my media
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-3xl font-serif text-[#1A1A1A]">Your property page</h1>
            <p className="text-sm text-[#1A1A1A]/50 mt-1">{listing.property_address}{listing.city ? `, ${listing.city}` : ""}{listing.state ? `, ${listing.state}` : ""}</p>
          </div>
          <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#B8956A]/15 text-[#B8956A] text-xs font-semibold">
            {PUBLICATION_STATE_LABELS[listing.publication_state] || listing.publication_state}
          </span>
        </div>

        {notice && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</div>
        )}

        <div className="space-y-6">
          <PropertyMediaSelector files={files} listing={listing} busy={busy} onSave={(payload) => run("save_media", payload)} />
          <PropertyDetailsForm
            listing={listing}
            busy={busy}
            onSave={(details) => run("update_details", { details })}
            onGenerate={() => run("generate_seo")}
            onApprove={(content) => run("approve_content", { content })}
          />
          <PropertyAuthorizationsForm listing={listing} busy={busy} onSave={(payload) => run("record_authorizations", payload)} />
          <PropertyPagePreview listing={listing} />
          <PropertyPublishPanel listing={listing} busy={busy} run={run} />
        </div>
      </div>
    </div>
  );
}
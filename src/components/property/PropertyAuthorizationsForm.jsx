import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, Camera, X } from "lucide-react";
import { DISCLOSURES } from "@/lib/propertyVisibility";

// The listing contact, the brokerage, and the three confirmations publication requires.
//
// The name, email and phone here are the CONTACT'S own choice. Values carried over from our own
// records are shown so they can be corrected, never published as though they were confirmed —
// this section is exactly what appears on the public page.
export default function PropertyAuthorizationsForm({ listing, busy, onSave }) {
  const [form, setForm] = useState({});
  const [authority, setAuthority] = useState(false);
  const [brokerage, setBrokerage] = useState(false);
  const [disclosures, setDisclosures] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => {
    setForm({
      agent_name: listing?.agent_name || "",
      agent_email: listing?.agent_email || "",
      agent_phone: listing?.agent_phone || "",
      agent_license_number: listing?.agent_license_number || "",
      agent_photo_url: listing?.agent_photo_url || "",
      brokerage_name: listing?.brokerage_name || "",
      approved_contact_email: listing?.approved_contact_email || listing?.agent_email || "",
      approved_contact_phone: listing?.approved_contact_phone || listing?.agent_phone || "",
    });
    setAuthority(listing?.authority_confirmed === true);
    setBrokerage(listing?.brokerage_approved === true);
    setDisclosures(listing?.disclosures_accepted === true);
  }, [listing?.listing_id, listing?.updated_at]);

  const set = (k) => (e) => setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const save = (extra = {}) => onSave({
    ...form,
    ...extra,
    authority_confirmed: authority,
    brokerage_approved: brokerage,
    disclosures_accepted: disclosures,
  });

  // The photograph is stored publicly: the property page is served without a sign-in, so it can
  // only show an image that is publicly reachable. Only the image the contact uploads is stored.
  const uploadPhoto = async (file) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const res = await base44.integrations.Core.UploadPublicFile({ file });
      const url = res?.file_url || res?.data?.file_url || "";
      if (!url) throw new Error("That image could not be uploaded.");
      setForm((prev) => ({ ...prev, agent_photo_url: url }));
      await save({ agent_photo_url: url });
    } catch (err) {
      setError(err.message || "That image could not be uploaded.");
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    setForm((prev) => ({ ...prev, agent_photo_url: "" }));
    await save({ agent_photo_url: "" });
  };

  return (
    <section className="rounded-2xl border border-[#B8956A]/25 bg-white p-6">
      <h2 className="text-lg font-medium text-[#1A1A1A] mb-1">Listing contact, brokerage and disclosures</h2>
      <p className="text-sm text-[#1A1A1A]/50 mb-5">
        Confirm the details buyers will see, and the contact you want inquiries sent to. What is already filled in is what
        we had on file — change anything that is not what you want used. Inquiries are routed only to the approved contact below.
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <label className="text-sm text-[#1A1A1A]/70">Name shown to buyers
          <input value={form.agent_name || ""} onChange={set("agent_name")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-[#1A1A1A]/70">Brokerage (named prominently on the page)
          <input value={form.brokerage_name || ""} onChange={set("brokerage_name")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-[#1A1A1A]/70">Email shown to buyers
          <input value={form.agent_email || ""} onChange={set("agent_email")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-[#1A1A1A]/70">Phone shown to buyers
          <input value={form.agent_phone || ""} onChange={set("agent_phone")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-[#1A1A1A]/70">License number (if applicable)
          <input value={form.agent_license_number || ""} onChange={set("agent_license_number")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        </label>
      </div>

      <div className="border-t border-black/5 pt-5 mb-5">
        <p className="text-sm font-medium text-[#1A1A1A] mb-1">Where inquiries should be sent</p>
        <p className="text-xs text-[#1A1A1A]/50 mb-3">
          This is the contact buyers reach and the address every inquiry is delivered to. It does not have to match the
          details shown on the page — use a work address if you would rather buyers contact you there.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="text-sm text-[#1A1A1A]/70">Approved inquiry email
            <input value={form.approved_contact_email || ""} onChange={set("approved_contact_email")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm text-[#1A1A1A]/70">Approved inquiry phone
            <input value={form.approved_contact_phone || ""} onChange={set("approved_contact_phone")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
          </label>
        </div>
      </div>

      <div className="border-t border-black/5 pt-5 mb-5">
        <p className="text-sm font-medium text-[#1A1A1A] mb-1">Your photograph</p>
        <p className="text-xs text-[#1A1A1A]/50 mb-3">
          Optional. Shown beside your name in the listing contact section. Uploading here stores the image publicly (anyone
          with the link can open it), because the property page loads without a sign-in.
        </p>
        <div className="flex items-center gap-4">
          {form.agent_photo_url ? (
            <img src={form.agent_photo_url} alt="Listing contact" className="w-20 h-20 rounded-2xl object-cover border border-[#B8956A]/30" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-[#FFFBF5] border border-dashed border-black/15 flex items-center justify-center">
              <Camera className="w-6 h-6 text-[#1A1A1A]/30" />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => uploadPhoto(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
              className="border-[#B8956A]/40 text-[#1A1A1A]"
            >
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
              {form.agent_photo_url ? "Replace photograph" : "Upload photograph"}
            </Button>
            {form.agent_photo_url && (
              <Button type="button" variant="ghost" onClick={removePhoto} className="text-[#1A1A1A]/60">
                <X className="w-4 h-4 mr-2" /> Remove
              </Button>
            )}
          </div>
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </div>

      <div className="space-y-3 mb-5">
        <label className="flex items-start gap-3 text-sm text-[#1A1A1A]/75">
          <input type="checkbox" checked={authority} onChange={(e) => setAuthority(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#B8956A]" />
          I confirm I am authorized to advertise this property and to use the selected media.
        </label>
        <label className="flex items-start gap-3 text-sm text-[#1A1A1A]/75">
          <input type="checkbox" checked={brokerage} onChange={(e) => setBrokerage(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#B8956A]" />
          Applicable brokerage approval for this advertising has been obtained.
        </label>
        <label className="flex items-start gap-3 text-sm text-[#1A1A1A]/75">
          <input type="checkbox" checked={disclosures} onChange={(e) => setDisclosures(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#B8956A]" />
          I have read and accept the advertising disclosures below.
        </label>
      </div>

      <ul className="text-xs text-[#1A1A1A]/55 space-y-1 mb-5 list-disc pl-5">
        {DISCLOSURES.map((d) => <li key={d}>{d}</li>)}
      </ul>

      <Button
        onClick={() => save()}
        disabled={busy === "record_authorizations" || uploading}
        className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]"
      >
        {busy === "record_authorizations" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
        Save contact and authorizations
      </Button>
    </section>
  );
}
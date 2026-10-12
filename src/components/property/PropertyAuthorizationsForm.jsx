import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import { DISCLOSURES } from "@/lib/propertyVisibility";

// Agent attribution, authority confirmation, brokerage approval and advertising disclosures.
// All three confirmations are required before publication can be approved.
export default function PropertyAuthorizationsForm({ listing, busy, onSave }) {
  const [form, setForm] = useState({});
  const [authority, setAuthority] = useState(false);
  const [brokerage, setBrokerage] = useState(false);
  const [disclosures, setDisclosures] = useState(false);

  useEffect(() => {
    setForm({
      agent_name: listing?.agent_name || "",
      agent_email: listing?.agent_email || "",
      agent_phone: listing?.agent_phone || "",
      agent_license_number: listing?.agent_license_number || "",
      brokerage_name: listing?.brokerage_name || "",
      approved_contact_email: listing?.approved_contact_email || listing?.agent_email || "",
      approved_contact_phone: listing?.approved_contact_phone || listing?.agent_phone || "",
    });
    setAuthority(listing?.authority_confirmed === true);
    setBrokerage(listing?.brokerage_approved === true);
    setDisclosures(listing?.disclosures_accepted === true);
  }, [listing?.listing_id, listing?.updated_at]);

  const set = (k) => (e) => setForm((prev) => ({ ...prev, [k]: e.target.value }));

  return (
    <section className="rounded-2xl border border-[#B8956A]/25 bg-white p-6">
      <h2 className="text-lg font-medium text-[#1A1A1A] mb-1">Agent, brokerage and disclosures</h2>
      <p className="text-sm text-[#1A1A1A]/50 mb-5">Inquiries are routed only to the contact you approve here.</p>

      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <label className="text-sm text-[#1A1A1A]/70">Agent name
          <input value={form.agent_name || ""} onChange={set("agent_name")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-[#1A1A1A]/70">Agent email
          <input value={form.agent_email || ""} onChange={set("agent_email")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-[#1A1A1A]/70">Agent phone
          <input value={form.agent_phone || ""} onChange={set("agent_phone")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-[#1A1A1A]/70">License number (if applicable)
          <input value={form.agent_license_number || ""} onChange={set("agent_license_number")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-[#1A1A1A]/70">Brokerage
          <input value={form.brokerage_name || ""} onChange={set("brokerage_name")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-[#1A1A1A]/70">Approved inquiry contact
          <input value={form.approved_contact_email || ""} onChange={set("approved_contact_email")} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        </label>
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
        onClick={() => onSave({ ...form, authority_confirmed: authority, brokerage_approved: brokerage, disclosures_accepted: disclosures })}
        disabled={busy === "record_authorizations"}
        className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]"
      >
        {busy === "record_authorizations" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
        Save authorizations
      </Button>
    </section>
  );
}
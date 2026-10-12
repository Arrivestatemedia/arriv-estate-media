import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Send, CheckCircle2 } from "lucide-react";
import { INQUIRY_DISCLOSURES } from "@/lib/propertyVisibility";

// Buyer inquiry form. Routed only to the authorized listing contact, with consent recorded and
// spam prevention applied server-side.
export default function PropertyInquiryForm({ slug, reference }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "", consent: false, honeypot: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(null);

  const set = (k) => (e) => setForm((prev) => ({ ...prev, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("submitPropertyInquiry", {
        slug,
        name: form.name,
        email: form.email,
        phone: form.phone,
        message: form.message,
        consent_privacy: form.consent,
        company_website: form.honeypot,
      });
      const data = res?.data || res;
      if (data?.ok) setSent(data.reference || reference);
      else setError(data?.message || "Your inquiry could not be sent.");
    } catch (err) {
      setError(err.message || "Your inquiry could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-2xl border border-[#B8956A]/30 bg-white p-6 text-center">
        <CheckCircle2 className="w-8 h-8 text-[#B8956A] mx-auto mb-3" />
        <h3 className="text-lg font-medium text-[#1A1A1A] mb-1">Your inquiry has been sent</h3>
        <p className="text-sm text-[#1A1A1A]/55">Reference {sent}. The listing contact will respond directly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[#B8956A]/25 bg-white p-6">
      <h3 className="text-lg font-medium text-[#1A1A1A] mb-1">Contact the listing agent</h3>
      <p className="text-sm text-[#1A1A1A]/50 mb-5">Property reference {reference}</p>

      <div className="space-y-4">
        <input value={form.name} onChange={set("name")} placeholder="Your name" required className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        <input type="email" value={form.email} onChange={set("email")} placeholder="Email address" required className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        <input value={form.phone} onChange={set("phone")} placeholder="Phone (optional)" className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        <textarea value={form.message} onChange={set("message")} rows={4} placeholder="Your message" required className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
        {/* Honeypot: hidden from people, filled by bots. */}
        <input value={form.honeypot} onChange={set("honeypot")} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" name="company_website" />
        <label className="flex items-start gap-3 text-sm text-[#1A1A1A]/75">
          <input type="checkbox" checked={form.consent} onChange={set("consent")} required className="mt-0.5 w-4 h-4 accent-[#B8956A]" />
          I consent to being contacted about this property and I have read the privacy disclosures below.
        </label>
        <ul className="text-xs text-[#1A1A1A]/50 space-y-1 list-disc pl-5">
          {INQUIRY_DISCLOSURES.map((d) => <li key={d}>{d}</li>)}
        </ul>
      </div>

      {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

      <Button type="submit" disabled={busy} className="mt-5 w-full bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]">
        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
        Send inquiry
      </Button>
    </form>
  );
}
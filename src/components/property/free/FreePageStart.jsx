import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { propertyAction } from "@/lib/propertyVisibility";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Home, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

// First step of the free property page: the property itself. The account already exists by the time
// this renders, so the draft belongs to a verified customer from the first moment.

const EMPTY = {
  propertyAddress: "",
  city: "",
  state: "",
  zip: "",
  listingPrice: "",
  bedrooms: "",
  bathrooms: "",
  propertyDescription: "",
};

export default function FreePageStart({ onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [known, setKnown] = useState(null);

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  // Everything we already hold about the customer is filled in for them: their market from their
  // account, their contact details, and the property details of a page they already started.
  // Only values that are on file are used; a field we do not know stays empty for them to supply.
  useEffect(() => {
    let cancelled = false;
    propertyAction("get_free_page_prefill")
      .then((data) => {
        if (cancelled || !data?.ok) return;
        const facts = data.prefill || {};
        const property = facts.property || {};
        setKnown(facts);
        setForm((prev) => ({
          ...prev,
          propertyAddress: property.propertyAddress || prev.propertyAddress,
          city: property.city || facts.city || "",
          state: property.state || facts.state || "",
          zip: property.zip || facts.zip || "",
          listingPrice: property.listingPrice ?? "",
          bedrooms: property.bedrooms ?? "",
          bathrooms: property.bathrooms ?? "",
          propertyDescription: property.propertyDescription || "",
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!form.propertyAddress.trim()) {
      setError("A property address is required.");
      return;
    }
    setSaving(true);
    try {
      const data = await propertyAction("create_seo_draft", form);
      if (data?.error) {
        setError(data.error);
        return;
      }
      if (data?.ok === false) {
        setError(data.message || "The property page could not be created.");
        return;
      }
      if (data?.listing) onCreated(data.listing);
    } catch (err) {
      setError(err?.message || "The property page could not be created.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5] px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/ClientBookings"
          className="mb-6 inline-flex items-center gap-2 text-sm text-[#1A1A1A]/50 hover:text-[#1A1A1A]"
        >
          <ArrowLeft className="w-4 h-4" /> Back to my portal
        </Link>

        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#B8956A]/15">
            <Home className="w-5 h-5 text-[#B8956A]" />
          </span>
          <div>
            <h1 className="font-serif text-3xl text-[#1A1A1A]">Your free property page</h1>
            <p className="text-sm text-[#1A1A1A]/50">
              Everything we already know about you and your listing is filled in below. Check it, then add your photographs.
            </p>
          </div>
        </div>

        {known && (
          <div className="mt-6 rounded-2xl border border-[#B8956A]/25 bg-[#B8956A]/5 p-4">
            <p className="text-sm font-medium text-[#1A1A1A]">
              {known.property ? "We picked up where you left off." : "Filled in from what we already had on you."}
            </p>
            <p className="mt-1 text-xs text-[#1A1A1A]/60">
              {[
                known.full_name && `Name: ${known.full_name}`,
                known.agent_email && `Email: ${known.agent_email}`,
                known.phone && `Phone: ${known.phone}`,
                known.brokerage_name && `Brokerage: ${known.brokerage_name}`,
              ]
                .filter(Boolean)
                .join(" · ") || "Your market and contact details come from your account."}
            </p>
            <p className="mt-1 text-xs text-[#1A1A1A]/45">
              Change anything that is not right. These details are used on the page and for your inquiries, and nothing is
              published until you approve it.
            </p>
          </div>
        )}

        <form
          onSubmit={submit}
          className="mt-8 space-y-5 rounded-2xl border border-[#1A1A1A]/10 bg-white p-6"
        >
          <div>
            <Label htmlFor="fp-address">Property address *</Label>
            <Input
              id="fp-address"
              value={form.propertyAddress}
              onChange={set("propertyAddress")}
              placeholder="1428 Maple Ridge Drive"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="fp-city">City</Label>
              <Input id="fp-city" value={form.city} onChange={set("city")} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="fp-state">State</Label>
              <Input
                id="fp-state"
                value={form.state}
                onChange={set("state")}
                placeholder="GA"
                maxLength={2}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="fp-zip">ZIP</Label>
              <Input id="fp-zip" value={form.zip} onChange={set("zip")} className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="fp-price">Listing price</Label>
              <Input
                id="fp-price"
                type="number"
                value={form.listingPrice}
                onChange={set("listingPrice")}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="fp-beds">Bedrooms</Label>
              <Input
                id="fp-beds"
                type="number"
                value={form.bedrooms}
                onChange={set("bedrooms")}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="fp-baths">Bathrooms</Label>
              <Input
                id="fp-baths"
                type="number"
                value={form.bathrooms}
                onChange={set("bathrooms")}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="fp-description">What makes it worth a look?</Label>
            <Textarea
              id="fp-description"
              rows={3}
              value={form.propertyDescription}
              onChange={set("propertyDescription")}
              className="mt-1"
              placeholder="Renovated kitchen, screened porch, walk to the park…"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {saving ? "Creating your page" : "Create my page"}
            </Button>
            <span className="text-xs text-[#1A1A1A]/45">
              Saved as a draft. Nothing is published until you approve it.
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
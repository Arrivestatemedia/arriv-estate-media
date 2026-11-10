import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { withCustomerSession } from "@/lib/customerSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Home, Loader2, CheckCircle2, ChevronDown } from "lucide-react";

/**
 * Start a property page without buying photography.
 *
 * Only the address is required. The record is created as a draft and still goes through the normal
 * Arriv review before anything is published — this form never publishes.
 */


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

export default function SeoPropertyDraftCard() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (!form.propertyAddress.trim()) {
      setError("A property address is required.");
      return;
    }

    setSaving(true);
    try {
      const res = await base44.functions.invoke("managePropertyListing", withCustomerSession({
        ...form,
        action: "create_seo_draft",
      }));
      const data = res?.data || res;
      if (data?.error) {
        setError(data.error);
        return;
      }
      if (data?.ok === false) {
        setError(data.message || "The property page could not be created.");
        return;
      }
      setCreated(data?.listing || null);
      setForm(EMPTY);
      setOpen(false);
    } catch (err) {
      setError(err?.message || "The property page could not be created.");
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <div className="mb-8 rounded-2xl border border-[#B8956A]/25 bg-[var(--card-bg)] p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-[#B8956A] mt-0.5" />
          <div>
            <p className="font-semibold text-[var(--text-primary)]">Property draft started</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {created.property_address}
              {created.city ? `, ${created.city}` : ""}
              {created.state ? `, ${created.state}` : ""}
            </p>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              It is saved as a draft. Arriv reviews it before it becomes a public page, and you can add
              photography later.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setCreated(null)}>
              Start another property page
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 rounded-2xl border border-[#B8956A]/25 bg-[var(--card-bg)]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-3 p-5 text-left"
      >
        <span className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-full bg-[#B8956A]/12 flex items-center justify-center flex-shrink-0">
            <Home className="w-5 h-5 text-[#B8956A]" />
          </span>
          <span>
            <span className="block font-semibold text-[var(--text-primary)]">
              Add a property page without photography
            </span>
            <span className="block text-sm text-[var(--text-secondary)] mt-1">
              Create the page and its search details now; book a shoot whenever you are ready.
            </span>
          </span>
        </span>
        <ChevronDown
          className={`w-5 h-5 text-[#B8956A] flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <form onSubmit={submit} className="px-5 pb-5 space-y-4">
          <div>
            <Label htmlFor="seo-address">Property address *</Label>
            <Input
              id="seo-address"
              value={form.propertyAddress}
              onChange={set("propertyAddress")}
              placeholder="123 Main St"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="seo-city">City</Label>
              <Input id="seo-city" value={form.city} onChange={set("city")} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="seo-state">State</Label>
              <Input id="seo-state" value={form.state} onChange={set("state")} placeholder="GA" maxLength={2} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="seo-zip">ZIP</Label>
              <Input id="seo-zip" value={form.zip} onChange={set("zip")} className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="seo-price">Listing price</Label>
              <Input id="seo-price" type="number" value={form.listingPrice} onChange={set("listingPrice")} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="seo-beds">Bedrooms</Label>
              <Input id="seo-beds" type="number" value={form.bedrooms} onChange={set("bedrooms")} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="seo-baths">Bathrooms</Label>
              <Input id="seo-baths" type="number" value={form.bathrooms} onChange={set("bathrooms")} className="mt-1" />
            </div>
          </div>

          <div>
            <Label htmlFor="seo-description">Description</Label>
            <Textarea
              id="seo-description"
              value={form.propertyDescription}
              onChange={set("propertyDescription")}
              rows={3}
              className="mt-1"
              placeholder="What makes this property worth a buyer's attention?"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving} className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? "Creating draft" : "Create draft"}
            </Button>
            <span className="text-xs text-[var(--text-secondary)]">
              Reviewed by Arriv before it is published.
            </span>
          </div>
        </form>
      )}
    </div>
  );
}
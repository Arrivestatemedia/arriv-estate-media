import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function StepPersonalInfo({ onboarding, application, identity, onUpdated }) {
  const [data, setData] = useState({
    mailing_address: onboarding.mailing_address || application.address || "",
    city: onboarding.city || "",
    state: onboarding.state || "",
    zip: onboarding.zip || "",
    phone: onboarding.phone || application.phone || "",
    emergency_contact_name: onboarding.emergency_contact_name || "",
    emergency_contact_phone: onboarding.emergency_contact_phone || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setData((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await base44.functions.invoke("saveSalesOnboardingStep", { ...identity, step: "personal_info", data });
      if (res.data?.success) onUpdated(res.data.onboarding);
      else setError(res.data?.error || "Could not save.");
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const addressIncomplete =
    !data.mailing_address?.trim() || !data.city?.trim() || !data.state?.trim() || !data.zip?.trim();

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">Confirm or update your contact details so we can reach you and send paperwork.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Mailing Address" required value={data.mailing_address} onChange={(v) => set("mailing_address", v)} full />
        <Field label="City" required value={data.city} onChange={(v) => set("city", v)} />
        <Field label="State" required value={data.state} onChange={(v) => set("state", v)} />
        <Field label="ZIP" required value={data.zip} onChange={(v) => set("zip", v)} />
        <Field label="Phone" value={data.phone} onChange={(v) => set("phone", v)} />
        <Field label="Emergency Contact Name" value={data.emergency_contact_name} onChange={(v) => set("emergency_contact_name", v)} />
        <Field label="Emergency Contact Phone" value={data.emergency_contact_phone} onChange={(v) => set("emergency_contact_phone", v)} full />
      </div>
      {addressIncomplete && (
        <p className="text-sm text-red-600">Please complete your mailing address, city, state, and ZIP to continue.</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={save} disabled={saving || addressIncomplete} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
        {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : "Save & Continue"}
      </Button>
    </div>
  );
}

function Field({ label, value, onChange, full, required }) {
  return (
    <div className={full ? "sm:col-span-2 space-y-1.5" : "space-y-1.5"}>
      <Label className="text-[var(--text-primary)] text-xs">
        {label}{required && <span className="text-red-500"> *</span>}
      </Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
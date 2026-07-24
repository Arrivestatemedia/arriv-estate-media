import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Download, CheckCircle2 } from "lucide-react";
import { downloadW9Pdf } from "./onboardingPdf";

const CLASSIFICATIONS = [
  { value: "individual_sole", label: "Individual / Sole proprietor" },
  { value: "c_corp", label: "C Corporation" },
  { value: "s_corp", label: "S Corporation" },
  { value: "partnership", label: "Partnership" },
  { value: "trust_estate", label: "Trust / Estate" },
  { value: "llc", label: "LLC" },
];

export default function StepW9({ onboarding, application, identity, onUpdated }) {
  const done = !!onboarding.w9_completed_at;
  const [data, setData] = useState({
    w9_legal_name: onboarding.w9_legal_name || onboarding.full_name || "",
    w9_business_name: onboarding.w9_business_name || "",
    w9_address: onboarding.w9_address || onboarding.mailing_address || application.address || "",
    w9_tax_classification: onboarding.w9_tax_classification || "individual_sole",
    w9_llc_classification: onboarding.w9_llc_classification || "",
    w9_tin: onboarding.w9_tin || "",
    w9_signature: onboarding.w9_signature || onboarding.full_name || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setData((d) => ({ ...d, [k]: v }));

  const save = async () => {
    if (!data.w9_legal_name.trim() || !data.w9_tin.trim() || !data.w9_signature.trim()) {
      return setError("Name, TIN, and signature are required.");
    }
    setSaving(true);
    setError("");
    try {
      const res = await base44.functions.invoke("saveSalesOnboardingStep", { ...identity, step: "w9", data });
      if (res.data?.success) onUpdated(res.data.onboarding);
      else setError(res.data?.error || "Could not save.");
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm font-medium">W-9 completed on {new Date(onboarding.w9_completed_at).toLocaleString()}</span>
        </div>
        <Button variant="outline" onClick={() => downloadW9Pdf(onboarding, application)} className="border-[#B8956A] text-[#B8956A]">
          <Download className="w-4 h-4 mr-2" /> Download W-9
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">Complete your tax information (Form W-9) so we can report payments correctly.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name (as on your tax return)" value={data.w9_legal_name} onChange={(v) => set("w9_legal_name", v)} full />
        <Field label="Business name (optional)" value={data.w9_business_name} onChange={(v) => set("w9_business_name", v)} full />
        <Field label="Address" value={data.w9_address} onChange={(v) => set("w9_address", v)} full />
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-[var(--text-primary)] text-xs">Federal tax classification</Label>
          <select value={data.w9_tax_classification} onChange={(e) => set("w9_tax_classification", e.target.value)} className="w-full h-11 rounded-md border border-[#B8956A]/30 bg-white px-3 text-sm">
            {CLASSIFICATIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        {data.w9_tax_classification === "llc" && (
          <Field label="LLC classification (e.g. C, S, P)" value={data.w9_llc_classification} onChange={(v) => set("w9_llc_classification", v)} full />
        )}
        <Field label="Taxpayer ID (SSN or EIN)" value={data.w9_tin} onChange={(v) => set("w9_tin", v)} full />
        <Field label="Signature (type full name)" value={data.w9_signature} onChange={(v) => set("w9_signature", v)} full />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={save} disabled={saving} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
        {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : "Submit W-9"}
      </Button>
    </div>
  );
}

function Field({ label, value, onChange, full }) {
  return (
    <div className={full ? "sm:col-span-2 space-y-1.5" : "space-y-1.5"}>
      <Label className="text-[var(--text-primary)] text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
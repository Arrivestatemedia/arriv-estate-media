import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Download, CheckCircle2 } from "lucide-react";
import { downloadIcaPdf } from "./onboardingPdf";

const SUMMARY = [
  "Independent contractor (1099) — not an employee; you handle your own taxes.",
  "Commission-based compensation plus a $500 training bonus after training requirements are met.",
  "Non-exclusive engagement; either party may terminate with written notice.",
  "Confidentiality of Company client lists, pricing, and training materials.",
];

export default function StepICA({ onboarding, application, identity, onUpdated }) {
  const signed = !!onboarding.ica_signed_at;
  const [sig, setSig] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const sign = async () => {
    if (!agreed) return setError("Please agree to the terms before signing.");
    if (!sig.trim()) return setError("Please type your full name to sign.");
    setSaving(true);
    setError("");
    try {
      const res = await base44.functions.invoke("saveSalesOnboardingStep", { ...identity, step: "ica", data: { ica_signature: sig.trim() } });
      if (res.data?.success) onUpdated(res.data.onboarding);
      else setError(res.data?.error || "Could not save.");
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {signed ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-medium">Signed on {new Date(onboarding.ica_signed_at).toLocaleString()}</span>
          </div>
          <Button variant="outline" onClick={() => downloadIcaPdf(onboarding, application)} className="border-[#B8956A] text-[#B8956A]">
            <Download className="w-4 h-4 mr-2" /> Download Signed Agreement
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-[var(--text-secondary)]">Please review the summary of your Independent Contractor Agreement:</p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-[var(--text-primary)]">
            {SUMMARY.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
          <label className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
            <span>I have read and agree to the Independent Contractor Agreement terms.</span>
          </label>
          <div className="space-y-1.5">
            <Label className="text-[var(--text-primary)] text-xs">Type your full name to sign electronically</Label>
            <Input value={sig} onChange={(e) => setSig(e.target.value)} placeholder={onboarding.full_name || application.full_name} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button onClick={sign} disabled={saving} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing...</> : "Sign Agreement"}
          </Button>
        </>
      )}
    </div>
  );
}
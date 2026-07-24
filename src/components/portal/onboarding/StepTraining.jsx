import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, GraduationCap, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function StepTraining({ onboarding, identity, onUpdated }) {
  const started = !!onboarding.training_started_at;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const start = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await base44.functions.invoke("saveSalesOnboardingStep", { ...identity, step: "training", data: {} });
      if (res.data?.success) onUpdated(res.data.onboarding);
      else setError(res.data?.error || "Could not save.");
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  if (started) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm font-medium">Onboarding complete — your sales account is ready!</span>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">We've activated your Arriv sales account and emailed your login details. Your training videos are waiting in the Arriv Sales System.</p>
        <Link to="/SalesLogin?tab=training">
          <Button className="bg-[#10b981] hover:bg-[#0f9f72] text-white">
            Go to the Sales System <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">You're all set! Confirm below to finish onboarding and mark yourself ready to begin training. We'll be notified automatically.</p>
      <Button onClick={start} disabled={saving} className="bg-[#10b981] hover:bg-[#0f9f72] text-white">
        {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Finishing...</> : <><GraduationCap className="w-4 h-4 mr-2" /> Start Training</>}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
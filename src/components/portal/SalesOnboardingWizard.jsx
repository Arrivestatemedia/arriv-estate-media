import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, ArrowRight, FileText, PenLine, Receipt, CreditCard, Video, GraduationCap } from "lucide-react";
import { Link } from "react-router-dom";
import StepPersonalInfo from "./onboarding/StepPersonalInfo";
import StepICA from "./onboarding/StepICA";
import StepW9 from "./onboarding/StepW9";
import StepStripe from "./onboarding/StepStripe";
import StepWelcomeVideo from "./onboarding/StepWelcomeVideo";
import StepTraining from "./onboarding/StepTraining";

const STEPS = [
  { n: 2, label: "Personal Information", icon: FileText, Comp: StepPersonalInfo },
  { n: 3, label: "Sign ICA", icon: PenLine, Comp: StepICA },
  { n: 4, label: "Tax Info (W-9)", icon: Receipt, Comp: StepW9 },
  { n: 5, label: "Connect Stripe", icon: CreditCard, Comp: StepStripe },
  { n: 6, label: "Welcome Video", icon: Video, Comp: StepWelcomeVideo },
  { n: 7, label: "Training", icon: GraduationCap, Comp: StepTraining },
];

export default function SalesOnboardingWizard({ application, fullName, addressPrefix }) {
  const identity = { applicationId: application.id, fullName, addressPrefix };
  const [onboarding, setOnboarding] = useState(null);
  const [welcomeVideoUrl, setWelcomeVideoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [began, setBegan] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("getSalesOnboarding", identity);
      if (res.data?.onboarding) {
        setOnboarding(res.data.onboarding);
        setWelcomeVideoUrl(res.data.welcome_video_url || "");
      } else {
        setError(res.data?.error || "Could not load your onboarding.");
      }
    } catch (e) {
      setError(e.message || "Could not load your onboarding.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-[var(--text-secondary)]">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading your onboarding...
      </div>
    );
  }
  if (error || !onboarding) {
    return <p className="text-sm text-red-600 py-4">{error || "Could not load your onboarding."}</p>;
  }

  const done = {
    1: true,
    2: !!onboarding.personal_info_completed_at,
    3: !!onboarding.ica_signed_at,
    4: !!onboarding.w9_completed_at,
    5: !!onboarding.stripe_connected_at,
    6: !!onboarding.welcome_video_watched_at,
    7: !!onboarding.training_started_at,
  };
  const current = onboarding.current_step || 1;
  const allDone = current >= 8;
  const showBegin = current <= 1 && !began;

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="space-y-2">
        {STEPS.map((s) => {
          const Icon = s.icon;
          const isDone = done[s.n];
          const isActive = !allDone && !showBegin && current === s.n;
          return (
            <div key={s.n} className={`flex items-center gap-3 p-2.5 rounded-lg border ${isActive ? "border-[#B8956A] bg-[#FFFBF5]" : isDone ? "border-green-200 bg-green-50/40" : "border-[var(--border-color)] bg-white/50"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isDone ? "bg-green-500 text-white" : isActive ? "bg-[#B8956A] text-white" : "bg-[#B8956A]/10 text-[#B8956A]"}`}>
                {isDone ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${isDone ? "text-[var(--text-primary)]" : "text-[var(--text-primary)]"}`}>Step {s.n}: {s.label}</p>
              </div>
              {isDone ? <span className="text-xs font-semibold text-green-600">Done</span> : isActive ? <span className="text-xs font-semibold text-[#B8956A]">In progress</span> : <span className="text-xs text-[var(--text-secondary)]">Upcoming</span>}
            </div>
          );
        })}
      </div>

      {/* Active step content */}
      {showBegin ? (
        <Card className="border-2 border-[#B8956A] bg-white">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-6 h-6" />
              <span className="font-semibold text-[var(--text-primary)]">Step 1 complete — offer accepted!</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">Let's get your onboarding started. You'll confirm your details, sign your agreement, complete your W-9, connect Stripe for payouts, watch a welcome video, and then begin training.</p>
            <Button onClick={() => setBegan(true)} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
              Begin Onboarding <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      ) : allDone ? (
        <Card className="border-2 border-green-300 bg-green-50/40">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-6 h-6" />
              <span className="font-semibold text-[var(--text-primary)]">Onboarding complete!</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">You've finished every step. Your Arriv sales account has been activated and your training videos are ready in the Arriv Sales System.</p>
            <Link to="/SalesLogin?tab=training">
              <Button className="bg-[#10b981] hover:bg-[#0f9f72] text-white">
                Go to the Sales System <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        (() => {
          const step = STEPS.find((s) => s.n === current);
          if (!step) return null;
          const Comp = step.Comp;
          return (
            <Card className="border-2 border-[#B8956A]/30 bg-white">
              <CardHeader>
                <CardTitle className="text-base text-[var(--text-primary)]">Step {step.n}: {step.label}</CardTitle>
              </CardHeader>
              <CardContent>
                {step.n === 2 && <Comp onboarding={onboarding} application={application} identity={identity} onUpdated={setOnboarding} />}
                {step.n === 3 && <Comp onboarding={onboarding} application={application} identity={identity} onUpdated={setOnboarding} />}
                {step.n === 4 && <Comp onboarding={onboarding} application={application} identity={identity} onUpdated={setOnboarding} />}
                {step.n === 5 && <Comp onboarding={onboarding} identity={identity} onUpdated={setOnboarding} />}
                {step.n === 6 && <Comp onboarding={onboarding} welcomeVideoUrl={welcomeVideoUrl} identity={identity} onUpdated={setOnboarding} />}
                {step.n === 7 && <Comp onboarding={onboarding} identity={identity} onUpdated={setOnboarding} />}
              </CardContent>
            </Card>
          );
        })()
      )}
    </div>
  );
}
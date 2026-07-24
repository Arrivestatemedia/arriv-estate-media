import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, Gift, FileText, PenLine, Receipt, CreditCard, Video, GraduationCap } from "lucide-react";

const ONBOARDING_STEPS = [
  { icon: CheckCircle2, label: "Offer Accepted" },
  { icon: FileText, label: "Complete Personal Information" },
  { icon: PenLine, label: "Sign Independent Contractor Agreement" },
  { icon: Receipt, label: "Complete Tax Information (W-9)" },
  { icon: CreditCard, label: "Connect Stripe Account" },
  { icon: Video, label: "Watch Welcome Video" },
  { icon: GraduationCap, label: "Training Begins" },
];

export default function SalesOfferCard({ application, fullName, addressPrefix, onResponded }) {
  const [responding, setResponding] = useState(null); // "accept" | "decline" | null
  const [error, setError] = useState("");

  const status = application.status;

  const handleRespond = async (response) => {
    setResponding(response);
    setError("");
    try {
      const res = await base44.functions.invoke("respondToOffer", {
        applicationId: application.id,
        fullName,
        addressPrefix,
        response,
      });
      if (res.data?.success) {
        if (onResponded) onResponded({ ...application, status: res.data.status });
      } else {
        setError(res.data?.error || "Something went wrong. Please try again.");
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setResponding(null);
    }
  };

  // Offer pending — show offer + accept/decline
  if (status === "offer_extended") {
    return (
      <Card className="border-2 border-[#B8956A] bg-[#FFFBF5]">
        <CardHeader>
          <CardTitle className="text-xl text-[var(--text-primary)] flex items-center gap-2">
            <Gift className="w-5 h-5 text-[#B8956A]" />
            Your Offer from Arriv Estate Media
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-lg font-semibold text-[var(--text-primary)]">Congratulations, {application.full_name?.split(" ")[0]}!</p>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            We're excited to offer you the position of <strong>Sales Growth Advisor</strong> with Arriv Estate Media. After reviewing your application and speaking with you during the interview process, we believe you'll be a great addition to our team.
          </p>

          <div className="bg-white rounded-lg border border-[#B8956A]/20 p-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><span className="text-[var(--text-secondary)]">Position</span><span className="font-medium text-[var(--text-primary)] text-right">Sales Growth Advisor</span></div>
            <div className="flex justify-between gap-4"><span className="text-[var(--text-secondary)]">Employment Type</span><span className="font-medium text-[var(--text-primary)] text-right">Independent Contractor (1099)</span></div>
            <div className="flex justify-between gap-4"><span className="text-[var(--text-secondary)]">Compensation</span><span className="font-medium text-[var(--text-primary)] text-right">Commission-based + $500 training bonus*</span></div>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">*After successfully completing your first two weeks of training and meeting the program requirements.</p>

          <p className="text-sm text-[var(--text-secondary)]">
            Please review and respond to your offer within <strong>7 days</strong>. If you need more time or have questions, reply to your offer email — we're happy to help.
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              onClick={() => handleRespond("accept")}
              disabled={!!responding}
              className="flex-1 bg-[#10b981] hover:bg-[#0f9f72] text-white"
            >
              {responding === "accept" ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Accepting...</> : "Accept My Offer"}
            </Button>
            <Button
              onClick={() => handleRespond("decline")}
              disabled={!!responding}
              variant="outline"
              className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
            >
              {responding === "decline" ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Declining...</> : "Decline Offer"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Offer accepted — show onboarding roadmap
  if (status === "hired") {
    return (
      <Card className="border-2 border-[#10b981] bg-green-50/40">
        <CardHeader>
          <CardTitle className="text-xl text-[var(--text-primary)] flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[#10b981]" />
            Offer Accepted — Welcome to Arriv!
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Thank you for accepting the Sales Growth Advisor position. Here's your onboarding roadmap. Your onboarding steps will begin shortly — we'll guide you through each one.
          </p>

          <ol className="space-y-3">
            {ONBOARDING_STEPS.map((step, idx) => {
              const Icon = step.icon;
              const done = idx === 0;
              return (
                <li key={idx} className={`flex items-center gap-3 p-3 rounded-lg border ${done ? "border-[#10b981] bg-white" : "border-[var(--border-color)] bg-white/60"}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-[#10b981] text-white" : "bg-[#B8956A]/10 text-[#B8956A]"}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${done ? "text-[var(--text-primary)]" : "text-[var(--text-primary)]"}`}>Step {idx + 1}: {step.label}</p>
                  </div>
                  {done ? (
                    <span className="text-xs font-semibold text-[#10b981]">Complete</span>
                  ) : (
                    <span className="text-xs text-[var(--text-secondary)]">Upcoming</span>
                  )}
                </li>
              );
            })}
          </ol>
          {application.offer_accepted_at && (
            <p className="text-xs text-[var(--text-secondary)] text-center">
              Accepted on {new Date(application.offer_accepted_at).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Offer declined
  if (status === "offer_not_extended") {
    return (
      <Card className="border-2 border-red-200 bg-red-50/40">
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-start gap-3">
            <XCircle className="w-8 h-8 text-red-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Offer Declined</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                We've recorded that you declined the Sales Growth Advisor offer. Thank you for letting us know, and we wish you the best in your next opportunity.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
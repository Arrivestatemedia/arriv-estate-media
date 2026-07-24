import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, Gift, Download, Sparkles } from "lucide-react";
import { downloadOfferPdf } from "@/lib/salesOfferPdf";
import SalesOnboardingWizard from "./SalesOnboardingWizard";

function OfferLetter({ application }) {
  return (
    <div className="space-y-4 text-[var(--text-primary)]">
      <p className="text-lg font-semibold">Hi {application.full_name?.split(" ")[0]},</p>
      <p className="text-lg font-semibold">Congratulations!</p>
      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
        We're excited to offer you the position of <strong className="text-[var(--text-primary)]">Sales Growth Advisor</strong> with Arriv Estate Media.
      </p>
      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
        After reviewing your application and speaking with you during the interview process, we believe you'll be a great addition to our team. We're looking forward to having you help us grow Arriv as we continue expanding across new markets.
      </p>

      <h3 className="text-base font-semibold text-[#B8956A] pt-2">Your Offer</h3>
      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
        As a Sales Growth Advisor, you'll play an important role in introducing Arriv Estate Media to real estate professionals and helping us build lasting relationships with new clients.
      </p>
      <div className="bg-[#FFFBF5] rounded-lg border border-[#B8956A]/20 p-4 space-y-1.5 text-sm">
        <p><span className="text-[var(--text-secondary)]">Position:</span> <strong>Sales Growth Advisor</strong></p>
        <p><span className="text-[var(--text-secondary)]">Employment Type:</span> <strong>Independent Contractor (1099)</strong></p>
        <p><span className="text-[var(--text-secondary)]">Compensation:</span> <strong>Commission-based, plus a $500 training bonus</strong> after successfully completing your first two weeks of training and meeting the program requirements.</p>
      </div>

      <h3 className="text-base font-semibold text-[#B8956A] pt-2">Next Steps</h3>
      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">Once logged in, you'll be able to:</p>
      <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--text-secondary)]">
        <li>Review your official offer</li>
        <li>Accept or decline the position</li>
        <li>Complete your onboarding paperwork</li>
        <li>Sign your Independent Contractor Agreement</li>
        <li>Begin your onboarding and training</li>
      </ul>
      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
        Please review and respond to your offer within <strong className="text-[var(--text-primary)]">7 days</strong>. If you need additional time or have any questions before making your decision, simply reply to your offer email — we're happy to help.
      </p>
      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
        We're excited about the possibility of working together and can't wait to see the impact you'll make as part of the Arriv team.
      </p>
      <p className="text-base font-semibold">Welcome to Arriv!</p>

      <div className="pt-2 border-t border-[var(--border-color)] text-sm">
        <p className="text-[var(--text-secondary)]">Best regards,</p>
        <p className="font-semibold text-[var(--text-primary)]">Brad Burke</p>
        <p className="text-[var(--text-secondary)]">Founder &amp; CEO</p>
        <p className="text-[var(--text-secondary)]">Arriv Estate Media</p>
      </div>
    </div>
  );
}

export default function SalesOfferCard({ application, fullName, addressPrefix, onResponded }) {
  const [responding, setResponding] = useState(null);
  const [error, setError] = useState("");
  const status = application.status;

  const handleRespond = async (response) => {
    setResponding(response);
    setError("");
    try {
      const res = await base44.functions.invoke("respondToOffer", { applicationId: application.id, fullName, addressPrefix, response });
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

  if (status === "offer_extended") {
    return (
      <Card className="border-2 border-[#B8956A] bg-white">
        <CardHeader>
          <CardTitle className="text-xl text-[var(--text-primary)] flex items-center gap-2">
            <Gift className="w-5 h-5 text-[#B8956A]" /> Your Offer from Arriv Estate Media
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <OfferLetter application={application} />
          <div className="pt-2">
            <Button variant="outline" onClick={() => downloadOfferPdf(application)} className="border-[#B8956A] text-[#B8956A] mb-3">
              <Download className="w-4 h-4 mr-2" /> Download Offer (PDF)
            </Button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={() => handleRespond("accept")} disabled={!!responding} className="flex-1 bg-[#10b981] hover:bg-[#0f9f72] text-white">
              {responding === "accept" ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Accepting...</> : "Accept My Offer"}
            </Button>
            <Button onClick={() => handleRespond("decline")} disabled={!!responding} variant="outline" className="flex-1 border-red-300 text-red-600 hover:bg-red-50">
              {responding === "decline" ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Declining...</> : "Decline Offer"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === "hired") {
    return (
      <div className="space-y-6">
        <Card className="border-2 border-[#10b981] bg-green-50/40">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <Sparkles className="w-6 h-6" />
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Offer Accepted — Welcome to Arriv!</h3>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">Thank you for accepting the Sales Growth Advisor position. Complete your onboarding below to get started.</p>
            <Button variant="outline" onClick={() => downloadOfferPdf(application)} className="border-[#B8956A] text-[#B8956A]">
              <Download className="w-4 h-4 mr-2" /> Download Your Offer (PDF)
            </Button>
          </CardContent>
        </Card>
        <SalesOnboardingWizard application={application} fullName={fullName} addressPrefix={addressPrefix} />
      </div>
    );
  }

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
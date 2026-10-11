import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle, CheckCircle2, RefreshCw, Phone } from "lucide-react";
import AutoFundDisclosureList from "@/components/autofund/AutoFundDisclosureList";

/**
 * AutoFundEnrollPanel — the two customer actions.
 *
 *   Enroll Now                        → self_service_enroll (the customer accepts
 *                                       their own recurring-charge terms)
 *   Speak With a Sales Growth Advisor → request_advisor (a callback request only —
 *                                       an advisor can never enroll the customer or
 *                                       accept the recurring terms for them)
 *
 * Both channels use the SAME shared backend engine, so price, bonus, membership fee
 * and disclosure cannot differ between them. Nothing here sends a price or a fee —
 * the server resolves every financial value from the canonical tier configuration.
 *
 * Every material disclosure comes from the backend's compliance package and is
 * shown in full above the authorization control. The authorization control is
 * UNCHECKED by default: consent is affirmative, never pre-filled.
 */
export default function AutoFundEnrollPanel({ tier, enrollmentOpen, onEnrolled }) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [advisorNote, setAdvisorNote] = useState("");
  const [advisorSent, setAdvisorSent] = useState(false);

  if (!tier) return null;

  const fee = tier.membership_fee;
  const totalCharge = tier.total_monthly_charge;
  const disclosure = tier.compliance_disclosure || null;

  const enroll = async () => {
    setLoading(true); setError(null);
    try {
      const res = await base44.functions.invoke("manageAutoFund", {
        action: "self_service_enroll",
        amount: tier.amount,
        customer_phone: phone || undefined,
        terms_accepted: true,
      });
      const data = res?.data || res;
      if (data?.status === "enrolled" || data?.status === "success") {
        setDone(data);
        setTermsAccepted(false);
        onEnrolled?.();
      } else {
        setError(data?.error || "We could not start your enrollment.");
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const requestAdvisor = async () => {
    setLoading(true); setError(null);
    try {
      const res = await base44.functions.invoke("manageAutoFund", {
        action: "request_advisor",
        customer_phone: phone || undefined,
        notes: advisorNote || undefined,
      });
      const data = res?.data || res;
      if (data?.status === "success") setAdvisorSent(true);
      else setError(data?.error || "We could not send your request.");
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    const notice = done.enrollment_notice;
    return (
      <Card className="border-[#B8956A]/30 bg-[#B8956A]/5">
        <CardContent className="pt-6 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[#B8956A]" />
            <p className="font-medium text-[#1A1A1A]">You're set up on {tier.tier_name}</p>
          </div>
          <p className="text-sm text-[#1A1A1A]/70">
            {fee > 0
              ? `$${tier.amount} funds your wallet every month and $${tier.booking_value} lands as Booking Value, plus a $${fee} membership fee — a total recurring charge of $${totalCharge}.`
              : `$${tier.amount} funds your wallet every month and $${tier.booking_value} lands as Booking Value. Your total recurring charge is $${totalCharge}.`}{" "}
            You can pause or cancel any time from this dashboard.
          </p>
          <p className="text-xs text-[#1A1A1A]/60">
            {notice?.delivery_status === "sent"
              ? "A confirmation email with your tier, recurring charge, billing date, refund policy and cancellation instructions is on its way."
              : "Your enrollment is complete. We could not confirm delivery of your acknowledgment email — you can request it again from your dashboard."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[#B8956A]/20 bg-white">
      <CardHeader>
        <CardTitle className="text-[#1A1A1A]">Enroll in {tier.tier_name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 rounded-lg bg-[#B8956A]/5 space-y-1.5">
          <Line label="Monthly wallet funding" value={`$${tier.amount}`} />
          <Line
            label={`Promotional Booking Value (${tier.bonus_pct}%)`}
            value={tier.bonus_booking_value > 0 ? `+$${tier.bonus_booking_value.toFixed(2)}` : "None"}
          />
          <Line label="Monthly membership fee" value={fee > 0 ? `$${fee}` : "$0"} />
          <div className="pt-1.5 border-t border-[#B8956A]/20">
            <Line label="Total recurring monthly charge" value={`$${totalCharge}`} strong />
          </div>
          <Line label="Booking Value you receive each month" value={`$${tier.booking_value}`} strong />
        </div>

        <AutoFundDisclosureList disclosure={disclosure} />

        <div className="space-y-1.5">
          <Label className="text-[#1A1A1A]">Mobile number (optional)</Label>
          <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="555-123-4567" />
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox checked={termsAccepted} onCheckedChange={v => setTermsAccepted(v === true)} className="mt-0.5" />
          <span className="text-xs leading-relaxed text-[#1A1A1A]/75">
            I authorize Arriv Estate Media to charge <strong>${totalCharge}</strong> to my payment method each month
            on a recurring basis, beginning with my next charge, until I cancel. I understand{" "}
            {fee > 0
              ? `$${tier.amount} funds my wallet as Booking Value and $${fee} is a membership fee that is not spendable Booking Value and does not earn promotional credit.`
              : "the full charge funds my wallet as Booking Value."}{" "}
            I have read the statements above, including how to cancel and the membership-fee refund policy, and I agree
            to the Auto-Fund Membership Terms
            {disclosure?.terms_version ? ` (version ${disclosure.terms_version})` : ""}.
          </span>
        </label>

        {!enrollmentOpen && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-900">
              Auto-Fund is not open for enrollment yet. You can still ask an advisor to walk you through the tiers.
            </p>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <p className="text-xs text-red-800">{error}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={enroll}
            disabled={loading || !termsAccepted || !enrollmentOpen}
            className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Enroll Now
          </Button>
          <Button
            variant="outline"
            onClick={() => setAdvisorOpen(o => !o)}
            className="border-[#B8956A]/30 text-[#1A1A1A] hover:bg-[#B8956A]/10"
          >
            <Phone className="w-4 h-4 mr-2" />
            Speak With a Sales Growth Advisor
          </Button>
        </div>

        {advisorOpen && (
          <div className="p-4 rounded-lg border border-[#B8956A]/20 space-y-3">
            {advisorSent ? (
              <p className="text-sm text-[#1A1A1A]/75">
                Request received. A Sales Growth Advisor will reach out. You can enroll yourself at any time — an
                advisor cannot accept the recurring terms on your behalf.
              </p>
            ) : (
              <>
                <p className="text-xs text-[#1A1A1A]/60">
                  Tell us what you'd like help with and an advisor will call you. You will still review and accept the
                  recurring payment terms yourself.
                </p>
                <Input
                  value={advisorNote}
                  onChange={e => setAdvisorNote(e.target.value)}
                  placeholder="e.g. best tier for a team of 4"
                />
                <Button
                  onClick={requestAdvisor}
                  disabled={loading}
                  variant="outline"
                  className="border-[#B8956A]/30 text-[#1A1A1A] hover:bg-[#B8956A]/10"
                >
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Phone className="w-4 h-4 mr-2" />}
                  Request a callback
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Line({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`text-xs ${strong ? "font-medium text-[#1A1A1A]" : "text-[#1A1A1A]/60"}`}>{label}</span>
      <span className={`text-xs ${strong ? "font-semibold text-[#1A1A1A]" : "text-[#1A1A1A]"}`}>{value}</span>
    </div>
  );
}
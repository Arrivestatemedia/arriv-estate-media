import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CreditCard,
  CheckCircle2,
  Loader2,
  RefreshCw,
  XCircle,
  Shield,
  Wallet,
} from "lucide-react";

/**
 * Customer-facing payment recovery flow.
 *
 * Triggered when a customer opens the AutoFund page with a ?recovery_token=
 * URL parameter (from a failed-payment notification email) or ?recovery=success
 * (redirected back from Stripe after updating their card).
 *
 * Flow:
 *   1. recovery_token present → look up subscription by token, show failure
 *      details and "Update Payment Method" button.
 *   2. Customer clicks button → create_update_link → redirect to Stripe.
 *   3. Stripe redirects back with ?recovery=success&session_id=... → confirm
 *      the update, show success state.
 */
export default function PaymentRecoveryFlow({ recoveryToken, stripeSessionId, recoveryStatus, onDismiss }) {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recoveryData, setRecoveryData] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  const loadRecoveryStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("managePaymentRecovery", {
        action: "get_recovery_status_by_token",
        recovery_token: recoveryToken,
      });
      const data = res?.data || res;
      if (data?.error) {
        setError(data.error);
      } else {
        setRecoveryData(data);
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Unable to load recovery status");
    } finally {
      setLoading(false);
    }
  }, [recoveryToken]);

  // If redirected from Stripe with recovery=success, confirm the update
  useEffect(() => {
    if (recoveryStatus === "success" && stripeSessionId && recoveryToken && !confirmed) {
      const confirmUpdate = async () => {
        setActionLoading(true);
        setError(null);
        try {
          // First look up the subscription by token to get subscription_id
          const statusRes = await base44.functions.invoke("managePaymentRecovery", {
            action: "get_recovery_status_by_token",
            recovery_token: recoveryToken,
          });
          const statusData = statusRes?.data || statusRes;
          if (statusData?.error) {
            setError(statusData.error);
            setActionLoading(false);
            return;
          }

          const confirmRes = await base44.functions.invoke("managePaymentRecovery", {
            action: "confirm_method_update",
            subscription_id: statusData.subscription_id,
            stripe_session_id: stripeSessionId,
            recovery_token: recoveryToken,
          });
          const confirmData = confirmRes?.data || confirmRes;
          if (confirmData?.error) {
            setError(confirmData.error);
          } else {
            setConfirmed(true);
            setRecoveryData(statusData);
          }
        } catch (e) {
          setError(e?.response?.data?.error || e.message || "Unable to confirm payment method update");
        } finally {
          setActionLoading(false);
        }
      };
      confirmUpdate();
    } else if (recoveryToken && !recoveryData) {
      loadRecoveryStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recoveryToken, stripeSessionId, recoveryStatus, confirmed]);

  // ── Loading state ──
  if (loading || (actionLoading && !recoveryData)) {
    return (
      <Card className="border-[#B8956A]/30 bg-white">
        <CardContent className="pt-6 flex flex-col items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[#B8956A] mb-3" />
          <p className="text-sm text-[#1A1A1A]/60">
            {recoveryStatus === "success" ? "Confirming your payment method update..." : "Loading recovery information..."}
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Error state ──
  if (error && !recoveryData) {
    return (
      <Card className="border-red-200 bg-white">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3 mb-4">
            <XCircle className="w-6 h-6 text-red-500 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-medium text-[#1A1A1A] mb-1">Recovery Link Invalid</h3>
              <p className="text-sm text-[#1A1A1A]/60">{error}</p>
            </div>
          </div>
          {onDismiss && (
            <Button variant="outline" onClick={onDismiss} className="border-[#B8956A]/30 text-[#1A1A1A] hover:bg-[#B8956A]/10">
              Back to Auto-Fund
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Success state (after Stripe redirect + confirm) ──
  if (confirmed) {
    return (
      <Card className="border-[#B8956A]/30 bg-white">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center py-6">
            <div className="w-16 h-16 rounded-full bg-[#B8956A]/15 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-9 h-9 text-[#B8956A]" />
            </div>
            <h3 className="text-xl font-serif text-[#1A1A1A] mb-2">Payment Method Updated</h3>
            <p className="text-sm text-[#1A1A1A]/60 max-w-md mb-4">
              Your Auto-Fund has been resumed. Automatic charging will continue on your next billing date.
            </p>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-[#B8956A]/5 w-full max-w-sm mb-4">
              <Wallet className="w-4 h-4 text-[#B8956A] shrink-0" />
              <p className="text-xs text-[#1A1A1A]/70">
                Your existing Arriv Wallet balance and credits are unaffected and remain available for booking.
              </p>
            </div>
            {onDismiss && (
              <Button onClick={onDismiss} className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]">
                Back to Auto-Fund
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Recovery status display ──
  const handleUpdatePaymentMethod = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("managePaymentRecovery", {
        action: "create_update_link",
        subscription_id: recoveryData.subscription_id,
        customer_email: recoveryData.customer_email,
      });
      const data = res?.data || res;
      if (data?.error) {
        setError(data.error);
        setActionLoading(false);
        return;
      }
      if (data?.url) {
        // Redirect to Stripe Checkout (setup mode)
        window.location.href = data.url;
      } else {
        setError("Unable to create payment method update link");
        setActionLoading(false);
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Unable to start payment method update");
      setActionLoading(false);
    }
  };

  const isPaused = recoveryData?.auto_charge_paused;
  const failureCount = recoveryData?.consecutive_failed_attempts || 0;

  return (
    <Card className="border-[#B8956A]/30 bg-white">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <CardTitle className="text-[#1A1A1A] text-lg">Action Required: Payment Method Update</CardTitle>
            <p className="text-xs text-[#1A1A1A]/50 mt-0.5">
              {recoveryData?.customer_name || recoveryData?.customer_email}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Failure summary */}
        <div className="p-4 rounded-lg bg-red-50 border border-red-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[#1A1A1A]">Auto-Fund Payment Failed</span>
            <Badge className={isPaused ? "bg-red-600 text-white" : "bg-amber-500 text-white"}>
              {isPaused ? "Paused" : `${failureCount}/3 failures`}
            </Badge>
          </div>
          <p className="text-sm text-[#1A1A1A]/70">
            We were unable to charge your <strong>${recoveryData?.amount}/month</strong> Auto-Fund payment.
          </p>
          {recoveryData?.last_failure_reason && (
            <p className="text-xs text-[#1A1A1A]/50 mt-1">Reason: {recoveryData.last_failure_reason}</p>
          )}
        </div>

        {/* What this means */}
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Wallet className="w-4 h-4 text-[#B8956A] mt-0.5 shrink-0" />
            <p className="text-sm text-[#1A1A1A]/70">
              Your existing Arriv Wallet balance and credits are <strong>unaffected</strong> and remain available for booking.
            </p>
          </div>
          {isPaused && (
            <div className="flex items-start gap-2">
              <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-[#1A1A1A]/70">
                Automatic charging has been <strong>paused</strong> after 3 consecutive failures. Update your payment method to resume.
              </p>
            </div>
          )}
          {!isPaused && failureCount > 0 && (
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-sm text-[#1A1A1A]/70">
                After 3 consecutive failures, automatic charging will be paused. Please update your payment method now.
              </p>
            </div>
          )}
        </div>

        {/* Error from Stripe redirect */}
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* CTA */}
        <div className="pt-2">
          <Button
            onClick={handleUpdatePaymentMethod}
            disabled={actionLoading}
            className="w-full bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559] h-12"
          >
            {actionLoading ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <CreditCard className="w-5 h-5 mr-2" />
            )}
            Update Payment Method
          </Button>
          <p className="text-xs text-[#1A1A1A]/40 text-center mt-2 flex items-center justify-center gap-1">
            <Shield className="w-3 h-3" />
            Securely updated via Stripe
          </p>
        </div>

        {onDismiss && (
          <button
            onClick={onDismiss}
            className="w-full text-xs text-[#1A1A1A]/40 hover:text-[#1A1A1A]/60 pt-1"
          >
            Dismiss and continue to Auto-Fund
          </button>
        )}
      </CardContent>
    </Card>
  );
}
import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle, RefreshCw, ShieldAlert, Clock, Mail, CheckCircle2, XCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

const STATUS_COLORS = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  past_due: "bg-amber-100 text-amber-700 border-amber-200",
  paused: "bg-orange-100 text-orange-700 border-orange-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
};

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function NotificationHistory({ notifications }) {
  if (!notifications || notifications.length === 0) {
    return <p className="text-sm text-[#1A1A1A]/50 italic">No notifications sent</p>;
  }
  return (
    <div className="space-y-1.5 max-h-48 overflow-y-auto">
      {notifications.map((n, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          {n.email_sent ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          ) : (
            <Mail className="w-3.5 h-3.5 text-[#B8956A] shrink-0" />
          )}
          <span className="font-medium text-[#1A1A1A]">{n.type.replace(/_/g, " ")}</span>
          <span className="text-[#1A1A1A]/50">{formatDate(n.sent_at)}</span>
          {n.certification_mode && (
            <Badge variant="outline" className="text-[10px] px-1 py-0">cert</Badge>
          )}
        </div>
      ))}
    </div>
  );
}

function SubscriptionDetailDialog({ sub, onClose }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [overriding, setOverriding] = useState(false);
  const { toast } = useToast();

  const loadDetails = useCallback(async () => {
    if (!sub) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke("managePaymentRecovery", {
        action: "get_recovery_status",
        subscription_id: sub.subscription_id,
      });
      const data = res?.data || res;
      setDetails(data);
    } catch (e) {
      setDetails({ error: e.message });
    } finally {
      setLoading(false);
    }
  }, [sub]);

  useEffect(() => {
    if (sub) loadDetails();
  }, [sub, loadDetails]);

  const handleOverride = async () => {
    setOverriding(true);
    try {
      const res = await base44.functions.invoke("managePaymentRecovery", {
        action: "admin_override_hold",
        subscription_id: sub.subscription_id,
        reason: overrideReason || "Admin override",
      });
      const data = res?.data || res;
      if (data?.status === "processed") {
        toast({ title: "Recovery hold overridden", description: "Auto-Fund has been restored to active status." });
        setOverrideOpen(false);
        setOverrideReason("");
        loadDetails();
      } else {
        toast({ title: "Override failed", description: data?.error || "Unknown error", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Override failed", description: e.message, variant: "destructive" });
    } finally {
      setOverriding(false);
    }
  };

  if (!sub) return null;

  return (
    <Dialog open={!!sub} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-[#B8956A]" />
            Payment Recovery Details
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-[#B8956A]" />
          </div>
        ) : details?.error ? (
          <div className="text-sm text-red-600">{details.error}</div>
        ) : details ? (
          <div className="space-y-4">
            {/* Subscription Status */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-[#1A1A1A]/50">Customer</Label>
                <p className="text-sm font-medium text-[#1A1A1A]">{sub.customer_name || "—"}</p>
                <p className="text-xs text-[#1A1A1A]/60">{sub.customer_email}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[#1A1A1A]/50">Auto-Fund Status</Label>
                <Badge className={STATUS_COLORS[details.subscription?.status] || "bg-gray-100 text-gray-700"}>
                  {details.subscription?.status || "unknown"}
                </Badge>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[#1A1A1A]/50">Amount</Label>
                <p className="text-sm font-medium text-[#1A1A1A]">${sub.amount}/month</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[#1A1A1A]/50">Next Billing Date</Label>
                <p className="text-sm text-[#1A1A1A]">{formatDate(details.subscription?.next_billing_date)}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[#1A1A1A]/50">Consecutive Failures</Label>
                <p className="text-sm font-medium text-[#1A1A1A]">
                  {details.subscription?.consecutive_failed_attempts || 0} / 3
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[#1A1A1A]/50">Recovery Hold</Label>
                <Badge variant={details.subscription?.recovery_hold_active ? "destructive" : "outline"}>
                  {details.subscription?.recovery_hold_active ? "Active" : "Clear"}
                </Badge>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[#1A1A1A]/50">Auto-Charge Paused</Label>
                <Badge variant={details.subscription?.auto_charge_paused ? "destructive" : "outline"}>
                  {details.subscription?.auto_charge_paused ? "Paused" : "No"}
                </Badge>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[#1A1A1A]/50">Last Failure</Label>
                <p className="text-xs text-[#1A1A1A]">{formatDate(details.subscription?.last_failure_at)}</p>
                {details.subscription?.last_failure_reason && (
                  <p className="text-xs text-[#1A1A1A]/60">{details.subscription.last_failure_reason}</p>
                )}
              </div>
              {details.subscription?.payment_method_updated_at && (
                <div className="space-y-1">
                  <Label className="text-xs text-[#1A1A1A]/50">Method Updated</Label>
                  <p className="text-xs text-[#1A1A1A]">{formatDate(details.subscription.payment_method_updated_at)}</p>
                </div>
              )}
            </div>

            {/* Notification History */}
            <div className="border-t pt-3">
              <Label className="text-xs text-[#1A1A1A]/50 mb-2 block">Notification History</Label>
              <NotificationHistory notifications={details.notifications} />
            </div>

            {/* Admin Override */}
            {details.subscription?.recovery_hold_active && (
              <div className="border-t pt-3">
                {!overrideOpen ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOverrideOpen(true)}
                    className="text-[#B8956A] border-[#B8956A]/30 hover:bg-[#B8956A]/5"
                  >
                    <ShieldAlert className="w-4 h-4 mr-2" />
                    Admin Override Recovery Hold
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-xs text-[#1A1A1A]/50">Override Reason</Label>
                    <Textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Document why this hold is being overridden..."
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleOverride}
                        disabled={overriding}
                        className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
                      >
                        {overriding ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                        Confirm Override
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setOverrideOpen(false); setOverrideReason(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function PaymentRecoveryDashboard() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSub, setSelectedSub] = useState(null);
  const [error, setError] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("managePaymentRecovery", {
        action: "get_recovery_dashboard",
      });
      const data = res?.data || res;
      setSubscriptions(data?.subscriptions || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading) {
    return (
      <Card className="border-[#B8956A]/20">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#B8956A]" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="py-6">
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadDashboard} className="mt-3">
            <RefreshCw className="w-4 h-4 mr-1" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[#B8956A]/20">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldAlert className="w-5 h-5 text-[#B8956A]" />
          Payment Recovery Dashboard
          {subscriptions.length > 0 && (
            <Badge className="bg-[#B8956A]/15 text-[#B8956A] border-0">
              {subscriptions.length} active
            </Badge>
          )}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={loadDashboard}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {subscriptions.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm text-[#1A1A1A]/60">No subscriptions with active payment recovery issues.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {subscriptions.map((sub) => (
              <div
                key={sub.subscription_id}
                onClick={() => setSelectedSub(sub)}
                className="flex items-center justify-between p-3 rounded-lg border border-[#B8956A]/15 hover:border-[#B8956A]/40 hover:bg-[#B8956A]/5 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex flex-col items-center shrink-0">
                    <span className="text-lg font-bold text-[#1A1A1A]">
                      {sub.consecutive_failed_attempts || 0}
                    </span>
                    <span className="text-[10px] text-[#1A1A1A]/50">failures</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#1A1A1A] truncate">
                      {sub.customer_name || sub.customer_email}
                    </p>
                    <p className="text-xs text-[#1A1A1A]/60 truncate">{sub.customer_email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {sub.auto_charge_paused && (
                    <Badge variant="destructive" className="text-xs">Paused</Badge>
                  )}
                  {sub.recovery_hold_active && !sub.auto_charge_paused && (
                    <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">Hold</Badge>
                  )}
                  <Badge className={`${STATUS_COLORS[sub.status] || ""} text-xs`}>
                    {sub.status}
                  </Badge>
                  <span className="text-xs text-[#1A1A1A]/50 hidden sm:inline">
                    ${sub.amount}/mo
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <SubscriptionDetailDialog sub={selectedSub} onClose={() => setSelectedSub(null)} />
    </Card>
  );
}
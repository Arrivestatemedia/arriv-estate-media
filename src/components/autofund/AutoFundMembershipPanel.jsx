import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pause, Play, XCircle, RefreshCw, Loader2, AlertTriangle, Calendar } from "lucide-react";

/**
 * AutoFundMembershipPanel — the customer manages their OWN membership from their
 * account dashboard. Ownership is verified server-side on every action, so this
 * panel can never reach another customer's subscription.
 */
export default function AutoFundMembershipPanel({ data, catalog, onChanged }) {
  const sub = data?.subscription;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [newAmount, setNewAmount] = useState("");

  if (!sub) return null;

  const tiers = catalog || [];

  const act = async (action, extra = {}) => {
    setLoading(true); setError(null);
    try {
      const res = await base44.functions.invoke("manageAutoFund", {
        action,
        subscription_id: sub.id,
        ...extra,
      });
      const payload = res?.data || res;
      if (payload?.error) setError(payload.error);
      else { setNewAmount(""); onChanged?.(); }
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const statusTone =
    sub.status === "active" ? "bg-[#B8956A] text-[#1A1A1A]"
    : sub.status === "paused" ? "bg-amber-500 text-white"
    : "bg-gray-400 text-white";

  return (
    <Card className="border-[#B8956A]/20 bg-white">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-[#1A1A1A]">My Auto-Fund membership</CardTitle>
          <Badge className={statusTone}>{sub.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Monthly deposit" value={`$${sub.amount}`} />
          <Stat label="Membership fee" value={`$${sub.membership_fee || 0}`} />
          <Stat label="Total charge" value={`$${sub.total_monthly_charge || sub.amount}`} />
          <Stat label="Booking Value / month" value={`$${data?.subscription?.next_booking_value ?? ""}`} />
        </div>

        {sub.next_billing_date && (
          <p className="flex items-center gap-2 text-sm text-[#1A1A1A]/70">
            <Calendar className="w-4 h-4 text-[#B8956A]" />
            Next funding: {new Date(sub.next_billing_date).toLocaleDateString()}
          </p>
        )}

        {data?.charges?.note && (
          <p className="text-xs text-[#1A1A1A]/55">{data.charges.note}</p>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <p className="text-xs text-red-800">{error}</p>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          {sub.status === "active" && (
            <Button variant="outline" size="sm" onClick={() => act("pause")} disabled={loading}
              className="border-[#B8956A]/30 text-[#1A1A1A] hover:bg-[#B8956A]/10">
              <Pause className="w-3.5 h-3.5 mr-1" /> Pause
            </Button>
          )}
          {sub.status === "paused" && (
            <Button variant="outline" size="sm" onClick={() => act("resume")} disabled={loading}
              className="border-[#B8956A]/30 text-[#1A1A1A] hover:bg-[#B8956A]/10">
              <Play className="w-3.5 h-3.5 mr-1" /> Resume
            </Button>
          )}
          {sub.status !== "cancelled" && (
            <>
              <Select value={newAmount} onValueChange={setNewAmount}>
                <SelectTrigger className="w-[190px] h-9">
                  <SelectValue placeholder="Change tier" />
                </SelectTrigger>
                <SelectContent>
                  {tiers.map(t => (
                    <SelectItem key={t.amount} value={String(t.amount)}>
                      {t.tier_name} — ${t.amount}/mo (${t.total_monthly_charge} total)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={loading || !newAmount}
                onClick={() => act("change_amount", { new_amount: Number(newAmount) })}
                className="border-[#B8956A]/30 text-[#1A1A1A] hover:bg-[#B8956A]/10">
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Apply
              </Button>
            </>
          )}
          {sub.status !== "cancelled" && (
            <Button variant="outline" size="sm" onClick={() => act("cancel")} disabled={loading}
              className="border-red-300 text-red-600 hover:bg-red-50">
              <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel
            </Button>
          )}
          {loading && <Loader2 className="w-4 h-4 animate-spin text-[#B8956A]" />}
        </div>

        <div>
          <p className="text-sm font-medium text-[#1A1A1A] mb-2">Billing history</p>
          <div className="space-y-2">
            {(data.payment_history || []).map((p, i) => (
              <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[#B8956A]/10">
                <div>
                  <p className="text-sm text-[#1A1A1A]">
                    {p.date ? new Date(p.date).toLocaleDateString() : "—"} — ${p.amount}
                  </p>
                  <p className="text-xs text-[#1A1A1A]/50">
                    {p.is_membership_fee === false && p.booking_value_added > 0
                      ? `$${p.booking_value_added} Booking Value added`
                      : p.component === "membership_fee" || p.is_membership_fee !== false
                        ? "Membership fee — not spendable Booking Value"
                        : "No value added"}
                  </p>
                </div>
                <Badge className={p.status === "succeeded" || p.status === "retry_succeeded"
                  ? "bg-[#B8956A] text-[#1A1A1A]" : "bg-red-500 text-white"}>{p.status}</Badge>
              </div>
            ))}
            {(!data.payment_history || data.payment_history.length === 0) && (
              <p className="text-sm text-[#1A1A1A]/40">No billing history yet.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }) {
  return (
    <div className="p-3 rounded-lg bg-[#B8956A]/5">
      <p className="text-xs text-[#1A1A1A]/50">{label}</p>
      <p className="text-base font-medium text-[#1A1A1A]">{value}</p>
    </div>
  );
}
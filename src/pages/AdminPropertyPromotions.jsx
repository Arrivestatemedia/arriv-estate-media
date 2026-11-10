import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, Ban, CheckCircle2, Loader2, RefreshCw, ShieldCheck, Wallet } from "lucide-react";

// Administrator control over package purchases: what was sold, what is live, what needs a decision.
// Every action is re-authorised on the server; this screen only offers the actions.

function identity() {
  const read = (key) => localStorage.getItem(key) || sessionStorage.getItem(key) || "";
  return {
    sales_member_id: read("sales_member_id"),
    admin_email: read("sales_member_email") || read("user_email"),
  };
}

function money(cents) {
  const n = Number(cents || 0);
  return `$${(n / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function dateLabel(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_COLORS = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  paused: "bg-amber-50 text-amber-800 border-amber-200",
  pending_payment: "bg-slate-50 text-slate-600 border-slate-200",
  payment_failed: "bg-red-50 text-red-700 border-red-200",
  expired: "bg-slate-50 text-slate-600 border-slate-200",
  ended: "bg-slate-50 text-slate-600 border-slate-200",
  refunded: "bg-red-50 text-red-700 border-red-200",
};

export default function AdminPropertyPromotions() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [refundForm, setRefundForm] = useState({ type: "full", amount: "", reason: "", issue: false });

  const call = useCallback(async (payload) => {
    const res = await base44.functions.invoke("adminPropertyPromotions", { ...identity(), ...payload });
    return res?.data || res;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await call({ action: "list", status: statusFilter || undefined });
      if (payload?.ok === false) setError(payload.message || payload.error || "Could not load packages.");
      else setData(payload);
    } catch (err) {
      setError(err.message || "Could not load packages.");
    } finally {
      setLoading(false);
    }
  }, [call, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (promotionId) => {
    setDetailLoading(true);
    setNotice("");
    setRefundForm({ type: "full", amount: "", reason: "", issue: false });
    try {
      const payload = await call({ action: "detail", promotionId });
      if (payload?.ok === false) setNotice(payload.message || payload.error);
      else setDetail(payload);
    } catch (err) {
      setNotice(err.message || "Could not open that purchase.");
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleGate = async (enabled) => {
    setBusy("gate");
    setNotice("");
    try {
      const payload = await call({ action: "checkout_gate", enabled });
      if (payload?.ok) {
        setNotice(enabled ? "Live package checkout is now OPEN." : "Live package checkout is now CLOSED.");
        await load();
      } else {
        setNotice(payload?.message || payload?.error || "Could not change the checkout switch.");
      }
    } finally {
      setBusy("");
    }
  };

  const decideRefund = async () => {
    if (!detail?.promotion || !refundForm.reason.trim()) {
      setNotice("A refund decision needs a recorded reason.");
      return;
    }
    setBusy("refund");
    try {
      const payload = await call({
        action: "refund_decision",
        promotionId: detail.promotion.promotion_id,
        refundType: refundForm.type,
        amountCents: refundForm.type === "partial" ? Math.round(Number(refundForm.amount || 0) * 100) : undefined,
        reason: refundForm.reason,
        issue_refund: refundForm.issue === true,
      });
      if (payload?.ok) {
        setNotice(payload.note || "Decision recorded.");
        setDetail(null);
        await load();
      } else {
        setNotice(payload?.message || payload?.error || "That decision could not be recorded.");
      }
    } finally {
      setBusy("");
    }
  };

  const forceExpire = async () => {
    if (!detail?.promotion) return;
    const reason = window.prompt("Reason for ending this placement:", "administrative_end");
    if (!reason) return;
    setBusy("expire");
    try {
      const payload = await call({ action: "force_expire", promotionId: detail.promotion.promotion_id, reason });
      if (payload?.ok) {
        setNotice("Placement ended.");
        setDetail(null);
        await load();
      } else {
        setNotice(payload?.message || payload?.error);
      }
    } finally {
      setBusy("");
    }
  };

  const clearReview = async () => {
    if (!detail?.promotion) return;
    setBusy("review");
    try {
      const payload = await call({ action: "clear_review", promotionId: detail.promotion.promotion_id });
      if (payload?.ok) {
        setNotice("Review cleared.");
        await openDetail(detail.promotion.promotion_id);
        await load();
      }
    } finally {
      setBusy("");
    }
  };

  const totals = data?.totals || {};

  return (
    <div className="min-h-screen bg-[#FFFBF5] pb-20">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl text-[#1A1A1A]">Property packages</h1>
            <p className="mt-1 text-sm text-[#1A1A1A]/55">Purchases, placements, refunds and the switch that opens paid checkout.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="border-[#B8956A]/40 text-[#1A1A1A]">
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${data?.checkout_enabled ? "border-emerald-300 bg-emerald-50" : "border-[#B8956A]/30 bg-white"}`}>
          <div className="flex items-start gap-3">
            <ShieldCheck className={`mt-0.5 h-5 w-5 ${data?.checkout_enabled ? "text-emerald-700" : "text-[#B8956A]"}`} />
            <div>
              <p className="text-sm font-semibold text-[#1A1A1A]">
                Paid package checkout is {data?.checkout_enabled ? "OPEN" : "CLOSED"}
              </p>
              <p className="text-xs text-[#1A1A1A]/55">
                {data?.checkout_enabled
                  ? "Customers can purchase packages with real cards. Closing this stops new purchases immediately."
                  : "Customers can review packages but cannot pay. Nothing is charged while this is closed."}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => toggleGate(!data?.checkout_enabled)}
            disabled={busy === "gate"}
            className={data?.checkout_enabled ? "bg-[#1A1A1A] text-[#FFFBF5]" : "bg-[#B8956A] text-[#1A1A1A]"}
          >
            {busy === "gate" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            {data?.checkout_enabled ? "Close checkout" : "Open checkout"}
          </Button>
        </div>

        {notice && <div className="mt-4 rounded-xl border border-[#B8956A]/35 bg-white px-4 py-3 text-sm text-[#1A1A1A]/75">{notice}</div>}
        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mr-2 inline h-4 w-4" /> {error}
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Live placements", value: totals.active ?? 0 },
            { label: "Paused", value: totals.paused ?? 0 },
            { label: "Needs review", value: totals.review_required ?? 0 },
            { label: "Collected", value: money(totals.gross_cents) },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-[#B8956A]/25 bg-white p-4">
              <p className="font-serif text-2xl text-[#1A1A1A]">{stat.value}</p>
              <p className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/50">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <span className="text-xs font-medium text-[#1A1A1A]/60">Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-[#B8956A]/30 bg-white px-3 py-1.5 text-sm text-[#1A1A1A]"
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="pending_payment">Pending payment</option>
            <option value="payment_failed">Payment failed</option>
            <option value="expired">Expired</option>
            <option value="ended">Ended</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-[#B8956A]/25 bg-white">
          {loading ? (
            <div className="p-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-[#B8956A]" /></div>
          ) : (data?.promotions || []).length === 0 ? (
            <div className="p-10 text-center text-sm text-[#1A1A1A]/50">No packages purchased yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#FFFBF5] text-left text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/45">
                  <tr>
                    <th className="px-4 py-2 font-medium">Property</th>
                    <th className="px-4 py-2 font-medium">Package</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Ends</th>
                    <th className="px-4 py-2 text-right font-medium">Paid</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(data?.promotions || []).map((promotion) => (
                    <tr key={promotion.promotion_id} className="border-t border-[#B8956A]/12">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-[#1A1A1A]">{promotion.property_address}</p>
                        <p className="text-[11px] text-[#1A1A1A]/45">{promotion.client_email}</p>
                      </td>
                      <td className="px-4 py-2.5 capitalize text-[#1A1A1A]/70">
                        {promotion.package_tier}
                        {promotion.purchase_type !== "new" ? <span className="ml-1 text-[10px] text-[#B8956A]">({promotion.purchase_type})</span> : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[promotion.status] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
                          {promotion.status.replace(/_/g, " ")}
                        </span>
                        {promotion.review_required && <span className="ml-1 text-[10px] font-semibold text-red-600">review</span>}
                      </td>
                      <td className="px-4 py-2.5 text-[#1A1A1A]/60">{dateLabel(promotion.ends_at)}</td>
                      <td className="px-4 py-2.5 text-right text-[#1A1A1A]/70">{promotion.price_label}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button size="sm" variant="ghost" onClick={() => openDetail(promotion.promotion_id)} className="text-[#B8956A]">
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!detail || detailLoading} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-[#1A1A1A]">
              {detail?.listing?.property_address || "Package purchase"}
            </DialogTitle>
            <DialogDescription className="text-sm text-[#1A1A1A]/55">
              {detail?.promotion ? `${detail.promotion.package_tier} · ${detail.promotion.status} · ${detail.promotion.client_email}` : "Loading…"}
            </DialogDescription>
          </DialogHeader>

          {detailLoading && <div className="p-6 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-[#B8956A]" /></div>}

          {detail?.promotion && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                {[
                  ["Paid", money(detail.promotion.paid_amount_cents ?? detail.promotion.amount_cents)],
                  ["Purchase", detail.promotion.purchase_type],
                  ["Activated", dateLabel(detail.promotion.activated_at)],
                  ["Ends", dateLabel(detail.promotion.ends_at)],
                  ["Days left", detail.entitlement?.days_remaining ?? 0],
                  ["Refund", detail.promotion.refund_status || "none"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-[#FFFBF5] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-[#1A1A1A]/45">{label}</p>
                    <p className="text-[#1A1A1A]/80">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-[#B8956A]/25 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-[#1A1A1A]/75">
                  <Wallet className="h-3.5 w-3.5 text-[#B8956A]" /> Performance in this window
                </p>
                <p className="mt-1 text-xs text-[#1A1A1A]/60">
                  {detail.performance?.views ?? 0} views · {detail.performance?.inquiries ?? 0} inquiries ·{" "}
                  {detail.performance?.conversion_rate ?? 0}% inquiry rate
                </p>
              </div>

              <div className="rounded-xl border border-[#B8956A]/25 p-3">
                <p className="text-xs font-semibold text-[#1A1A1A]/75">Refund decision</p>
                <p className="mt-1 text-[11px] text-[#1A1A1A]/55">{detail.refund_advice?.rule}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <select
                    value={refundForm.type}
                    onChange={(event) => setRefundForm((form) => ({ ...form, type: event.target.value }))}
                    className="rounded-lg border border-[#B8956A]/30 bg-white px-2 py-1.5 text-xs"
                  >
                    <option value="full">Full refund</option>
                    <option value="partial">Partial refund</option>
                    <option value="declined">Decline</option>
                  </select>
                  <input
                    type="number"
                    placeholder="Amount (USD)"
                    value={refundForm.amount}
                    disabled={refundForm.type !== "partial"}
                    onChange={(event) => setRefundForm((form) => ({ ...form, amount: event.target.value }))}
                    className="rounded-lg border border-[#B8956A]/30 bg-white px-2 py-1.5 text-xs disabled:opacity-40"
                  />
                  <label className="flex items-center gap-2 text-[11px] text-[#1A1A1A]/70">
                    <input
                      type="checkbox"
                      checked={refundForm.issue}
                      onChange={(event) => setRefundForm((form) => ({ ...form, issue: event.target.checked }))}
                    />
                    Also issue with Stripe
                  </label>
                </div>
                <input
                  placeholder="Reason (required, recorded)"
                  value={refundForm.reason}
                  onChange={(event) => setRefundForm((form) => ({ ...form, reason: event.target.value }))}
                  className="mt-2 w-full rounded-lg border border-[#B8956A]/30 bg-white px-2 py-1.5 text-xs"
                />
                <p className="mt-1 text-[10px] text-[#1A1A1A]/45">
                  Recording a decision never moves money. Tick "Also issue with Stripe" to refund the card as part of this action.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={decideRefund} disabled={busy === "refund"} className="bg-[#B8956A] text-[#1A1A1A]">
                    {busy === "refund" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                    Record decision
                  </Button>
                  <Button size="sm" variant="outline" onClick={forceExpire} disabled={busy === "expire"} className="border-[#1A1A1A]/20">
                    <Ban className="mr-1.5 h-3.5 w-3.5" /> End placement
                  </Button>
                  {detail.promotion.review_required && (
                    <Button size="sm" variant="outline" onClick={clearReview} disabled={busy === "review"} className="border-[#1A1A1A]/20">
                      Clear review flag
                    </Button>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[#B8956A]/20 bg-[#FFFBF5] p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1A1A1A]/45">Audit history</p>
                <ul className="mt-1 space-y-1">
                  {(detail.promotion.events || []).map((event, index) => (
                    <li key={`${event.type}-${index}`} className="text-[11px] text-[#1A1A1A]/60">
                      {String(event.at || "").slice(0, 16).replace("T", " ")} · <span className="font-medium">{event.type}</span>
                      {event.note ? ` — ${event.note}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
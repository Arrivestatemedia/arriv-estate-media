import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { formatDate, money } from "@/lib/propertyAds";

// Reconciles verified spend against the prepaid advertising budget. Unspent customer money is
// surfaced as a refund due for a decision; it is never refunded automatically.
export default function ManualReconciliationPanel({ campaign, busy, onRun }) {
  const [note, setNote] = useState("");
  if (!campaign) return null;

  const budget = campaign.budget || {};
  const reconciliation = campaign.spend_reconciliation;
  const unspent = Number(budget.remaining_cents || 0);
  const refunded = Number(campaign.refunded_cents || 0);
  const refundDue = Math.max(0, unspent - refunded);

  return (
    <div className="rounded-xl border border-[#B8956A]/25 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1A1A1A]/45">Budget reconciliation</p>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-[#1A1A1A]/70 sm:grid-cols-4">
        <div>
          <dt className="text-[#1A1A1A]/40">Authorized</dt>
          <dd className="font-medium">{money(budget.ad_budget_cents)}</dd>
        </div>
        <div>
          <dt className="text-[#1A1A1A]/40">Verified spend</dt>
          <dd className="font-medium">{money(budget.spent_cents ?? 0)}</dd>
        </div>
        <div>
          <dt className="text-[#1A1A1A]/40">Unspent</dt>
          <dd className="font-medium">{money(unspent)}</dd>
        </div>
        <div>
          <dt className="text-[#1A1A1A]/40">Refund due</dt>
          <dd className="font-medium">{money(refundDue)}</dd>
        </div>
      </dl>
      <p className="mt-1 text-[11px] text-[#1A1A1A]/50">
        Management fee {money(budget.management_fee_cents)} is Arriv revenue and is never part of the advertising budget.
      </p>
      {reconciliation && (
        <p className="mt-1 text-[11px] text-[#1A1A1A]/50">
          Last reconciled {formatDate(reconciliation.reconciled_at)} by {reconciliation.reconciled_by} ·{" "}
          {money(reconciliation.spent_cents)} spent, {money(reconciliation.refund_due_cents)} refund due
        </p>
      )}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reconciliation note (what the Meta spend figure covers)"
        className="mt-2 w-full rounded-lg border border-[#B8956A]/30 px-3 py-2 text-sm outline-none focus:border-[#B8956A]"
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => onRun("manual_reconcile", { note })}
        disabled={!!busy}
        className="mt-2 border-[#B8956A]/40"
      >
        {busy === "manual_reconcile" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
        Reconcile budget
      </Button>
    </div>
  );
}
import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { AD_STATUS_LABELS, adminAdAction, formatDate, metric, money } from "@/lib/propertyAds";
import ManualKitPanel from "./ManualKitPanel";
import ManualLaunchForm from "./ManualLaunchForm";
import ManualActivationForm from "./ManualActivationForm";
import ManualResultsForm from "./ManualResultsForm";
import ManualStopPanel from "./ManualStopPanel";
import ManualReconciliationPanel from "./ManualReconciliationPanel";

// One campaign, in full, for an administrator: the exact creative and authorization the customer
// approved, the budget position, what the platform reported, and every action recorded in the audit
// trail. Nothing here launches on its own — each action re-checks the rules server-side.
export default function AdCampaignDetail({ campaignId, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setError("");
    try {
      const res = await adminAdAction("detail", { campaignId });
      if (res?.ok === false) setError(res.message || "That campaign could not be loaded.");
      else setData(res);
    } catch (err) {
      setError(err.message || "That campaign could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action, extra = {}) => {
    if (["reject", "terminate", "refund"].includes(action) && !window.confirm(`Confirm ${action} for this campaign?`)) return;
    setBusy(action);
    setError("");
    try {
      const res = await adminAdAction(action, { campaignId, reason, ...extra });
      if (res?.ok === false) setError(res.message || res.error || "That action could not be completed.");
      else {
        setReason("");
        await load();
        onChanged?.();
      }
    } catch (err) {
      setError(err.message || "That action could not be completed.");
    } finally {
      setBusy("");
    }
  };

  const campaign = data?.campaign;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-[#B8956A]/25 bg-white px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#1A1A1A]/45">Advertising campaign</p>
            <h2 className="font-serif text-xl text-[#1A1A1A]">{campaign ? AD_STATUS_LABELS[campaign.status] || campaign.status : "Loading"}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {loading ? (
          <div className="p-10 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#B8956A]" />
          </div>
        ) : !campaign ? (
          <p className="p-6 text-sm text-red-600">{error || "That campaign does not exist."}</p>
        ) : (
          <div className="space-y-4 p-5">
            {error && (
              <div className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" /> {error}
              </div>
            )}

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/40">Customer</dt><dd className="font-medium text-[#1A1A1A]">{campaign.client_name || campaign.client_email}</dd></div>
              <div><dt className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/40">Package</dt><dd className="font-medium text-[#1A1A1A]">{campaign.package_name}</dd></div>
              <div><dt className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/40">Paid</dt><dd className="font-medium text-[#1A1A1A]">{money(campaign.paid_amount_cents)}</dd></div>
              <div><dt className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/40">Ad budget</dt><dd className="font-medium text-[#1A1A1A]">{money(campaign.budget?.ad_budget_cents)}</dd></div>
              <div><dt className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/40">Spent</dt><dd className="font-medium text-[#1A1A1A]">{money(campaign.budget?.spent_cents ?? 0)}</dd></div>
              <div><dt className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/40">Refundable</dt><dd className="font-medium text-[#1A1A1A]">{money(campaign.refundable_cents)}</dd></div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/40">Customer's card</dt>
                <dd className="font-medium text-[#1A1A1A]">
                  {campaign.payment_state === "captured"
                    ? "Charged"
                    : campaign.payment_state === "authorized"
                      ? "Held, not charged"
                      : campaign.payment_state === "voided"
                        ? "Released, nothing charged"
                        : campaign.payment_state === "capture_failed"
                          ? "Charge failed"
                          : "Not taken"}
                </dd>
              </div>
              <div><dt className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/40">Starts</dt><dd className="font-medium text-[#1A1A1A]">{formatDate(campaign.started_at || campaign.scheduled_start_at)}</dd></div>
              <div><dt className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/40">Ends</dt><dd className="font-medium text-[#1A1A1A]">{formatDate(campaign.ends_at)}</dd></div>
            </dl>

            {campaign.creative && (
              <div className="rounded-xl border border-[#B8956A]/25 bg-[#FFFBF5] p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1A1A1A]/45">Approved creative</p>
                <p className="mt-1 font-semibold text-[#1A1A1A]">{campaign.creative.headline}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#1A1A1A]/70">{campaign.creative.primary_text}</p>
              </div>
            )}

            {campaign.fulfillment_mode === "manual" && (
              <div className="rounded-xl border border-[#B8956A]/40 bg-[#B8956A]/5 px-3 py-2 text-[11px] leading-relaxed text-[#1A1A1A]/70">
                <span className="font-semibold text-[#1A1A1A]">Manual Meta fulfilment.</span> Arriv builds and runs this campaign
                by hand in Meta Ads Manager. No advertising API is used, and none of the automatic launch switches apply.
              </div>
            )}

            {campaign.fulfillment_mode === "manual" && <ManualKitPanel kit={data?.manual_kit} />}

            {campaign.fulfillment_mode === "manual" && (
              <ManualStopPanel campaign={campaign} busy={busy} onRun={run} />
            )}

            {campaign.fulfillment_mode === "manual" && campaign.status === "READY_TO_LAUNCH" && (
              <ManualLaunchForm campaign={campaign} busy={busy} onRun={run} />
            )}

            {campaign.fulfillment_mode === "manual" && campaign.status === "SUBMITTED" && (
              <ManualActivationForm campaign={campaign} busy={busy} onRun={run} blockers={data?.blockers} />
            )}

            {campaign.fulfillment_mode === "manual" &&
              ["SUBMITTED", "ACTIVE", "PAUSED", "COMPLETED"].includes(campaign.status) && (
                <ManualResultsForm campaign={campaign} busy={busy} onRun={run} />
              )}

            {campaign.fulfillment_mode === "manual" && (
              <ManualReconciliationPanel campaign={campaign} busy={busy} onRun={run} />
            )}

            <div className="rounded-xl border border-[#B8956A]/20 p-3 text-xs text-[#1A1A1A]/65">
              <p>Authorization: {campaign.authorization_current ? "current" : "not current — launch is blocked"}</p>
              <p className="mt-1">Provider: {campaign.provider} {campaign.provider_campaign_id ? `· ${campaign.provider_campaign_id}` : "· not created yet"}</p>
              <p className="mt-1">Results: {campaign.metrics?.reported_at ? `${metric(campaign.metrics.impressions)} impressions · ${metric(campaign.metrics.clicks)} clicks` : "not reported yet"}</p>
              {(campaign.launch_blocks || []).length > 0 && (
                <ul className="mt-2 list-disc pl-4 text-amber-800">
                  {campaign.launch_blocks.map((block) => (
                    <li key={block}>{block}</li>
                  ))}
                </ul>
              )}
            </div>

            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1A1A1A]/45">Reason (used by reject, pause, refund)</span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Stated reason recorded in the audit trail"
                className="mt-1 w-full rounded-lg border border-[#B8956A]/30 px-3 py-2 text-sm outline-none focus:border-[#B8956A]"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {[
                ["approve", "Approve"],
                // The API launch and platform sync never apply to a hand-built campaign.
                ...(campaign.fulfillment_mode === "manual" ? [] : [["launch", "Launch"], ["sync", "Sync from platform"]]),
                ["pause", "Pause"],
                ["resume", "Resume"],
                ["reject", "Reject"],
                ["refund", "Refund"],
                ["terminate", "Terminate"],
              ].map(([action, label]) => (
                <Button
                  key={action}
                  size="sm"
                  variant={["reject", "refund", "terminate"].includes(action) ? "outline" : "default"}
                  onClick={() => run(action)}
                  disabled={!!busy}
                  className={["reject", "refund", "terminate"].includes(action) ? "border-red-300 text-red-700 hover:bg-red-50" : "bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"}
                >
                  {busy === action ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                  {label}
                </Button>
              ))}
            </div>

            <div className="rounded-xl border border-[#B8956A]/20 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1A1A1A]/45">Audit trail</p>
              <ul className="mt-2 space-y-1">
                {(campaign.events || []).slice(-12).reverse().map((event, index) => (
                  <li key={`${event.type}-${index}`} className="text-[11px] text-[#1A1A1A]/60">
                    <span className="font-medium text-[#1A1A1A]/80">{event.type}</span> · {formatDate(event.at)} {event.actor ? `· ${event.actor}` : ""} {event.note ? `· ${event.note}` : ""}
                  </li>
                ))}
                {!(campaign.events || []).length && <li className="text-[11px] text-[#1A1A1A]/45">No events recorded yet.</li>}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
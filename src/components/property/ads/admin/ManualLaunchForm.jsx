import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const fieldClass = "mt-1 w-full rounded-lg border border-[#B8956A]/30 px-3 py-2 text-sm outline-none focus:border-[#B8956A]";

// Records the campaign that actually exists in Meta Ads Manager. This moves the campaign to
// "created, awaiting confirmation" — never to Active.
export default function ManualLaunchForm({ campaign, busy, onRun }) {
  const [metaCampaignId, setMetaCampaignId] = useState("");
  const [launchedOn, setLaunchedOn] = useState(new Date().toISOString().slice(0, 10));
  const [endOn, setEndOn] = useState("");
  const [accountLabel, setAccountLabel] = useState("");
  const [accountVerified, setAccountVerified] = useState(false);
  const [note, setNote] = useState("");

  if (!campaign) return null;

  const submit = () =>
    onRun("manual_launch", {
      meta_campaign_id: metaCampaignId,
      launched_on: launchedOn,
      scheduled_end_on: endOn,
      account_label: accountLabel,
      account_verified: accountVerified,
      note,
    });

  return (
    <div className="rounded-xl border border-[#B8956A]/30 bg-white p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1A1A1A]/45">Record the Meta campaign</p>
      <p className="mt-1 text-[11px] leading-relaxed text-[#1A1A1A]/55">
        Create the campaign in Meta Ads Manager, then record it here. Nothing is sent to Meta by Arriv.
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/45">Meta campaign ID</span>
          <input value={metaCampaignId} onChange={(e) => setMetaCampaignId(e.target.value)} placeholder="120210000000000" className={fieldClass} />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/45">Verified ad account</span>
          <input value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} placeholder="act_… · Arriv Media" className={fieldClass} />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/45">Actual launch date</span>
          <input type="date" value={launchedOn} onChange={(e) => setLaunchedOn(e.target.value)} className={fieldClass} />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/45">Campaign end date (in Meta)</span>
          <input type="date" value={endOn} onChange={(e) => setEndOn(e.target.value)} className={fieldClass} />
        </label>
      </div>
      <label className="mt-2 block">
        <span className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/45">Note</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was created and where" className={fieldClass} />
      </label>
      <label className="mt-2 flex items-start gap-2 text-[11px] leading-relaxed text-[#1A1A1A]/65">
        <input type="checkbox" checked={accountVerified} onChange={(e) => setAccountVerified(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-[#B8956A]" />
        I confirmed this campaign sits in an Arriv-controlled, verified advertising account.
      </label>
      <Button
        size="sm"
        onClick={submit}
        disabled={!!busy}
        className="mt-3 bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
      >
        {busy === "manual_launch" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
        Record launch
      </Button>
    </div>
  );
}
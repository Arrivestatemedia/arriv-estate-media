import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const CHECKS = [
  ["housing_category", "The campaign was created with the housing special ad category."],
  ["approved_creative", "The approved creative and copy are what the customer approved."],
  ["budget_ceiling", "The Meta budget ceiling matches the authorized advertising budget."],
  ["end_date", "The campaign ends on the recorded end date."],
];

// The four confirmations owed before a manually created campaign is recorded as Active.
export default function ManualActivationForm({ campaign, busy, onRun, blockers }) {
  const [checked, setChecked] = useState({});
  const [note, setNote] = useState("");
  if (!campaign) return null;

  const allChecked = CHECKS.every(([key]) => checked[key] === true);

  return (
    <div className="rounded-xl border border-[#B8956A]/30 bg-white p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1A1A1A]/45">Confirm the campaign is running</p>
      <p className="mt-1 text-[11px] leading-relaxed text-[#1A1A1A]/55">
        Meta campaign {campaign.manual?.meta_campaign_id} · created {campaign.manual?.launched_on?.slice(0, 10)} · ends{" "}
        {campaign.manual?.scheduled_end_on?.slice(0, 10)}
      </p>
      <div className="mt-2 space-y-1.5">
        {CHECKS.map(([key, label]) => (
          <label key={key} className="flex items-start gap-2 text-[11px] leading-relaxed text-[#1A1A1A]/70">
            <input
              type="checkbox"
              checked={checked[key] === true}
              onChange={(e) => setChecked((current) => ({ ...current, [key]: e.target.checked }))}
              className="mt-0.5 h-3.5 w-3.5 accent-[#B8956A]"
            />
            {label}
          </label>
        ))}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note recorded in the audit trail"
        className="mt-2 w-full rounded-lg border border-[#B8956A]/30 px-3 py-2 text-sm outline-none focus:border-[#B8956A]"
      />
      {(blockers || []).length > 0 && (
        <ul className="mt-2 list-disc pl-4 text-[11px] text-amber-800">
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      )}
      <Button
        size="sm"
        onClick={() => onRun("manual_activate", { ...checked, note })}
        disabled={!!busy || !allChecked}
        className="mt-3 bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
      >
        {busy === "manual_activate" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
        Mark active
      </Button>
    </div>
  );
}
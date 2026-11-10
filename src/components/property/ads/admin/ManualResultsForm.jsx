import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { formatDate, money } from "@/lib/propertyAds";

const fieldClass = "mt-1 w-full rounded-lg border border-[#B8956A]/30 px-3 py-2 text-sm outline-none focus:border-[#B8956A]";

// Results read from Meta Ads Manager. Entered by hand or imported from a pasted CSV/JSON export;
// every entry keeps its source and timestamp, and spend flows through the same budget ledger.
export default function ManualResultsForm({ campaign, busy, onRun }) {
  const [form, setForm] = useState({ impressions: "", reach: "", clicks: "", spend: "" });
  const [mode, setMode] = useState("manual");
  const [importText, setImportText] = useState("");
  const [note, setNote] = useState("");
  if (!campaign) return null;

  const lastEntry = (campaign.manual_metrics || [])[campaign.manual_metrics.length - 1];

  const submit = () => {
    const payload = { source: "Meta Ads Manager", note, verified: true };
    if (mode === "import") {
      onRun("manual_metrics", { ...payload, import_text: importText });
    } else {
      onRun("manual_metrics", {
        ...payload,
        rows: [{
          impressions: form.impressions,
          reach: form.reach,
          clicks: form.clicks,
          spend: form.spend,
          note,
        }],
      });
    }
  };

  return (
    <div className="rounded-xl border border-[#B8956A]/30 bg-white p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1A1A1A]/45">Record results from Meta Ads Manager</p>
      <p className="mt-1 text-[11px] leading-relaxed text-[#1A1A1A]/55">
        Cumulative totals, not increments. These are the only figures the customer sees, and they are labelled as manually reported.
      </p>

      {lastEntry && (
        <p className="mt-1 text-[11px] text-[#1A1A1A]/50">
          Last recorded {formatDate(lastEntry.at)} · {Number(lastEntry.impressions || 0).toLocaleString()} impressions ·{" "}
          {money(lastEntry.spend_cents)} spend
        </p>
      )}

      <div className="mt-2 flex gap-2">
        {[["manual", "Enter figures"], ["import", "Import export"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${mode === key ? "bg-[#B8956A] text-[#1A1A1A]" : "border border-[#B8956A]/30 text-[#1A1A1A]/60"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "manual" ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            ["impressions", "Impressions"],
            ["reach", "Reach"],
            ["clicks", "Clicks"],
            ["spend", "Spend (USD)"],
          ].map(([key, label]) => (
            <label key={key} className="block">
              <span className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/45">{label}</span>
              <input
                value={form[key]}
                onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
                inputMode="decimal"
                placeholder="0"
                className={fieldClass}
              />
            </label>
          ))}
        </div>
      ) : (
        <label className="mt-2 block">
          <span className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/45">Paste the Meta export (CSV with a header row, or JSON)</span>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={5}
            placeholder={"impressions,reach,clicks,spend\n12000,9000,140,84.50"}
            className={`${fieldClass} font-mono text-[11px]`}
          />
        </label>
      )}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (what was read, and when)"
        className={fieldClass}
      />
      <Button
        size="sm"
        onClick={submit}
        disabled={!!busy}
        className="mt-3 bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
      >
        {busy === "manual_metrics" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
        Save figures
      </Button>
    </div>
  );
}
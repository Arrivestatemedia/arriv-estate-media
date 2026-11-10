import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/propertyAds";

// An urgently required stop. Arriv cannot stop a hand-built campaign, so the ad keeps its real
// status until an administrator confirms in Meta Ads Manager that it is stopped.
export default function ManualStopPanel({ campaign, busy, onRun }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  if (!campaign) return null;

  const stop = campaign.manual_stop || {};
  const required = stop.required === true;
  const confirmed = stop.confirmed === true;
  const live = ["SUBMITTED", "ACTIVE"].includes(campaign.status);

  if (!required) {
    if (!live) return null;
    return (
      <div className="rounded-xl border border-[#B8956A]/25 p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1A1A1A]/45">Stop advertising</p>
        <p className="mt-1 text-[11px] leading-relaxed text-[#1A1A1A]/55">
          Requesting a stop raises an urgent action. The campaign is not recorded as paused until you confirm it in Meta.
        </p>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why this campaign must stop"
          className="mt-2 w-full rounded-lg border border-[#B8956A]/30 px-3 py-2 text-sm outline-none focus:border-[#B8956A]"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => onRun("manual_stop_request", { reason })}
          disabled={!!busy || !reason.trim()}
          className="mt-2 border-red-300 text-red-700 hover:bg-red-50"
        >
          {busy === "manual_stop_request" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
          Request stop in Meta
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3">
      <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-red-800">
        <AlertTriangle className="h-3.5 w-3.5" /> Stop required in Meta Ads Manager
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-red-900/85">{stop.reason || "This campaign must be stopped."}</p>
      <p className="mt-1 text-[11px] text-red-900/70">
        Requested {formatDate(stop.requested_at)} by {stop.requested_by || "Arriv"}
      </p>
      {confirmed ? (
        <p className="mt-2 text-[11px] font-semibold text-red-900">
          Confirmed stopped in Meta on {formatDate(stop.confirmed_at)} by {stop.confirmed_by}.
        </p>
      ) : (
        <>
          <p className="mt-2 text-[11px] font-medium text-red-900">
            This campaign is still recorded as {campaign.status}. Stop it in Meta, then confirm here.
          </p>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What you saw and did in Meta Ads Manager"
            className="mt-2 w-full rounded-lg border border-red-300 px-3 py-2 text-sm outline-none focus:border-red-500"
          />
          <Button
            size="sm"
            onClick={() => onRun("manual_stop_confirm", { note, reason: stop.reason })}
            disabled={!!busy || !note.trim()}
            className="mt-2 bg-red-600 text-white hover:bg-red-700"
          >
            {busy === "manual_stop_confirm" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Confirm stopped in Meta
          </Button>
        </>
      )}
    </div>
  );
}
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Eye, Send, ExternalLink, AlertCircle, CheckCircle2, Copy, Check, Clock } from "lucide-react";

function formatWhen(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * BrightSubmissionPanel
 * The administrator's Bright Media Sync controls for one request.
 *
 * "Preview" shows the exact body that would be POSTed, with where every field came from and what is
 * still missing — so the payload can be checked against Bright's schema before anything is sent.
 * "Send" is the only path to Bright's API and it never releases a customer's media on its own: the
 * certification switches stay off until every Bright test has passed.
 */
export default function BrightSubmissionPanel({ request, onUpdated }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  const call = async (mode, extra = {}) => {
    setBusy(mode);
    setError(null);
    try {
      const res = await base44.functions.fetch("/transmitBrightManifest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.request_id, mode, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (mode === "preview") {
        if (!res.ok || data?.error) throw new Error(data?.error || "Could not build the Bright payload");
        setPreview(data);
        return;
      }
      if (!res.ok || data?.error) {
        if (data?.request && onUpdated) onUpdated(data.request);
        throw new Error(data?.error || "Bright did not accept the manifest");
      }
      if (onUpdated && data?.request) onUpdated(data.request);
      setPreview(null);
    } catch (err) {
      setError(err.message || "That action could not be completed");
    } finally {
      setBusy(null);
      setConfirming(false);
    }
  };

  const copyPayload = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(preview?.payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="rounded-lg border border-[#B8956A]/25 bg-[#FFFBF5] p-2.5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/50">Bright Media Sync</p>
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white border border-[#B8956A]/25 text-[#8a6d4a]">
          {request.bright_manifest_id ? "Sent to Bright" : "Not sent yet"}
        </span>
      </div>

      {request.bright_manifest_id ? (
        <div className="space-y-1.5">
          <p className="text-[11px] text-[#1A1A1A]/60">
            Manifest <span className="font-mono">{request.bright_manifest_id}</span> · accepted {formatWhen(request.bright_submitted_at)}
          </p>
          {request.bright_import_url && (
            <a
              href={request.bright_import_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-[#8a6d4a] hover:underline"
            >
              <ExternalLink className="w-3 h-3" /> Open Bright import
            </a>
          )}
          <p className="text-[11px] text-[#1A1A1A]/50">
            Opening the import link hands the media to the listing; it is not proof the import finished. Mark this request
            completed only once Bright shows the photos on the listing.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {request.bright_last_error && (
            <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 flex items-start gap-1.5">
              <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" /> {request.bright_last_error}
            </p>
          )}
          {request.bright_needs_verification && (
            <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 space-y-1.5">
              <p className="text-[11px] text-amber-900">
                An earlier attempt may have reached Bright before it failed. Nothing is retried automatically — check Bright
                for this property first, then resend only if no manifest is there.
              </p>
              <Button
                size="sm"
                onClick={() => call("submit", { confirmedNotReceived: true })}
                disabled={!!busy}
                className="bg-amber-600 hover:bg-amber-700 text-white h-8 text-xs"
              >
                {busy === "submit" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <AlertCircle className="w-3.5 h-3.5 mr-1" />}
                Confirmed not in Bright — resend
              </Button>
            </div>
          )}

          {request.bright_next_retry_at && (
            <p className="text-[11px] text-[#1A1A1A]/60 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Retry from {formatWhen(request.bright_next_retry_at)}
            </p>
          )}
          {!request.bright_last_error && (
            <p className="text-[11px] text-[#1A1A1A]/55">
              Nothing has been sent to Bright for this request. Preview the payload first, then send.
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-0.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => call("preview")}
              disabled={!!busy}
              className="border-[#B8956A]/30 h-8 text-xs"
            >
              {busy === "preview" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
              Preview payload
            </Button>
            {confirming ? (
              <Button size="sm" onClick={() => call("submit")} disabled={!!busy} className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A] h-8 text-xs">
                {busy === "submit" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                Confirm send
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirming(true)}
                disabled={!!busy}
                className="border-[#B8956A]/40 text-[#8a6d4a] h-8 text-xs"
              >
                <Send className="w-3.5 h-3.5 mr-1" /> Send to Bright
              </Button>
            )}
          </div>
          {confirming && (
            <p className="text-[11px] text-amber-900">
              This POSTs the manifest to Bright and creates a real manifestId. Confirm to continue.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</p>
      )}

      {preview && (
        <div className="rounded border border-[#B8956A]/25 bg-white p-2 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-[#1A1A1A]/70">
              {preview.configured ? (
                <span className="flex items-center gap-1 text-[#8a6d4a]"><CheckCircle2 className="w-3 h-3" /> Ready to send</span>
              ) : (
                <span className="text-amber-800">Not ready — {preview.missing?.length} setting(s) missing</span>
              )}
            </p>
            <button
              onClick={copyPayload}
              className="text-[11px] text-[#1A1A1A]/60 hover:text-[#B8956A] flex items-center gap-1 px-2 py-1 rounded border border-[#B8956A]/25"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy JSON
            </button>
          </div>

          {(preview.gaps || []).length > 0 && (
            <ul className="text-[11px] text-amber-900 space-y-0.5">
              {preview.gaps.map((g, i) => <li key={i}>• {g}</li>)}
            </ul>
          )}

          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#1A1A1A]/45 mb-1">Field sources</p>
            <ul className="text-[10px] text-[#1A1A1A]/60 space-y-0.5">
              {(preview.field_map || []).map((f, i) => (
                <li key={i} className="flex flex-wrap gap-1">
                  <span className="font-mono text-[#1A1A1A]/75">{f.bright_field}</span>
                  <span className={f.status === "mapped" ? "text-[#8a6d4a]" : "text-amber-700"}>{f.status}</span>
                  <span className="text-[#1A1A1A]/45">← {f.source}</span>
                </li>
              ))}
            </ul>
          </div>

          {(preview.assumptions || []).length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#1A1A1A]/45 mb-1">Assumptions to verify with Bright</p>
              <ul className="text-[10px] text-[#1A1A1A]/60 space-y-0.5">
                {preview.assumptions.map((a, i) => <li key={i}>• {a}</li>)}
              </ul>
            </div>
          )}

          <pre className="text-[10px] leading-relaxed bg-[#1A1A1A] text-[#FFFBF5] rounded p-2 max-h-64 overflow-auto whitespace-pre-wrap break-all">
            {JSON.stringify(preview.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
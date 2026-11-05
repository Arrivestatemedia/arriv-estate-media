import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, Download, Copy, Check, ExternalLink, Youtube, ImageIcon, Video,
  Clock, AlertCircle, CheckCircle2, Flag, PlayCircle,
} from "lucide-react";

const STATUS_LABEL = {
  submitted: "Submitted",
  processing: "Processing",
  photos_uploaded: "Photos uploaded",
  video_added: "Video added",
  completed: "Completed",
  needs_attention: "Needs attention",
  cancelled: "Cancelled",
};

function formatWhen(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * MlsRequestDetail
 * The administrator's working view of one MLS request: exactly the photographs the customer chose,
 * in their order, plus the unbranded YouTube links, with the actions that move it to completion.
 *
 * The same component is used inside the job view and inside the upload queue, so an administrator
 * never has to hunt through a second page to find what a request actually contains.
 */
export default function MlsRequestDetail({ request, onUpdated }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [notes, setNotes] = useState(request?.admin_notes || "");
  const [thumbnails, setThumbnails] = useState({});

  useEffect(() => {
    setNotes(request?.admin_notes || "");
  }, [request?.id, request?.admin_notes]);

  // Thumbnails come from the same delivery folder the customer sees. This is a preview only —
  // the upload package is built server-side from the customer's selection.
  useEffect(() => {
    let cancelled = false;
    if (!request?.job_id) return;
    base44.functions
      .invoke("getJobMediaForClient", { jobId: request.job_id, adminPreview: true })
      .then((res) => {
        const data = res?.data || res;
        const map = {};
        (data?.files || []).forEach((f) => { map[f.id] = f; });
        if (!cancelled) setThumbnails(map);
      })
      .catch(() => { /* names still render without previews */ });
    return () => { cancelled = true; };
  }, [request?.job_id]);

  if (!request) return null;

  const photos = (request.selected_media || []).filter((m) => m.kind === "photo");
  const videos = (request.selected_media || []).filter((m) => m.kind === "video");
  const closed = ["completed", "cancelled"].includes(request.status);

  const act = async (action, payload = {}) => {
    setBusy(action);
    setError(null);
    try {
      const res = await base44.functions.invoke("manageMlsUploadRequest", {
        requestId: request.request_id,
        action,
        ...payload,
      });
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      if (onUpdated) onUpdated(data.request);
    } catch (err) {
      setError(err.message || "That action could not be completed");
    } finally {
      setBusy(null);
    }
  };

  const downloadPhotos = async () => {
    setBusy("download");
    setError(null);
    try {
      const res = await base44.functions.fetch("/downloadMlsPhotosZip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.request_id }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.error || "Could not build the photo package");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${request.mls_number}_photos.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || "Could not build the photo package");
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-[#1A1A1A]">MLS #{request.mls_number}</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-[#B8956A]/15 text-[#8a6d4a]">
              {STATUS_LABEL[request.status] || request.status}
            </span>
          </div>
          <p className="text-sm text-[#1A1A1A]/60">{request.property_address}</p>
          <p className="text-xs text-[#1A1A1A]/45 mt-0.5">
            {request.client_name || "—"} · {request.client_email}
          </p>
        </div>
        <div className="text-right text-xs text-[#1A1A1A]/50">
          <p>Submitted {formatWhen(request.submitted_at)}</p>
          <p className="flex items-center justify-end gap-1 text-[#B8956A] font-medium">
            <Clock className="w-3 h-3" /> Due {request.deadline_label || "—"}
          </p>
        </div>
      </div>

      {/* Photos */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/50 mb-2">
          Customer photo order ({photos.length})
        </p>
        {photos.length === 0 ? (
          <p className="text-xs text-[#1A1A1A]/40">No photographs on this request.</p>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {photos.map((p, idx) => {
              const meta = thumbnails[p.drive_file_id];
              return (
                <div key={p.drive_file_id} className="relative rounded-lg overflow-hidden border border-[#B8956A]/20 bg-[#FFFBF5]">
                  {meta?.thumbnailLink ? (
                    <img src={meta.thumbnailLink} alt={p.name} className="w-full h-16 object-cover" />
                  ) : (
                    <div className="w-full h-16 flex items-center justify-center"><ImageIcon className="w-4 h-4 text-[#B8956A]/40" /></div>
                  )}
                  <span className="absolute top-1 left-1 px-1 rounded bg-black/60 text-[9px] font-bold text-white">
                    {String(idx + 1).padStart(3, "0")}
                  </span>
                  <p className="px-1 py-0.5 text-[9px] text-[#1A1A1A]/60 truncate">{p.name}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Videos */}
      {videos.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/50 mb-2">
            Unbranded video ({videos.length})
          </p>
          <div className="space-y-1.5">
            {videos.map((v) => (
              <div key={v.drive_file_id} className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg border border-[#B8956A]/20 bg-white">
                <span className="flex items-center gap-2 min-w-0">
                  <Video className="w-4 h-4 text-[#B8956A] shrink-0" />
                  <span className="text-sm text-[#1A1A1A]/70 truncate">{v.name}</span>
                </span>
                {v.youtube_url ? (
                  <span className="flex items-center gap-1.5">
                    <a href={v.youtube_url} target="_blank" rel="noreferrer" className="text-xs text-[#8a6d4a] flex items-center gap-1 hover:underline">
                      <ExternalLink className="w-3 h-3" /> Open
                    </a>
                    <button onClick={() => copyLink(v.youtube_url)} className="text-xs text-[#1A1A1A]/60 hover:text-[#B8956A] flex items-center gap-1 px-2 py-1 rounded border border-[#B8956A]/25">
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy link
                    </button>
                  </span>
                ) : (
                  <span className="text-xs text-amber-700 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> YouTube link not ready yet
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(request.unsupported_media || []).length > 0 && (
        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-[11px] font-semibold text-amber-900 mb-1">Excluded at submission</p>
          <ul className="text-[11px] text-amber-900/80 space-y-0.5">
            {request.unsupported_media.map((m, i) => <li key={i}>• {m}</li>)}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={downloadPhotos} disabled={busy === "download" || photos.length === 0} className="border-[#B8956A]/40 text-[#8a6d4a]">
          {busy === "download" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
          Download photos ZIP
        </Button>
        {!closed && (
          <>
            <Button size="sm" variant="outline" onClick={() => act("processing")} disabled={!!busy} className="border-[#B8956A]/30">
              <PlayCircle className="w-4 h-4 mr-1" /> Mark processing
            </Button>
            <Button size="sm" variant="outline" onClick={() => act("photos_uploaded")} disabled={!!busy || request.photo_upload_status === "uploaded"} className="border-[#B8956A]/30">
              <CheckCircle2 className="w-4 h-4 mr-1" /> Photos uploaded
            </Button>
            {request.video_upload_status !== "not_required" && (
              <Button size="sm" variant="outline" onClick={() => act("video_added")} disabled={!!busy || request.video_upload_status === "added"} className="border-[#B8956A]/30">
                <Youtube className="w-4 h-4 mr-1" /> Video added
              </Button>
            )}
            <Button size="sm" onClick={() => act("complete")} disabled={!!busy || request.status === "completed"}>
              Mark completed
            </Button>
            <Button size="sm" variant="outline" onClick={() => act("needs_attention", { reason: notes || "Needs attention" })} disabled={!!busy} className="border-amber-300 text-amber-700">
              <Flag className="w-4 h-4 mr-1" /> Needs attention
            </Button>
          </>
        )}
      </div>

      {/* Notes + history */}
      <div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Administrative notes (MLS number issues, listing access, anything the next person needs)"
          className="text-sm"
        />
        <div className="flex justify-end mt-1.5">
          <Button size="sm" variant="ghost" onClick={() => act("note", { note: notes })} disabled={!!busy || !notes || notes === request.admin_notes} className="text-[#8a6d4a]">
            {busy === "note" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null} Save note
          </Button>
        </div>
      </div>

      {(request.status_history || []).length > 0 && (
        <div className="border-t border-[#B8956A]/15 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/40 mb-1">History</p>
          <ul className="space-y-0.5">
            {request.status_history.slice().reverse().map((h, i) => (
              <li key={i} className="text-[11px] text-[#1A1A1A]/55">
                <span className="font-medium text-[#1A1A1A]/70">{STATUS_LABEL[h.status] || h.status}</span> — {formatWhen(h.at)} · {h.actor}{h.note ? ` · ${h.note}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 text-xs text-red-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
        </div>
      )}
    </div>
  );
}
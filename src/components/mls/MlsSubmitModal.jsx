import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, ImageIcon, Video, AlertCircle, CheckCircle2, ArrowUp, ArrowDown,
  ShieldCheck, Clock, Youtube, Copy, Check, MapPin, Search, ExternalLink,
} from "lucide-react";
import MlsDestinationSelector from "@/components/mls/MlsDestinationSelector";

export const MLS_AUTHORIZATION_TEXT =
  "I confirm I have permission to request that Arriv Estate Media upload the selected media to the MLS listing for this property, and that I am authorized to act for this listing.";

const STATUS_COPY = {
  submitted: "Submitted — Arriv has your request",
  processing: "In progress — Arriv is uploading to the MLS",
  photos_uploaded: "Photos uploaded",
  video_added: "Video link added",
  completed: "Completed",
  needs_attention: "Needs attention",
  cancelled: "Cancelled",
};

function formatBytes(size) {
  const bytes = Number(size || 0);
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb < 1 ? `${(bytes / 1024).toFixed(0)} KB` : `${(mb).toFixed(1)} MB`;
}

/**
 * MlsSubmitModal
 * The customer's Publish to MLS request. The MLS itself is not a choice: the property's booking
 * address already decided it (see getMlsUploadRequests → routing), so this shows the route that
 * applies, the media summary, the photo order, the authorization and the estimated deadline.
 */
export default function MlsSubmitModal({ open, onClose, jobId, clientEmail, files, selectedIds, onSubmitted }) {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [mlsNumber, setMlsNumber] = useState("");
  const [photoOrder, setPhotoOrder] = useState([]);
  const [authorized, setAuthorized] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(null);
  const [copied, setCopied] = useState(null);
  // Only relevant when several MLS systems cover the property (see MlsDestinationSelector).
  const [selectedProviders, setSelectedProviders] = useState([]);
  const [mlsNumbers, setMlsNumbers] = useState({});

  const routing = config?.routing || null;

  const selectedFiles = useMemo(
    () => (files || []).filter((f) => (selectedIds || []).includes(f.id)),
    [files, selectedIds],
  );
  const selectedPhotos = useMemo(() => selectedFiles.filter((f) => f.isImage), [selectedFiles]);
  const selectedVideos = useMemo(() => selectedFiles.filter((f) => f.isVideo), [selectedFiles]);
  const youtubeFor = (fileId) => (config?.youtube || []).find((y) => y.drive_file_id === fileId) || null;

  const loadRouting = () =>
    base44.functions
      .invoke("getMlsUploadRequests", {
        mode: "client",
        jobId,
        clientEmail,
        estimateDeadline: true,
      })
      .then((res) => {
        const data = res?.data || res;
        if (data?.error) throw new Error(data.error);
        setConfig(data);
        // Preselected per the policy the interface states: every MLS that legitimately covers the
        // property. The customer changes the set before submitting.
        setSelectedProviders((data?.destinations || []).map((d) => d.provider_id));
        // Start from the gallery's order, which is the delivered order.
        setPhotoOrder(selectedFiles.filter((f) => f.isImage).map((f) => f.id));
        return data;
      });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSubmitted(null);
    setError(null);
    setMlsNumber("");
    setAuthorized(false);
    setSelectedProviders([]);
    setMlsNumbers({});

    loadRouting()
      .catch((err) => { if (!cancelled) setLoadError(err.message || "Could not load MLS settings"); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jobId, clientEmail]);

  const numberError = useMemo(() => {
    const value = mlsNumber.trim();
    if (!value) return null;
    const pattern = routing?.number_pattern;
    if (!pattern) return null;
    try {
      const re = new RegExp(pattern);
      const normalized = routing?.provider_id === "fmls"
        ? value.replace(/[^0-9]/g, "")
        : value.replace(/\s+/g, "").toUpperCase();
      if (!re.test(normalized)) {
        return `That doesn't look like a ${routing?.provider_short_label || "MLS"} listing number. ${routing?.number_hint || ""}.`;
      }
    } catch { /* no usable pattern */ }
    return null;
  }, [mlsNumber, routing]);

  const movePhoto = (id, direction) => {
    setPhotoOrder((prev) => {
      const list = [...prev];
      const idx = list.indexOf(id);
      if (idx === -1) return prev;
      const target = idx + direction;
      if (target < 0 || target >= list.length) return prev;
      [list[idx], list[target]] = [list[target], list[idx]];
      return list;
    });
  };

  const orderedPhotos = photoOrder
    .map((id) => selectedPhotos.find((f) => f.id === id))
    .filter(Boolean);

  const readyVideoLinks = selectedVideos.filter((v) => !!youtubeFor(v.id)?.youtube_url).length;

  // One eligible MLS → nothing is asked, exactly as before. Several overlapping systems → the
  // customer's selection decides, and every checked MLS is its own destination.
  const destinations = config?.destinations || [];
  const multipleDestinations = destinations.length > 1;
  const chosenDestinations = destinations.filter((d) => selectedProviders.includes(d.provider_id));
  const chosenNeedingNumbers = chosenDestinations.filter((d) => d.requires_listing_number);
  const destinationNumbersReady = multipleDestinations
    ? chosenDestinations.length > 0 &&
      chosenNeedingNumbers.every((d) => String(mlsNumbers[d.provider_id] || "").trim().length > 0)
    : true;
  const photoLimit = multipleDestinations
    ? Math.min(...chosenDestinations.map((d) => Number(d.photo_limit) || 200), 200)
    : routing?.photo_limit;
  const importUrl = submitted?.import_links?.[0]?.url || submitted?.request?.bright_import_url || "";

  // Bright's redirect opens the customer's own Bright session, so it is opened as soon as it exists.
  // The button below stays as the fallback when a browser blocks the automatic window.
  const autoOpenedUrl = useRef("");
  useEffect(() => {
    if (!importUrl || autoOpenedUrl.current === importUrl) return;
    autoOpenedUrl.current = importUrl;
    const opened = window.open(importUrl, "_blank", "noopener,noreferrer");
    if (opened) opened.opener = null;
  }, [importUrl]);

  const requiresNumber = !multipleDestinations && !!routing?.requires_listing_number;
  const numberReady = requiresNumber
    ? mlsNumber.trim().length > 0 && !numberError
    : !numberError;

  const canSubmit = !loading && !submitting && !!routing?.can_submit && authorized && numberReady
    && destinationNumbersReady && (selectedPhotos.length > 0 || readyVideoLinks > 0);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // The provider is resolved server-side from the property address; nothing about the MLS
      // is chosen or sent from here.
      const payload = {
        jobId,
        clientEmail,
        mlsNumber,
        selectedMedia: [
          ...orderedPhotos.map((f) => ({ id: f.id, name: f.name, kind: "photo" })),
          ...selectedVideos.map((f) => ({ id: f.id, name: f.name, kind: "video" })),
        ],
        photoOrder: orderedPhotos.map((f) => f.id),
        authorizationConfirmed: authorized,
        authorizationText: MLS_AUTHORIZATION_TEXT,
        // Only sent when several MLS overlap; the server re-resolves eligibility and rejects
        // anything that does not actually cover this property.
        selectedProviders: multipleDestinations ? selectedProviders : [],
        mlsNumbers: multipleDestinations ? mlsNumbers : {},
        // Only when the customer completed the address in this modal: the server judges and records
        // the request against the address that was actually checked.
      };
      const res = await base44.functions.invoke("submitMlsUploadRequest", payload);
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      setSubmitted(data);
      if (onSubmitted) onSubmitted(data);
    } catch (err) {
      const failure = err?.response?.data || err?.data || null;
      setError(failure?.error || err.message || "Could not submit your MLS request");
      if (failure?.plan?.eligible) setConfig((prev) => (prev ? { ...prev, destinations: failure.plan.eligible } : prev));
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 1800);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#B8956A]" />
            Publish to MLS
          </DialogTitle>
          <p className="text-sm text-[#1A1A1A]/60">
            We'll upload your selected media to the MLS for this property. Nothing changes about your downloads.
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-10 justify-center text-sm text-[#1A1A1A]/50">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking your property's MLS coverage...
          </div>
        ) : submitted ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[#B8956A]/10 border border-[#B8956A]/30">
              <CheckCircle2 className="w-5 h-5 text-[#B8956A] shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-[#1A1A1A]">{submitted.already_submitted ? "Already with us" : "Request submitted"}</p>
                <p className="text-sm text-[#1A1A1A]/60 mt-1">
                  {submitted.request?.mls_number ? `Listing #${submitted.request.mls_number} — ` : ""}
                  {submitted.request?.photo_count || 0} photos, {submitted.request?.video_count || 0} videos
                  {submitted.provider_label ? ` · via ${submitted.provider_label}` : ""}
                </p>
                {submitted.next_step && (
                  <p className="text-xs text-[#1A1A1A]/55 mt-1.5">{submitted.next_step}</p>
                )}
              </div>
            </div>

            {(submitted.results || []).length > 0 && (
              <div className="rounded-xl border border-[#B8956A]/20 bg-white p-3 space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/50">Publishing destinations</p>
                {submitted.results.map((r) => (
                  <div key={r.provider_id} className="flex items-start justify-between gap-2 text-sm">
                    <span className="text-[#1A1A1A]">{r.provider_label}</span>
                    <span className={`text-xs shrink-0 ${r.status === "failed" ? "text-red-600" : "text-[#B8956A]"}`}>
                      {r.status === "failed" ? (r.error || "Could not submit") : r.status === "duplicate" ? "Already submitted" : "Submitted"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {submitted.deadline_label && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-white border border-[#B8956A]/20">
                <Clock className="w-5 h-5 text-[#B8956A] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-[#1A1A1A]">Estimated completion</p>
                  <p className="text-sm text-[#1A1A1A]/60">{submitted.deadline_label}</p>
                  <p className="text-xs text-[#1A1A1A]/40 mt-1">{submitted.window_label}</p>
                </div>
              </div>
            )}
            {(submitted.unsupported_media || []).length > 0 && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-sm font-medium text-amber-900 mb-1">Not included</p>
                <ul className="text-xs text-amber-900/80 space-y-1">
                  {submitted.unsupported_media.map((m, i) => <li key={i}>• {m}</li>)}
                </ul>
              </div>
            )}
            {importUrl && (
              <div className="p-4 rounded-xl bg-[#FFFBF5] border border-[#B8956A]/30">
                <p className="text-sm font-medium text-[#1A1A1A]">Your photos are ready in Bright MLS</p>
                <p className="text-xs text-[#1A1A1A]/55 mt-1 mb-2">
                  Open Bright to pull them into your listing. The link stops working 14 days after your media was prepared.
                </p>
                <a
                  href={importUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#B8956A] px-3 py-1.5 text-xs font-medium text-[#1A1A1A] hover:bg-[#A68559]"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Continue to Bright MLS
                </a>
              </div>
            )}
            <p className="text-xs text-[#1A1A1A]/45">
              You can follow the status in your gallery. We'll email you as soon as it's done.
            </p>
          </div>
        ) : loadError ? (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {loadError}
          </div>
        ) : (
          <div className="space-y-5">
            {/* The route that applies to this property — resolved from the booking address */}
            <div className="rounded-xl border border-[#B8956A]/25 bg-[#FFFBF5] p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/50 mb-1.5">Your MLS route</p>
              <p className="text-sm font-medium text-[#1A1A1A] flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#B8956A] mt-0.5 shrink-0" />
                <span>{config?.property_address || routing?.region_label || "This property"}</span>
              </p>
              <p className="text-xs text-[#1A1A1A]/60 mt-1.5 leading-relaxed">{routing?.message}</p>
              {!config?.selection_required && routing?.status === "review" && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-2 flex items-start gap-1.5">
                  <Search className="w-3 h-3 mt-0.5 shrink-0" />
                  Submit anyway — our MLS team confirms the listing service for your address and publishes for you.
                </p>
              )}
            </div>

            {/* More than one MLS covers this property — offer only those, preselected per policy */}
            {config?.selection_required && (
              <MlsDestinationSelector
                destinations={destinations}
                selected={selectedProviders}
                policy={config?.selection_policy}
                numbers={mlsNumbers}
                onNumberChange={(id, value) => setMlsNumbers((prev) => ({ ...prev, [id]: value }))}
                onToggle={(id) => setSelectedProviders((prev) => (
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                ))}
              />
            )}

            {/* Listing number — one MLS needing a number is asked here; several are asked per MLS above */}
            {!config?.selection_required && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/50 mb-2">
                  MLS listing number {requiresNumber ? "" : "(optional)"}
                </p>
                <Input
                  value={mlsNumber}
                  onChange={(e) => setMlsNumber(e.target.value)}
                  placeholder={routing?.number_hint || "Listing number"}
                  className={numberError ? "border-red-300" : ""}
                />
                <p className="text-xs text-[#1A1A1A]/40 mt-1.5">
                  {requiresNumber
                    ? `Your listing must already exist in ${routing?.provider_short_label || "the MLS"} and allow photo uploads. ${routing?.number_hint || ""}.`
                    : "Add your listing number if you have it — otherwise we match your property address to the listing."}
                </p>
                {numberError && <p className="text-xs text-red-600 mt-1">{numberError}</p>}
              </div>
            )}

            {/* Media summary */}
            {(
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/50 mb-2">
                  Selected media ({selectedPhotos.length} photos, {selectedVideos.length} videos)
                </p>
                {selectedPhotos.length === 0 && selectedVideos.length === 0 && (
                  <p className="text-sm text-[#1A1A1A]/50">Select media in the gallery first.</p>
                )}
                {photoLimit && selectedPhotos.length > photoLimit && (
                  <p className="text-xs text-red-600 mb-2">
                    {multipleDestinations ? "The selected MLS systems accept" : `${routing.provider_short_label} accepts`} up to {photoLimit} photographs. You selected {selectedPhotos.length}.
                  </p>
                )}

                <div className="grid grid-cols-5 gap-2">
                  {orderedPhotos.map((f) => (
                    <div key={f.id} className="relative rounded-lg overflow-hidden bg-[#FFFBF5] border border-[#B8956A]/20">
                      {f.thumbnailLink ? (
                        <img src={f.thumbnailLink} alt={f.name} className="w-full h-16 object-cover" />
                      ) : (
                        <div className="w-full h-16 flex items-center justify-center"><ImageIcon className="w-4 h-4 text-[#B8956A]/40" /></div>
                      )}
                    </div>
                  ))}
                </div>

                {selectedVideos.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {selectedVideos.map((v) => {
                      const yt = youtubeFor(v.id);
                      const ready = !!yt?.youtube_url;
                      return (
                        <div key={v.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-[#B8956A]/20 text-sm">
                          <span className="flex items-center gap-2 min-w-0">
                            <Video className="w-4 h-4 text-[#B8956A] shrink-0" />
                            <span className="truncate">{v.name}</span>
                          </span>
                          {ready ? (
                            <span className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] font-medium text-[#B8956A] flex items-center gap-1">
                                <Youtube className="w-3.5 h-3.5" /> Link ready
                              </span>
                              <button onClick={() => copyLink(yt.youtube_url)} className="text-[11px] text-[#1A1A1A]/50 hover:text-[#B8956A] flex items-center gap-1">
                                {copied === yt.youtube_url ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </span>
                          ) : (
                            <span className="text-[11px] text-[#1A1A1A]/45 shrink-0">Preparing unbranded video link</span>
                          )}
                        </div>
                      );
                    })}
                    {selectedVideos.length > readyVideoLinks && (
                      <p className="text-xs text-[#1A1A1A]/45">
                        Videos without a ready link will not be added to the listing. Your photographs can still proceed.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Photo order */}
            {orderedPhotos.length > 1 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/50 mb-2">Photo order</p>
                <p className="text-xs text-[#1A1A1A]/40 mb-2">
                  This is the order Arriv will upload your photos in. Your gallery order is unchanged.
                </p>
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {orderedPhotos.map((f, idx) => (
                    <div key={f.id} className="flex items-center gap-2 p-1.5 rounded-lg border border-[#B8956A]/15 bg-white">
                      <span className="w-6 text-center text-[11px] font-semibold text-[#B8956A]">{String(idx + 1).padStart(2, "0")}</span>
                      {f.thumbnailLink && <img src={f.thumbnailLink} alt="" className="w-8 h-8 rounded object-cover" />}
                      <span className="flex-1 text-xs text-[#1A1A1A]/70 truncate">{f.name}</span>
                      <button onClick={() => movePhoto(f.id, -1)} disabled={idx === 0} className="p-1 text-[#1A1A1A]/40 hover:text-[#B8956A] disabled:opacity-25">
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => movePhoto(f.id, 1)} disabled={idx === orderedPhotos.length - 1} className="p-1 text-[#1A1A1A]/40 hover:text-[#B8956A] disabled:opacity-25">
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Authorization */}
            {(
              <label className="flex items-start gap-2 p-3 rounded-xl bg-[#FFFBF5] border border-[#B8956A]/25 cursor-pointer">
                <input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#B8956A]" />
                <span className="text-xs text-[#1A1A1A]/70 leading-relaxed">{MLS_AUTHORIZATION_TEXT}</span>
              </label>
            )}

            {/* Deadline */}
            {(
              <div className="flex items-start gap-2 p-3 rounded-xl bg-white border border-[#B8956A]/20">
                <Clock className="w-4 h-4 text-[#B8956A] mt-0.5 shrink-0" />
                <div className="text-xs text-[#1A1A1A]/60">
                  <p className="font-medium text-[#1A1A1A]">
                    Estimated completion: {config?.estimated_deadline_label || "next business window"}
                  </p>
                  <p className="mt-0.5">{config?.window_label}</p>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {submitted ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                {submitting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Submitting...</> : "Submit MLS request"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
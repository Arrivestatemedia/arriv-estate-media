import React from "react";
import { Clock, CheckCircle2, AlertCircle, Youtube, ShieldCheck, ExternalLink } from "lucide-react";

const STATUS_LABEL = {
  submitted: "Submitted",
  processing: "Uploading to MLS",
  photos_uploaded: "Photos uploaded",
  video_added: "Video link added",
  completed: "Completed",
  needs_attention: "Needs attention",
  cancelled: "Cancelled",
};

const STATUS_STYLE = {
  submitted: "bg-white/10 text-white/80 border-white/20",
  processing: "bg-[#B8956A]/20 text-[#E5C79B] border-[#B8956A]/40",
  photos_uploaded: "bg-[#B8956A]/20 text-[#E5C79B] border-[#B8956A]/40",
  video_added: "bg-[#B8956A]/20 text-[#E5C79B] border-[#B8956A]/40",
  completed: "bg-[#B8956A] text-[#0a0b0f] border-[#B8956A]",
  needs_attention: "bg-amber-500/15 text-amber-200 border-amber-400/40",
  cancelled: "bg-white/5 text-white/40 border-white/15",
};

/**
 * MlsStatusCard
 * The customer's view of requests they have already submitted from this gallery. It sits above
 * the media grid and never interferes with selecting or downloading.
 */
const PUBLISHING_NOTE = {
  submitted: "Submitted — in the publishing queue for this MLS",
  processing: "Arriv's MLS team is uploading to your listing",
  photos_uploaded: "Photos are in your listing",
  video_added: "Your video tour is on your listing",
  needs_attention: "Arriv's MLS team is looking at this one",
};

export default function MlsStatusCard({ requests = [], providerLabels = {} }) {
  if (!requests || requests.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      {requests.map((r) => {
        const done = r.status === "completed";
        return (
          <div key={r.request_id} className="rounded-xl border border-[#B8956A]/25 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <ShieldCheck className="w-4 h-4 text-[#B8956A]" />
              <span className="text-sm font-medium text-white">
                {providerLabels[r.provider] || r.region_label || "MLS request"}
                {r.mls_number ? ` · #${r.mls_number}` : ""}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${STATUS_STYLE[r.status] || STATUS_STYLE.submitted}`}>
                {STATUS_LABEL[r.status] || r.status}
              </span>
              {r.status === "completed" && <CheckCircle2 className="w-4 h-4 text-[#B8956A]" />}
            </div>
            <p className="text-xs text-white/50">
              {r.photo_count || 0} photos{r.video_count ? `, ${r.video_count} videos` : ""} · submitted {new Date(r.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
            {!done && PUBLISHING_NOTE[r.status] && (
              <p className="text-xs text-white/45 mt-1">{PUBLISHING_NOTE[r.status]}</p>
            )}
            {!done && r.deadline_label && (
              <p className="text-xs text-white/40 flex items-center gap-1.5 mt-1">
                <Clock className="w-3 h-3 text-[#B8956A]" /> Estimated completion {r.deadline_label}
              </p>
            )}
            {r.status === "photos_uploaded" && r.video_upload_status === "pending" && (
              <p className="text-xs text-white/45 flex items-center gap-1.5 mt-1">
                <Youtube className="w-3 h-3 text-[#B8956A]" /> Your video link is still being added to the listing.
              </p>
            )}
            {r.status === "needs_attention" && r.attention_reason && (
              <p className="text-xs text-amber-200/80 flex items-center gap-1.5 mt-1">
                <AlertCircle className="w-3 h-3" /> {r.attention_reason}
              </p>
            )}
            {r.bright_import_url && !done && (
              <div className="mt-2.5">
                <a
                  href={r.bright_import_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#B8956A] px-3 py-1.5 text-xs font-medium text-[#0a0b0f] hover:bg-[#A68559]"
                >
                  <ExternalLink className="w-3 h-3" /> Continue to Bright MLS
                </a>
                <p className="text-[11px] text-white/40 mt-1">
                  Your photos are ready in Bright. Open this to pull them into your listing.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
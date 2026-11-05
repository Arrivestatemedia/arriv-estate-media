import React from "react";
import { Clock, CheckCircle2, AlertCircle, Youtube, ShieldCheck } from "lucide-react";

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
export default function MlsStatusCard({ requests = [] }) {
  if (!requests || requests.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      {requests.map((r) => {
        const done = r.status === "completed";
        return (
          <div key={r.request_id} className="rounded-xl border border-[#B8956A]/25 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <ShieldCheck className="w-4 h-4 text-[#B8956A]" />
              <span className="text-sm font-medium text-white">MLS #{r.mls_number}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${STATUS_STYLE[r.status] || STATUS_STYLE.submitted}`}>
                {STATUS_LABEL[r.status] || r.status}
              </span>
              {r.status === "completed" && <CheckCircle2 className="w-4 h-4 text-[#B8956A]" />}
            </div>
            <p className="text-xs text-white/50">
              {r.photo_count || 0} photos{r.video_count ? `, ${r.video_count} videos` : ""} · submitted {new Date(r.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
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
          </div>
        );
      })}
    </div>
  );
}
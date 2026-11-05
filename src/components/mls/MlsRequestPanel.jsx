import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, RefreshCw, Youtube, AlertCircle, ExternalLink } from "lucide-react";
import MlsRequestDetail from "@/components/mls/MlsRequestDetail";

const YT_STATUS = {
  queued: "Queued",
  creating_session: "Starting",
  uploading: "Uploading",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
  skipped: "Skipped",
};

/**
 * MlsRequestPanel
 * The MLS request section inside an existing job. An administrator opening the job sees the
 * customer's selected photographs in order, the unbranded YouTube links, the deadline and the
 * upload status — without navigating anywhere else.
 */
export default function MlsRequestPanel({ jobId }) {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [youtube, setYoutube] = useState([]);
  const [error, setError] = useState(null);
  const [retrying, setRetrying] = useState(null);

  const load = useCallback(async () => {
    if (!jobId) { setLoading(false); return; }
    setError(null);
    try {
      const [mlsRes, ytRes] = await Promise.all([
        base44.functions.invoke("getMlsUploadRequests", { mode: "admin", jobId }),
        base44.functions.invoke("manageYoutubeConnection", { action: "uploads", jobId }),
      ]);
      const mlsData = mlsRes?.data || mlsRes;
      if (mlsData?.error) throw new Error(mlsData.error);
      setRequests(mlsData?.requests || []);
      const ytData = ytRes?.data || ytRes;
      setYoutube(ytData?.uploads || []);
    } catch (err) {
      setError(err.message || "Could not load MLS requests");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const retryYoutube = async (uploadId) => {
    setRetrying(uploadId);
    try {
      await base44.functions.invoke("processYoutubeUpload", { retryUploadId: uploadId });
      await load();
    } finally {
      setRetrying(null);
    }
  };

  if (loading) {
    return (
      <Card className="p-4 flex items-center gap-2 text-sm text-[#1A1A1A]/50">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading MLS requests...
      </Card>
    );
  }

  const hasContent = requests.length > 0 || youtube.length > 0;
  if (!hasContent && !error) return null;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1A1A1A]/70 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#B8956A]" /> MLS UPLOAD REQUEST
        </h3>
        <Button size="sm" variant="ghost" onClick={load} className="text-[#8a6d4a]">
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 text-xs text-red-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {requests.length === 0 && (
        <p className="text-xs text-[#1A1A1A]/45">No Publish to MLS request has been submitted for this job yet.</p>
      )}

      {requests.map((request) => (
        <div key={request.request_id} className="rounded-xl border border-[#B8956A]/20 p-3">
          <MlsRequestDetail request={request} onUpdated={load} />
        </div>
      ))}

      {youtube.length > 0 && (
        <div className="border-t border-[#B8956A]/15 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/40 mb-2 flex items-center gap-1.5">
            <Youtube className="w-3.5 h-3.5 text-[#B8956A]" /> Video hosting
          </p>
          <div className="space-y-1.5">
            {youtube.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-[#1A1A1A]/70 truncate flex-1">{u.drive_file_name || u.video_title || u.drive_file_id}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  u.upload_status === "ready" ? "bg-[#B8956A]/15 text-[#8a6d4a]"
                    : u.upload_status === "failed" ? "bg-red-50 text-red-600"
                    : "bg-[#1A1A1A]/5 text-[#1A1A1A]/60"
                }`}>
                  {YT_STATUS[u.upload_status] || u.upload_status}
                </span>
                {u.youtube_url && (
                  <a href={u.youtube_url} target="_blank" rel="noreferrer" className="text-[#8a6d4a] flex items-center gap-1 hover:underline">
                    <ExternalLink className="w-3 h-3" /> Open
                  </a>
                )}
                {(u.upload_status === "failed" || u.upload_status === "skipped") && (
                  <button onClick={() => retryYoutube(u.id)} disabled={retrying === u.id} className="text-[#8a6d4a] hover:underline flex items-center gap-1">
                    {retrying === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Retry
                  </button>
                )}
              </div>
            ))}
            {youtube.some((u) => u.error_message) && (
              <p className="text-[10px] text-red-600">
                {youtube.find((u) => u.error_message)?.error_message}
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
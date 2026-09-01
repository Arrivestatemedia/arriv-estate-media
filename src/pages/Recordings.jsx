import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Film, Download, Trash2, Loader2, Play, User, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

const GOLD = "#B8956A";
const CREAM = "#FFFBF5";

const fmtDuration = (secs) => {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const isS3 = (url) => typeof url === "string" && url.startsWith("s3://");

/** Fetches a playable presigned URL for S3 URIs; passes through regular URLs. */
async function resolvePlayableUrl(url) {
  if (!isS3(url)) return url;
  const res = await base44.functions.invoke("getTavusRecordingUrl", {
    storageUri: url,
    responseContentType: "video/mp4",
    responseContentDisposition: "inline",
  });
  return res?.url || res?.data?.url || null;
}

export default function Recordings() {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playingUrl, setPlayingUrl] = useState(null);
  const [resolvingUrl, setResolvingUrl] = useState(null);

  const userId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
  const salesRole = localStorage.getItem('sales_member_role') || sessionStorage.getItem('sales_member_role');
  const isAdmin = salesRole === 'admin';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1. Sales call recordings (VideoRecording entities)
        const recPromise = isAdmin
          ? base44.entities.VideoRecording.list('-created_date', 200)
          : base44.entities.VideoRecording.filter({ recorded_by_id: userId }, '-created_date', 100);

        // 2. Interview recordings from Conference entities
        const confPromise = base44.entities.Conference.list('-created_date', 200);

        // 3. Interview recordings from HireCandidate documents
        const candPromise = base44.entities.HireCandidate.list('-created_date', 200);

        const [recRes, confRes, candRes] = await Promise.all([recPromise, confPromise, candPromise]);

        if (cancelled) return;

        const recs = recRes?.data ?? recRes ?? [];
        const confs = confRes?.data ?? confRes ?? [];
        const cands = candRes?.data ?? candRes ?? [];

        const all = [];

        // VideoRecording entities (sales calls)
        recs.forEach((r) => {
          if (!r.file_url) return;
          all.push({
            id: r.id,
            file_url: r.file_url,
            participant_name: r.participant_name || "",
            created_date: r.created_date,
            duration_seconds: r.duration_seconds || 0,
            file_size: r.file_size || 0,
            source: "Sales Call",
            sourceType: "video_recording",
            isS3: isS3(r.file_url),
          });
        });

        // Conference recordings (human interviews only — AI/Tavus interviews
        // are reviewed in the Async Interview Manager, not here)
        confs.forEach((c) => {
          if (c.interview_mode === "ai") return;
          const participant = c.participants?.[0];
          const pName = participant?.name || c.organizer_name || "";
          const addConf = (url, label) => {
            if (!url) return;
            all.push({
              id: `conf-${c.id}-${label}`,
              file_url: url,
              participant_name: pName,
              created_date: c.created_date,
              duration_seconds: c.recording_duration_seconds || 0,
              file_size: 0,
              source: `Interview · ${label}`,
              sourceType: "conference",
              isS3: isS3(url),
            });
          };
          addConf(c.recording_url, "Local");
          addConf(c.tavus_recording_storage_uri, "Tavus");
          addConf(c.twilio_composition_url, "Twilio");
        });

        // HireCandidate document recordings
        cands.forEach((c) => {
          if (!Array.isArray(c.documents)) return;
          c.documents.forEach((d, i) => {
            if (d?.type !== "interview_recording" && d?.type !== "twilio_backup_recording") return;
            if (!d.url) return;
            all.push({
              id: `cand-${c.id}-${i}`,
              file_url: d.url,
              participant_name: c.name || "",
              created_date: c.created_date,
              duration_seconds: 0,
              file_size: 0,
              source: d.label || "Interview Recording",
              sourceType: "candidate_doc",
              isS3: isS3(d.url),
            });
          });
        });

        // Deduplicate by file_url (conference tavus URI may also be in candidate docs)
        const seen = new Set();
        const deduped = all.filter((r) => {
          if (seen.has(r.file_url)) return false;
          seen.add(r.file_url);
          return true;
        });

        // Sort by date descending
        deduped.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
        setRecordings(deduped);
      } catch (_) {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, isAdmin]);

  const handlePlay = useCallback(async (rec) => {
    setResolvingUrl(rec.id);
    try {
      const playable = await resolvePlayableUrl(rec.file_url);
      if (playable) setPlayingUrl({ url: playable, rec });
    } catch (_) {}
    setResolvingUrl(null);
  }, []);

  const handleDelete = async (id, rec) => {
    // Only delete actual VideoRecording entities
    if (rec.sourceType !== "video_recording") return;
    try {
      await base44.entities.VideoRecording.delete(id);
      setRecordings((prev) => prev.filter((r) => r.id !== id));
    } catch (_) {}
  };

  const closePlayer = () => setPlayingUrl(null);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8" style={{ minHeight: '100vh', backgroundColor: CREAM }}>
      <div className="flex items-center gap-3 mb-6">
        <Film className="w-7 h-7" style={{ color: GOLD }} />
        <h1 className="text-2xl font-bold" style={{ fontFamily: "Georgia, serif" }}>My Recordings</h1>
        <span className="ml-auto text-sm text-gray-500">{recordings.length} recording{recordings.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
        </div>
      ) : recordings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Film className="w-16 h-16 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No recordings yet</p>
          <p className="text-sm text-gray-400 mt-1">Interview and call recordings will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recordings.map((rec) => (
            <div key={rec.id} className="bg-white rounded-xl overflow-hidden border shadow-sm flex flex-col" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
              <div className="relative h-40 bg-black flex items-center justify-center">
                {rec.isS3 ? (
                  <button
                    onClick={() => handlePlay(rec)}
                    disabled={resolvingUrl === rec.id}
                    className="flex flex-col items-center gap-2 text-white/80 hover:text-white transition-colors"
                  >
                    {resolvingUrl === rec.id ? (
                      <Loader2 className="w-8 h-8 animate-spin" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
                        <Play className="w-6 h-6 ml-0.5" fill="currentColor" />
                      </div>
                    )}
                    <span className="text-xs">{rec.isS3 ? "Click to load" : "Play"}</span>
                  </button>
                ) : (
                  <video src={rec.file_url} controls className="w-full h-full object-contain" />
                )}
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: 'rgba(184,149,106,0.9)', color: '#1A1A1A' }}>
                  {rec.source}
                </span>
              </div>
              <div className="p-3 flex-1 flex flex-col">
                <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  {rec.participant_name ? rec.participant_name : "Unknown participant"}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {rec.created_date ? new Date(rec.created_date).toLocaleString() : ""}
                </p>
                {rec.duration_seconds > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">{fmtDuration(rec.duration_seconds)}</p>
                )}
                <div className="flex gap-2 mt-3 pt-2 mt-auto">
                  {rec.isS3 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handlePlay(rec)}
                      disabled={resolvingUrl === rec.id}
                      className="flex-1 h-8 text-xs"
                    >
                      {resolvingUrl === rec.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Play className="w-3.5 h-3.5 mr-1" />}
                      Play
                    </Button>
                  ) : (
                    <a href={rec.file_url} download className="flex-1">
                      <Button size="sm" variant="outline" className="w-full h-8 text-xs">
                        <Download className="w-3.5 h-3.5 mr-1" /> Download
                      </Button>
                    </a>
                  )}
                  {rec.sourceType === "video_recording" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(rec.id, rec)}
                      className="h-8 px-2 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Video player modal for S3 recordings */}
      {playingUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }} onClick={closePlayer}>
          <div className="max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium" style={{ color: CREAM }}>
                {playingUrl.rec.participant_name || "Recording"}
              </p>
              <Button size="sm" variant="ghost" onClick={closePlayer} className="text-white/70 hover:text-white">
                Close
              </Button>
            </div>
            <video src={playingUrl.url} controls autoPlay className="w-full rounded-lg" style={{ maxHeight: '80vh' }} />
          </div>
        </div>
      )}
    </div>
  );
}
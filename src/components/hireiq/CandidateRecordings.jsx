import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Film, Play } from "lucide-react";

const GOLD = "#B8956A";
const CREAM = "#FFFBF5";
const MUTED_LIGHT = "rgba(255,251,245,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };
const innerBg = "#2A2A2A";

const card = {
  backgroundColor: "#1A1A1A",
  border: "1px solid rgba(184,149,106,0.2)",
  borderRadius: "14px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
};

const fmtDur = (s) => {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return ` (${m}:${String(sec).padStart(2, "0")})`;
};

/**
 * Gathers EVERY interview clip for a candidate — from their documents array,
 * from VideoRecording entities keyed by conference room, and the Tavus
 * server-side tail clip on the Conference — and presents them with a
 * dropdown when there are multiple clips.
 */
export default function CandidateRecordings({ candidate }) {
  // Recordings already synced to the candidate's documents — available
  // immediately, no loading state needed.
  const docRecs = useMemo(() => {
    const docs = Array.isArray(candidate?.documents) ? candidate.documents : [];
    return docs
      .filter(d => d?.type === "interview_recording" || d?.type === "twilio_backup_recording")
      .map(d => ({ url: d.url, label: d.label || "Interview Recording", type: d.type }));
  }, [candidate?.documents]);

  const [extraRecs, setExtraRecs] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loadingRecUrl, setLoadingRecUrl] = useState(null);

  // Fetch additional clips from VideoRecording entities + Tavus tail clip
  // that may not have been synced to the candidate's documents.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = new Set(docRecs.map(r => r.url));
      const extras = [];
      try {
        const email = candidate?.email?.toLowerCase().trim();
        const confRes = await base44.entities.Conference.list("-created_date", 200);
        const allConfs = confRes?.data ?? confRes ?? [];
        const candidateConfs = (Array.isArray(allConfs) ? allConfs : []).filter(c => {
          const p = c.participants?.[0];
          if (!p) return false;
          if (email && p.email?.toLowerCase().trim() === email) return true;
          if (p.id && candidate?.id && p.id === candidate.id) return true;
          return false;
        });

        for (const c of candidateConfs) {
          if (c.room_name) {
            try {
              const recRes = await base44.entities.VideoRecording.filter({ room_name: c.room_name }, "created_date", 50);
              const recs = recRes?.data ?? recRes ?? [];
              (Array.isArray(recs) ? recs : []).forEach(r => {
                if (r.file_url && !existing.has(r.file_url)) {
                  existing.add(r.file_url);
                  const isStitched = (r.recorded_by_name || "").toLowerCase().includes("stitched");
                  extras.push({
                    url: r.file_url,
                    label: (isStitched ? "Stitched Recording" : "Recording Clip") + fmtDur(r.duration_seconds),
                    type: "interview_recording",
                  });
                }
              });
            } catch (_) {}
          }
          if (c.tavus_recording_storage_uri && !existing.has(c.tavus_recording_storage_uri)) {
            existing.add(c.tavus_recording_storage_uri);
            extras.push({
              url: c.tavus_recording_storage_uri,
              label: "AI Server-Side Recording (Tail)",
              type: "twilio_backup_recording",
            });
          }
        }
      } catch (_) {}
      if (!cancelled) setExtraRecs(extras);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.id, candidate?.email]);

  const recordings = useMemo(() => [...docRecs, ...extraRecs], [docRecs, extraRecs]);

  // Reset selection if out of bounds after recordings change
  useEffect(() => {
    if (selectedIdx > recordings.length - 1) setSelectedIdx(0);
  }, [recordings.length, selectedIdx]);

  const handlePlay = async (rec) => {
    const url = rec?.url || "";
    if (url.startsWith("s3://")) {
      setLoadingRecUrl(url);
      try {
        const res = await base44.functions.invoke("getTavusRecordingUrl", { storageUri: url });
        const presignedUrl = res?.url || res?.data?.url;
        if (presignedUrl) window.open(presignedUrl, "_blank", "noopener,noreferrer");
      } catch (_) {} finally { setLoadingRecUrl(null); }
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  if (recordings.length === 0) return null;

  const selected = recordings[selectedIdx] || recordings[0];
  const isBackup = selected.type === "twilio_backup_recording";

  return (
    <div className="p-5" style={card}>
      <h3 className="font-bold mb-3 flex items-center gap-2" style={{ ...SERIF, color: CREAM }}>
        <Film className="w-4 h-4" style={{ color: GOLD }} /> Interview Recordings ({recordings.length})
      </h3>

      {recordings.length > 1 ? (
        <div className="space-y-2">
          <select
            value={selectedIdx}
            onChange={e => setSelectedIdx(Number(e.target.value))}
            className="w-full p-2.5 rounded-lg text-sm focus:outline-none"
            style={{ backgroundColor: innerBg, border: "1px solid rgba(184,149,106,0.2)", color: CREAM }}
          >
            {recordings.map((r, i) => (
              <option key={i} value={i} style={{ backgroundColor: "#1A1A1A", color: CREAM }}>
                {r.label}{r.type === "twilio_backup_recording" ? " (Backup)" : ""}
              </option>
            ))}
          </select>
          <button
            onClick={() => handlePlay(selected)}
            disabled={loadingRecUrl === selected.url}
            className="w-full flex items-center gap-2 p-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
            style={{ backgroundColor: GOLD, border: "none", color: "#0A0A0A", fontWeight: 600 }}
          >
            {loadingRecUrl === selected.url
              ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              : <Play className="w-4 h-4 flex-shrink-0" />}
            Play Selected Clip
          </button>
        </div>
      ) : (
        <button
          onClick={() => handlePlay(selected)}
          disabled={loadingRecUrl === selected.url}
          className="w-full flex items-center gap-2 p-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
          style={{ backgroundColor: innerBg, border: "1px solid rgba(184,149,106,0.12)", color: CREAM }}
        >
          {loadingRecUrl === selected.url
            ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: GOLD }} />
            : <Play className="w-4 h-4 flex-shrink-0" style={{ color: GOLD }} />}
          <span className="text-left flex-1">{selected.label || "Interview Recording"}</span>
          {isBackup && <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}>Backup</span>}
        </button>
      )}
    </div>
  );
}
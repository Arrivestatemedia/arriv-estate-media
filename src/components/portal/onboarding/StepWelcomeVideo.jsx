import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Lock } from "lucide-react";

function youtubeId(url) {
  if (!url) return "";
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/);
  return m ? m[1] : "";
}

// Load the YouTube IFrame API once
let apiPromise = null;
function loadYouTubeApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") prev();
      resolve(window.YT);
    };
    if (!document.querySelector(`script[src="${tag.src}"]`)) {
      document.body.appendChild(tag);
    }
  });
  return apiPromise;
}

export default function StepWelcomeVideo({ onboarding, welcomeVideoUrl, identity, onUpdated }) {
  const watched = !!onboarding.welcome_video_watched_at;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0); // 0-100
  const [finished, setFinished] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const pollRef = useRef(null);
  const vid = youtubeId(welcomeVideoUrl);

  const markWatched = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await base44.functions.invoke("saveSalesOnboardingStep", { ...identity, step: "welcome_video", data: {} });
      if (res.data?.success) onUpdated(res.data.onboarding);
      else setError(res.data?.error || "Could not save.");
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Initialize the YouTube player with controls disabled
  useEffect(() => {
    if (watched || !vid) return;
    let cancelled = false;

    loadYouTubeApi().then((YT) => {
      if (cancelled || !containerRef.current) return;
      // Clear any existing player
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch (_e) {}
        playerRef.current = null;
      }
      stopPolling();

      playerRef.current = new YT.Player(containerRef.current, {
        videoId: vid,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          controls: 0,        // hide all player controls (no scrub bar)
          disablekb: 1,       // disable keyboard shortcuts (arrow keys, space)
          fs: 0,              // disable fullscreen
          playsinline: 1,
          iv_load_policy: 3,  // hide annotations
        },
        events: {
          onReady: (e) => {
            if (cancelled) return;
            setPlayerReady(true);
            try {
              const d = e.target.getDuration();
              if (d && d > 0) setDuration(d);
            } catch (_e) {}
            // Start polling playback position
            pollRef.current = setInterval(() => {
              if (!playerRef.current) return;
              try {
                const state = playerRef.current.getPlayerState();
                // 1 = playing
                if (state === 1) {
                  const cur = playerRef.current.getCurrentTime() || 0;
                  const dur = playerRef.current.getDuration() || duration || 0;
                  setCurrent(cur);
                  if (dur > 0) {
                    const pct = Math.min(100, (cur / dur) * 100);
                    setProgress(pct);
                    // Mark finished when within last 2 seconds (or 98%)
                    if (pct >= 98 || (dur - cur) <= 2) {
                      setFinished(true);
                      stopPolling();
                    }
                  }
                }
              } catch (_e) {}
            }, 500);
          },
          onStateChange: (e) => {
            // 0 = ended
            if (e.data === 0) {
              setFinished(true);
              setProgress(100);
              stopPolling();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      stopPolling();
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch (_e) {}
        playerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vid, watched]);

  const fmt = (s) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      {watched ? (
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm font-medium">Welcome video watched</span>
        </div>
      ) : (
        <>
          {vid ? (
            <>
              <div className="aspect-video w-full rounded-lg overflow-hidden border border-[#B8956A]/20 bg-black relative">
                <div ref={containerRef} />
                {!playerReady && (
                  <div className="absolute inset-0 flex items-center justify-center text-[#FFFBF5]/60 text-sm">
                    Loading video…
                  </div>
                )}
              </div>

              {/* Custom progress bar (read-only, not interactive) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <span>{fmt(current)} / {fmt(duration)}</span>
                  <span>{Math.round(progress)}% watched</span>
                </div>
                <div className="h-2 w-full rounded-full bg-[#B8956A]/15 overflow-hidden">
                  <div
                    className="h-full bg-[#B8956A] transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-[#B8956A]/20 bg-[#FFFBF5] p-3">
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Please watch the full welcome video from start to finish. Skipping ahead is disabled — the continue button unlocks once the video completes.
                </p>
              </div>

              <Button
                onClick={markWatched}
                disabled={saving || !finished}
                className={`w-full ${finished ? "bg-[#B8956A] hover:bg-[#A68559] text-white" : "bg-[#B8956A]/30 text-white/60 cursor-not-allowed"}`}
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                ) : finished ? (
                  "I've Watched the Welcome Video"
                ) : (
                  <><Lock className="w-4 h-4 mr-2" /> Watch the full video to continue</>
                )}
              </Button>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </>
          ) : (
            <>
              <div className="rounded-lg border border-[#B8956A]/20 bg-[#FFFBF5] p-6 text-center">
                <p className="text-sm text-[var(--text-secondary)]">Your welcome video will be available here shortly. Once you've received it, confirm below to continue.</p>
              </div>
              <Button onClick={markWatched} disabled={saving} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : "I've Watched the Welcome Video"}
              </Button>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </>
          )}
        </>
      )}
    </div>
  );
}
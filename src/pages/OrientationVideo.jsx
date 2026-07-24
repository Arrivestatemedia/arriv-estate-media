import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createPageUrl } from "../utils";

const REQUIRED_SECONDS = 300; // 5 minutes

// Extract a YouTube video ID from any YouTube URL form; returns null if not YouTube.
function getYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.replace("/", "");
    if (u.hostname.endsWith("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const parts = u.pathname.split("/");
      const embedIdx = parts.indexOf("embed");
      if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
      const shortsIdx = parts.indexOf("shorts");
      if (shortsIdx >= 0 && parts[shortsIdx + 1]) return parts[shortsIdx + 1];
    }
  } catch {
    // ignore
  }
  return null;
}

// Load the YouTube IFrame Player API once.
function loadYouTubeAPI() {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    if (!document.getElementById("yt-iframe-api")) {
      const tag = document.createElement("script");
      tag.id = "yt-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
    const prev = window.onYouTubeIframeReady;
    window.onYouTubeIframeReady = () => {
      if (typeof prev === "function") prev();
      resolve(window.YT);
    };
  });
}

const formatTime = (s) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export default function OrientationVideo() {
  const navigate = useNavigate();
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [watchedSeconds, setWatchedSeconds] = useState(0);
  const [canContinue, setCanContinue] = useState(false);
  const playerRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const rows = await base44.entities.AppSetting.filter({ key: "orientation_video_url" });
        if (rows && rows[0]?.value) setVideoUrl(rows[0].value);
      } catch (e) {
        // ignore — fall back to "coming soon"
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const videoId = videoUrl ? getYouTubeId(videoUrl) : null;

  useEffect(() => {
    if (!videoId) return;
    let player;
    let interval;
    let cancelled = false;

    loadYouTubeAPI().then((YT) => {
      if (cancelled || !playerRef.current) return;
      player = new YT.Player(playerRef.current, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, cc_load_policy: 0 },
        events: {
          onReady: (e) => {
            const iframe = e.target.getIframe();
            if (iframe) {
              iframe.style.width = "100%";
              iframe.style.height = "100%";
            }
          },
        },
      });
      interval = setInterval(() => {
        if (!player || typeof player.getCurrentTime !== "function") return;
        try {
          const t = player.getCurrentTime() || 0;
          const dur = player.getDuration() || 0;
          setWatchedSeconds(Math.floor(t));
          if (t >= REQUIRED_SECONDS || (dur > 0 && t >= dur - 1)) {
            setCanContinue(true);
            clearInterval(interval);
          }
        } catch {
          // ignore transient player errors
        }
      }, 1000);
    });

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      try {
        player?.destroy?.();
      } catch {
        // ignore
      }
    };
  }, [videoId]);

  const handleNext = () => {
    navigate(createPageUrl("MediaPartnerTermsConditions"));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent-color)]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Card className="border-2 border-[var(--border-color)] bg-[var(--card-bg)]">
          <CardHeader>
            <CardTitle className="text-3xl text-[var(--text-primary)]">Orientation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {videoUrl ? (
              <>
                <div className="aspect-video bg-black rounded-lg overflow-hidden">
                  {videoId ? (
                    <div ref={playerRef} className="w-full h-full" />
                  ) : (
                    <iframe
                      src={videoUrl}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  )}
                </div>

                {videoId && (
                  <div className="space-y-2">
                    <div className="h-2 w-full rounded-full bg-[var(--border-color)] overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent-color)] transition-all"
                        style={{ width: `${Math.min(100, (watchedSeconds / REQUIRED_SECONDS) * 100)}%` }}
                      />
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] text-center">
                      {canContinue
                        ? "Thanks for watching — you can continue."
                        : `Please watch the full 5 minutes to continue. Watched ${formatTime(watchedSeconds)} / ${formatTime(REQUIRED_SECONDS)}`}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="aspect-video bg-[var(--accent-color)]/10 rounded-lg flex items-center justify-center border border-[var(--border-color)]">
                <p className="text-[var(--text-secondary)] text-lg">Video coming soon</p>
              </div>
            )}

            <Button
              onClick={handleNext}
              disabled={videoId ? !canContinue : false}
              className="w-full bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white disabled:opacity-50 disabled:cursor-not-allowed"
              size="lg"
            >
              {videoId && !canContinue ? "Watch the video to continue" : "Next"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
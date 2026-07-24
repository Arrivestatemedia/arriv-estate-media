import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2 } from "lucide-react";

function youtubeId(url) {
  if (!url) return "";
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/);
  return m ? m[1] : "";
}

export default function StepWelcomeVideo({ onboarding, welcomeVideoUrl, identity, onUpdated }) {
  const watched = !!onboarding.welcome_video_watched_at;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
            <div className="aspect-video w-full rounded-lg overflow-hidden border border-[#B8956A]/20">
              <iframe src={`https://www.youtube.com/embed/${vid}`} title="Welcome to Arriv" className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            </div>
          ) : (
            <div className="rounded-lg border border-[#B8956A]/20 bg-[#FFFBF5] p-6 text-center">
              <p className="text-sm text-[var(--text-secondary)]">Your welcome video will be available here shortly. Once you've received it, confirm below to continue.</p>
            </div>
          )}
          <Button onClick={markWatched} disabled={saving} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : "I've Watched the Welcome Video"}
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}
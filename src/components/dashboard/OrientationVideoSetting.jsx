import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Video } from "lucide-react";

export default function OrientationVideoSetting() {
  const [url, setUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const rows = await base44.entities.AppSetting.filter({ key: "orientation_video_url" });
        const current = rows?.[0]?.value || "";
        setUrl(current);
        setSavedUrl(current);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await base44.functions.invoke("setOrientationVideoUrl", { videoUrl: url.trim() });
      const result = res?.data || {};
      if (result.success) {
        setSavedUrl(url.trim());
        setMessage("Saved — media partners will now see this video.");
      } else {
        setMessage(result.error || "Failed to save.");
      }
    } catch (e) {
      setMessage(e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-2 border-[#B8956A]/20 bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-[#1A1A1A]/60 flex items-center gap-2">
          <Video className="w-4 h-4 text-[#B8956A]" />
          Orientation Video URL
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-[#1A1A1A]/50">
          Paste a YouTube/Vimeo embed URL. This is shown to all media partners during orientation.
        </p>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/embed/VIDEO_ID"
          disabled={loading || saving}
        />
        <Button
          onClick={handleSave}
          disabled={loading || saving || !url.trim()}
          className="bg-[#B8956A] hover:bg-[#A68559] text-white w-full"
        >
          {saving ? "Saving..." : "Save Video URL"}
        </Button>
        {message && <p className="text-sm text-[#1A1A1A]/70">{message}</p>}
        {savedUrl && !message && (
          <p className="text-xs text-[#1A1A1A]/50 break-all">Current: {savedUrl}</p>
        )}
      </CardContent>
    </Card>
  );
}
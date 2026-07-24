import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createPageUrl } from "../utils";

export default function OrientationVideo() {
  const navigate = useNavigate();
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(true);

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
  }, [navigate]);

  const handleNext = () => {
    // Send the partner to sign the Media Partner Agreement next.
    // Orientation is marked complete only after the agreement is signed.
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
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                <iframe
                  src={videoUrl}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="aspect-video bg-[var(--accent-color)]/10 rounded-lg flex items-center justify-center border border-[var(--border-color)]">
                <p className="text-[var(--text-secondary)] text-lg">Video coming soon</p>
              </div>
            )}

            <Button
              onClick={handleNext}
              className="w-full bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white"
              size="lg"
            >
              Next
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
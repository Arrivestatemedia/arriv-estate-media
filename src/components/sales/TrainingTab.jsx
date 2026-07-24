import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, GraduationCap, PlayCircle } from "lucide-react";

function youtubeId(url) {
  if (!url) return "";
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([\w-]{11})/);
  return m ? m[1] : "";
}

export default function TrainingTab() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke("getSalesTrainingVideos", {});
        setVideos(res.data?.videos || []);
      } catch (_e) {
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-[#1A1A1A]/60">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading training videos...
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <Card style={{ backgroundColor: "#FFFFFF" }}>
        <CardContent className="pt-10 pb-10 text-center">
          <GraduationCap className="w-10 h-10 mx-auto mb-3" style={{ color: "#B8956A" }} />
          <h3 className="text-lg font-semibold" style={{ color: "#1A1A1A" }}>Training videos coming soon</h3>
          <p className="text-sm mt-1" style={{ color: "rgba(26,26,26,0.6)" }}>Your training content will appear here. Check back shortly!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <GraduationCap className="w-6 h-6" style={{ color: "#B8956A" }} />
        <h2 className="text-xl font-semibold" style={{ color: "#1A1A1A" }}>Sales Training</h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {videos.map((v, i) => {
          const vid = youtubeId(v.url);
          return (
            <Card key={i} style={{ backgroundColor: "#FFFFFF" }}>
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-start gap-2">
                  <PlayCircle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "#B8956A" }} />
                  <h3 className="font-semibold leading-tight" style={{ color: "#1A1A1A" }}>{v.title || `Training Video ${i + 1}`}</h3>
                </div>
                {vid ? (
                  <div className="aspect-video w-full rounded-lg overflow-hidden border" style={{ borderColor: "rgba(184,149,106,0.2)" }}>
                    <iframe src={`https://www.youtube.com/embed/${vid}`} title={v.title || "Training video"} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                  </div>
                ) : (
                  <a href={v.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline" style={{ color: "#B8956A" }}>Open video link →</a>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Embeds the canonical Arriv Studio editor inside Estate Media via SSO.
// The user never leaves Estate Media — the Studio platform renders in an iframe.
// Estate Media shell/navigation remains available around the iframe.
export default function StudioEmbeddedEditor({ projectContext, onExit }) {
  const [launchUrl, setLaunchUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const launch = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await base44.functions.invoke("launchArrivStudio", {
          booking_id: projectContext?.bookingId || null,
          template_id: projectContext?.templateId || null,
          creation_choice_id: projectContext?.choiceId || null,
          asset_source: projectContext?.assetSource || "my_estate_media",
          embedded: true,
        });
        const data = res?.data || res;
        if (cancelled) return;
        if (data?.launch_url) {
          setLaunchUrl(data.launch_url);
        } else {
          setError(data?.error || "Unable to launch Studio. Please try again.");
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to launch Studio.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    launch();
    return () => { cancelled = true; };
  }, [projectContext?.bookingId, projectContext?.templateId, projectContext?.choiceId, projectContext?.assetSource]);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ background: "#111111", minHeight: "60vh" }}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: "#FF5A4F" }} />
          <p className="text-sm" style={{ color: "rgba(250,248,245,0.6)" }}>Loading Arriv Studio...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8" style={{ background: "#111111", minHeight: "60vh" }}>
        <div className="text-center max-w-sm">
          <AlertCircle className="w-8 h-8 mx-auto mb-3" style={{ color: "#FF5A4F" }} />
          <p className="text-sm mb-4" style={{ color: "rgba(250,248,245,0.7)" }}>{error}</p>
          <Button onClick={onExit} variant="outline" className="border-[#FF5A4F]/40 text-[#FAF8F5] hover:bg-[#FF5A4F]/10">
            Back to Studio Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" style={{ background: "#111111" }}>
      {/* Exit bar — Estate Media shell remains available */}
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: "rgba(255,90,79,0.2)" }}>
        <span className="text-xs font-medium" style={{ color: "rgba(250,248,245,0.5)" }}>
          Arriv Studio — {projectContext?.templateId || projectContext?.choiceId || "New Project"}
        </span>
        <button onClick={onExit} className="flex items-center gap-1 text-xs hover:opacity-70" style={{ color: "rgba(250,248,245,0.6)" }}>
          <X className="w-3.5 h-3.5" />
          Exit to Studio Home
        </button>
      </div>
      {/* Canonical Studio platform embedded inside Estate Media */}
      <iframe
        src={launchUrl}
        title="Arriv Studio for Real Estate"
        className="w-full"
        style={{ border: "none", minHeight: "calc(100vh - 120px)", background: "#111111" }}
        allow="camera; microphone; fullscreen; clipboard-read; clipboard-write"
      />
    </div>
  );
}
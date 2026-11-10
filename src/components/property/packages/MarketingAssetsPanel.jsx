import React, { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Copy, Download, ImageIcon, Link2, Loader2, Megaphone, Target } from "lucide-react";
import MarketingGraphicTemplate from "./MarketingGraphicTemplate";

// Marketing materials for the customer's own approved content.
//
// Every download is rendered in the browser from the approved photographs and approved listing
// fields, so opening this panel and downloading again cost nothing: there is no AI generation and
// no stored copy of an asset to go stale.
export default function MarketingAssetsPanel({ listingId, clientEmail, refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [downloading, setDownloading] = useState("");
  const graphicRefs = useRef({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    base44.functions
      .invoke("generatePropertyMarketingAssets", { listingId, clientEmail })
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data || res;
        if (payload?.ok === false) {
          setError(payload?.error || "Marketing materials could not be loaded.");
        } else {
          setData(payload);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Marketing materials could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listingId, clientEmail, refreshKey]);

  const copy = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("");
    }
  };

  const download = async (spec) => {
    const node = graphicRefs.current[spec.key];
    if (!node) return;
    setDownloading(spec.key);
    try {
      // Explicit export dimensions: the on-screen preview is scaled down, the downloaded PNG is
      // always the graphic's full size.
      const canvas = await html2canvas(node, {
        useCORS: true,
        backgroundColor: "#0a0b0f",
        width: spec.width,
        height: spec.height,
        windowWidth: spec.width,
        scale: 1,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `${spec.key}-${listingId}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      setError("That graphic could not be rendered in this browser. You can still use the captions and links below.");
    } finally {
      setDownloading("");
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#B8956A]/25 bg-white p-6 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  if (error && !data) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  }

  const marketing = data?.marketing || { links: { links: [] }, captions: [], graphics: [], campaign: { available: false } };
  const campaign = marketing.campaign || {};
  const locked = data?.locked === true;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[#B8956A]/25 bg-white p-5">
        <h3 className="flex items-center gap-2 font-serif text-lg text-[#1A1A1A]">
          <Link2 className="h-4 w-4 text-[#B8956A]" /> Shareable links
        </h3>
        <p className="mt-1 text-xs text-[#1A1A1A]/50">Each link carries its own tracking tag, so a visit from a post is visible in your report.</p>
        <div className="mt-3 space-y-2">
          {(marketing.links?.links || []).map((link) => (
            <div key={link.key} className="flex items-center gap-2 rounded-xl bg-[#FFFBF5] px-3 py-2">
              <span className="w-40 shrink-0 text-xs font-medium text-[#1A1A1A]/70">{link.label}</span>
              <span className="flex-1 truncate text-xs text-[#1A1A1A]/50">{link.url}</span>
              <Button size="sm" variant="ghost" onClick={() => copy(link.key, link.url)} className="h-8 shrink-0 text-[#B8956A]">
                <Copy className="mr-1 h-3.5 w-3.5" /> {copied === link.key ? "Copied" : "Copy"}
              </Button>
            </div>
          ))}
        </div>
      </div>

      {locked && (
        <div className="rounded-2xl border border-[#B8956A]/30 bg-[#FFFBF5] p-4 text-sm text-[#1A1A1A]/70">
          {data?.locked_message}
        </div>
      )}

      {!locked && (marketing.captions || []).length > 0 && (
        <div className="rounded-2xl border border-[#B8956A]/25 bg-white p-5">
          <h3 className="flex items-center gap-2 font-serif text-lg text-[#1A1A1A]">
            <Megaphone className="h-4 w-4 text-[#B8956A]" /> Ready-to-post captions
          </h3>
          <div className="mt-3 space-y-3">
            {marketing.captions.map((caption) => (
              <div key={caption.key} className="rounded-xl border border-[#B8956A]/20 bg-[#FFFBF5] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#B8956A]">{caption.label}</span>
                  <Button size="sm" variant="ghost" onClick={() => copy(caption.key, caption.text)} className="h-7 text-[#B8956A]">
                    <Copy className="mr-1 h-3 w-3" /> {copied === caption.key ? "Copied" : "Copy"}
                  </Button>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-[#1A1A1A]/75">{caption.text}</pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {!locked && (marketing.graphics || []).length > 0 && (
        <div className="rounded-2xl border border-[#B8956A]/25 bg-white p-5">
          <h3 className="flex items-center gap-2 font-serif text-lg text-[#1A1A1A]">
            <ImageIcon className="h-4 w-4 text-[#B8956A]" /> Branded graphics
          </h3>
          <p className="mt-1 text-xs text-[#1A1A1A]/50">Built from your approved photographs and listing details. Download and post.</p>
          <div className="mt-3 space-y-4">
            {marketing.graphics.map((spec) => (
              <div key={spec.key} className="rounded-xl border border-[#B8956A]/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-[#1A1A1A]/70">{spec.label}</span>
                  <Button size="sm" onClick={() => download(spec)} disabled={downloading === spec.key} className="h-8 bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]">
                    {downloading === spec.key ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
                    Download PNG
                  </Button>
                </div>
                <div className="max-h-80 overflow-auto rounded-lg bg-[#0a0b0f]">
                  <div style={{ zoom: 0.4 }}>
                    <MarketingGraphicTemplate spec={spec} ref={(node) => { graphicRefs.current[spec.key] = node; }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!locked && campaign?.available && (
        <div className="rounded-2xl border border-[#B8956A]/25 bg-white p-5">
          <h3 className="flex items-center gap-2 font-serif text-lg text-[#1A1A1A]">
            <Target className="h-4 w-4 text-[#B8956A]" /> Campaign preparation
          </h3>
          <p className="mt-1 text-xs text-[#1A1A1A]/50">{campaign.objective}</p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(campaign.integrations || []).map((integration) => (
              <div key={integration.provider} className="rounded-xl border border-[#B8956A]/20 bg-[#FFFBF5] p-3">
                <p className="text-xs font-semibold text-[#1A1A1A]/75">{integration.label}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[#1A1A1A]/40">{integration.status}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[#1A1A1A]/55">{integration.note}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 space-y-2">
            {(campaign.structure || []).map((stage) => (
              <div key={stage.stage} className="rounded-xl border border-[#B8956A]/20 p-3">
                <p className="text-xs font-semibold text-[#1A1A1A]/80">{stage.stage}</p>
                <p className="mt-1 text-[11px] text-[#1A1A1A]/60">{stage.audience}</p>
                <p className="text-[11px] text-[#1A1A1A]/60">Creative: {stage.creative}</p>
                <p className="mt-1 text-[11px] text-[#1A1A1A]/45">{stage.note}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-xl bg-[#FFFBF5] p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1A1A1A]/45">Targeting and compliance</p>
            <p className="mt-1 text-[11px] text-[#1A1A1A]/60">{campaign.geography?.suggestion}</p>
            <ul className="mt-2 space-y-1">
              {(campaign.compliance || []).map((item) => (
                <li key={item} className="text-[11px] leading-relaxed text-[#1A1A1A]/55">• {item}</li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-[#1A1A1A]/45">{campaign.budget?.note}</p>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
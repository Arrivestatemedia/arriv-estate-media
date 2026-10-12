import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Loader2, Home, ArrowLeft } from "lucide-react";
import PropertyMarketingHero from "@/components/property/PropertyMarketingHero";
import PropertyMediaGallery from "@/components/property/PropertyMediaGallery";
import PropertyInfoPanel from "@/components/property/PropertyInfoPanel";
import PropertyInquiryForm from "@/components/property/PropertyInquiryForm";

// Public property marketing page. Reachable without signing in, and styled in the same visual
// language as the client delivery gallery — dark cinematic frame, gold accent system, media
// first — with off-white reading surfaces for the property facts and the inquiry form.
// It reads only through the public function, so a draft or private asset can never appear here.
export default function PublicPropertyPage() {
  const { slug } = useParams();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await base44.functions.invoke("getPublicPropertyPage", { slug });
        const data = res?.data || res;
        if (cancelled) return;
        if (data?.ok) setPage(data);
        else setNotFound(true);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  // Crawlable metadata is set from the same approved content the server renders.
  useEffect(() => {
    if (!page) return;
    document.title = page.seo_title || page.property_address;
    const setMeta = (attr, key, content) => {
      if (!content) return;
      let el = document.head.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    setMeta("name", "description", page.meta_description);
    setMeta("property", "og:title", page.seo_title);
    setMeta("property", "og:description", page.meta_description);
    setMeta("property", "og:url", page.canonical_url);
    if (page.cover_url) setMeta("property", "og:image", page.cover_url);
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement("link"); link.setAttribute("rel", "canonical"); document.head.appendChild(link); }
    link.setAttribute("href", page.canonical_url);
    let ld = document.head.querySelector('script[data-arriv-property-jsonld="true"]');
    if (!ld) { ld = document.createElement("script"); ld.type = "application/ld+json"; ld.setAttribute("data-arriv-property-jsonld", "true"); document.head.appendChild(ld); }
    ld.textContent = JSON.stringify(page.structured_data || {});
  }, [page]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0b0f] flex items-center justify-center">
        <div className="relative">
          <Loader2 className="w-10 h-10 animate-spin text-[#B8956A]" />
          <div className="absolute inset-0 blur-md bg-[#B8956A]/30 rounded-full" />
        </div>
      </div>
    );
  }

  if (notFound || !page) {
    return (
      <div className="min-h-screen bg-[#0a0b0f] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-[#B8956A]/10 border border-[#B8956A]/20 flex items-center justify-center mx-auto mb-5">
            <Home className="w-8 h-8 text-[#B8956A]" />
          </div>
          <h1 className="text-2xl font-serif text-white mb-2">Property page unavailable</h1>
          <p className="text-sm text-white/40 mb-6">This property page is not published, or the feature is not yet enabled.</p>
          <Link to="/properties" className="text-sm text-[#B8956A] hover:underline">Browse properties</Link>
        </div>
      </div>
    );
  }

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: page.seo_title, url: page.canonical_url });
      else {
        await navigator.clipboard.writeText(page.canonical_url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch { /* share dismissed */ }
  };

  const photos = (page.media || []).filter((m) => m.kind === "photo");

  return (
    <div className="min-h-screen bg-[#0a0b0f] relative overflow-hidden">
      {/* Ambient gold glow, as on the delivery gallery */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-[#B8956A]/8 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full bg-[#B8956A]/6 blur-[100px]" />
      </div>

      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(#B8956A 1px, transparent 1px), linear-gradient(90deg, #B8956A 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10">
        <div className="flex items-center justify-between mb-8">
          <Link to="/properties" className="flex items-center gap-2 text-sm text-white/40 hover:text-white/80 transition-colors group">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Properties
          </Link>
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#B8956A]">Arriv Estate Media</span>
        </div>

        {!page.publicly_available && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-[#B8956A]/10 border border-[#B8956A]/30 flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#B8956A] text-[#0a0b0f] shrink-0">
              {page.status_label.toUpperCase()}
            </span>
            <p className="text-sm text-white/70">
              This property is {page.status_label.toLowerCase()} and is not currently available.
            </p>
          </div>
        )}

        <PropertyMarketingHero page={page} copied={copied} onShare={share} />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-16">
        <PropertyMediaGallery
          photos={photos}
          videoUrl={page.video_url}
          address={page.property_address}
          coverUrl={page.cover_url}
        />
      </div>

      {/* Off-white reading surface */}
      <div className="relative bg-[#FFFBF5] border-t border-[#B8956A]/20 rounded-t-[2rem]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <PropertyInfoPanel page={page} />
            </div>

            <aside className="lg:col-span-1">
              <div className="lg:sticky lg:top-6">
                {page.inquiries_enabled ? (
                  <PropertyInquiryForm slug={page.public_slug} reference={page.property_reference} />
                ) : (
                  <div className="rounded-2xl border border-black/5 bg-white p-6 text-sm text-[#1A1A1A]/60">
                    This property is not currently accepting inquiries.
                  </div>
                )}
                <ul className="text-xs text-[#1A1A1A]/50 mt-5 space-y-2 list-disc pl-5">
                  {(page.disclosures || []).map((d) => <li key={d}>{d}</li>)}
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { money } from "@/lib/propertyVisibility";
import { Loader2, MapPin, Share2, BedDouble, Bath, Ruler, Home, Check } from "lucide-react";
import PropertyInquiryForm from "@/components/property/PropertyInquiryForm";

// Public property page. Reachable without signing in. Reads only through the public function,
// so a draft or private asset can never be displayed here.
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
    return <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" /></div>;
  }

  if (notFound || !page) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <Home className="w-10 h-10 text-[#B8956A] mx-auto mb-3" />
          <h1 className="text-2xl font-serif text-[#1A1A1A] mb-2">Property page unavailable</h1>
          <p className="text-sm text-[#1A1A1A]/55 mb-4">This property page is not published, or the feature is not yet enabled.</p>
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

  const facts = [
    { icon: BedDouble, label: page.bedrooms != null ? `${page.bedrooms} bedrooms` : null },
    { icon: Bath, label: page.bathrooms != null ? `${page.bathrooms} bathrooms` : null },
    { icon: Ruler, label: page.square_footage != null ? `${Number(page.square_footage).toLocaleString("en-US")} sq ft` : null },
  ].filter((f) => f.label);

  const photos = (page.media || []).filter((m) => m.kind === "photo");

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <header className="bg-[#1A1A1A] px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/" className="text-[#FFFBF5] font-serif text-lg tracking-wide">Arriv Estate Media</Link>
          <Link to="/properties" className="text-xs text-[#FFFBF5]/70 hover:text-[#FFFBF5]">Properties</Link>
        </div>
      </header>

      {!page.publicly_available && (
        <div className="bg-[#B8956A] text-[#1A1A1A] text-center text-sm font-semibold py-2">
          This property is {page.status_label.toLowerCase()} and is not currently available.
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {page.cover_url && (
          <img src={page.cover_url} alt={photos[0]?.alt_text || page.property_address} className="w-full aspect-video object-cover rounded-2xl mb-8" />
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <h1 className="text-3xl sm:text-4xl font-serif text-[#1A1A1A] mb-3">{page.seo_title || page.property_address}</h1>
            <p className="flex items-center gap-2 text-sm text-[#1A1A1A]/60 mb-4">
              <MapPin className="w-4 h-4 text-[#B8956A]" />
              {[page.property_address, page.city, page.state, page.zip].filter(Boolean).join(", ")}
            </p>
            <div className="flex flex-wrap items-center gap-4 mb-6">
              {page.listing_price != null && <span className="text-2xl text-[#1A1A1A] font-medium">{money(page.listing_price)}</span>}
              <span className="px-3 py-1 rounded-full bg-[#B8956A]/15 text-[#B8956A] text-xs font-semibold">{page.status_label}</span>
              <button onClick={share} className="inline-flex items-center gap-2 text-sm text-[#1A1A1A]/60 hover:text-[#1A1A1A]">
                {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                {copied ? "Link copied" : "Share"}
              </button>
            </div>

            {facts.length > 0 && (
              <div className="flex flex-wrap gap-6 mb-8">
                {facts.map((f) => (
                  <div key={f.label} className="flex items-center gap-2 text-sm text-[#1A1A1A]/70">
                    <f.icon className="w-4 h-4 text-[#B8956A]" /> {f.label}
                  </div>
                ))}
                {page.property_type && <div className="flex items-center gap-2 text-sm text-[#1A1A1A]/70 capitalize">{page.property_type.replace(/_/g, " ")}</div>}
              </div>
            )}

            {page.property_description && (
              <p className="text-[#1A1A1A]/80 leading-relaxed whitespace-pre-line mb-8">{page.property_description}</p>
            )}

            {(page.amenities || []).length > 0 && (
              <div className="mb-8">
                <h2 className="text-lg font-medium text-[#1A1A1A] mb-2">Amenities</h2>
                <ul className="flex flex-wrap gap-2">
                  {page.amenities.map((a) => <li key={a} className="px-3 py-1 rounded-full bg-white border border-black/5 text-sm text-[#1A1A1A]/70">{a}</li>)}
                </ul>
              </div>
            )}

            {page.video_url && (
              <div className="mb-8">
                <h2 className="text-lg font-medium text-[#1A1A1A] mb-2">Video tour</h2>
                <video controls preload="metadata" src={page.video_url} className="w-full rounded-xl bg-black" />
              </div>
            )}

            {photos.length > 1 && (
              <div className="mb-10">
                <h2 className="text-lg font-medium text-[#1A1A1A] mb-3">Photographs</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {photos.map((p) => (
                    <img key={p.drive_file_id} src={p.url} alt={p.alt_text || p.name} loading="lazy" className="rounded-lg aspect-[4/3] object-cover" />
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-black/5 bg-white p-5">
              <h2 className="text-base font-medium text-[#1A1A1A] mb-2">Listing contact</h2>
              <p className="text-sm text-[#1A1A1A]/70">
                {page.agent.name || "Listing agent"}{page.agent.brokerage ? ` · ${page.agent.brokerage}` : ""}
              </p>
              {page.agent.license_number && <p className="text-xs text-[#1A1A1A]/50 mt-1">License {page.agent.license_number}</p>}
              {page.agent.contact_phone && <p className="text-sm text-[#1A1A1A]/60 mt-1">{page.agent.contact_phone}</p>}
            </div>
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
  );
}
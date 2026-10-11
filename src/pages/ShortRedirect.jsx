import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { isPlatformFileUrl } from "@/lib/brandedLinks";
import BrandedFileViewer from "@/components/shared/BrandedFileViewer";

/**
 * Resolves a /r/<code> link. Platform-hosted files are opened inside this page so
 * the visitor stays on our own domain; any other address (property-access guides,
 * Drive folders) keeps its direct redirect.
 */
export default function ShortRedirect() {
  const { code } = useParams();
  const [fileUrl, setFileUrl] = useState("");
  const [error, setError] = useState(false);
  const download = new URLSearchParams(window.location.search).get("dl") === "1";

  useEffect(() => {
    if (!code) return;
    base44.entities.ShortLink.filter({ short_code: code })
      .then((rows) => {
        const target = rows?.[0]?.target_url;
        if (!target) {
          setError(true);
          return;
        }
        if (isPlatformFileUrl(target)) setFileUrl(target);
        else window.location.replace(target);
      })
      .catch(() => setError(true));
  }, [code]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBF5]">
        <p className="text-[#1A1A1A]/60 text-sm">Link not found.</p>
      </div>
    );
  }

  if (fileUrl) return <BrandedFileViewer url={fileUrl} download={download} />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FFFBF5]">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-[#B8956A]/30 border-t-[#B8956A] rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#1A1A1A]/60 text-sm">Opening document…</p>
      </div>
    </div>
  );
}
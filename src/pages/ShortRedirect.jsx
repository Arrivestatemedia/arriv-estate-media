import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";

export default function ShortRedirect() {
  const { code } = useParams();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!code) return;
    base44.entities.ShortLink.filter({ short_code: code })
      .then((results) => {
        if (results && results.length > 0) {
          window.location.replace(results[0].target_url);
        } else {
          setError(true);
        }
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FFFBF5]">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-[#B8956A]/30 border-t-[#B8956A] rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#1A1A1A]/60 text-sm">Opening document…</p>
      </div>
    </div>
  );
}
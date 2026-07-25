import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Camera } from "lucide-react";

export default function ApplicationPreview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (!id) {
      setError("Missing application id.");
      setLoading(false);
      return;
    }
    base44.functions
      .invoke("getApplicationPreview", { applicationId: id })
      .then((res) => {
        const payload = res?.data ?? res;
        if (payload?.error) {
          setError(payload.error);
        } else {
          setData(payload);
        }
      })
      .catch((e) => setError(e?.message || "Failed to load preview."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <header className="sticky top-0 z-10 bg-[#1A1A1A] border-b border-[#B8956A]/20">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-3">
          <Link
            to={createPageUrl("AdminApplications")}
            className="flex items-center gap-2 text-[#FFFBF5]/70 hover:text-[#FFFBF5] text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Applications
          </Link>
          <div className="ml-auto flex items-center gap-2 text-[#B8956A] text-sm font-medium">
            <Camera className="w-4 h-4" />
            Applicant Preview
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {loading ? (
          <p className="text-center text-[#1A1A1A]/60 py-16">Loading preview...</p>
        ) : error ? (
          <p className="text-center text-red-500 py-16">{error}</p>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-[#1A1A1A] mb-1">
              {data.display_name}
            </h1>
            <p className="text-[#1A1A1A]/50 mb-8 text-sm">Photos uploaded by applicant</p>

            {(!data.photos || data.photos.length === 0) ? (
              <div className="bg-white border-2 border-dashed border-[#B8956A]/30 rounded-xl p-12 text-center">
                <Camera className="w-10 h-10 text-[#B8956A]/40 mx-auto mb-3" />
                <p className="text-[#1A1A1A]/50">No photos uploaded.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {data.photos.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-white border-2 border-[#B8956A]/20 rounded-xl overflow-hidden aspect-square group"
                  >
                    <img
                      src={url}
                      alt={`Photo ${i + 1}`}
                      className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
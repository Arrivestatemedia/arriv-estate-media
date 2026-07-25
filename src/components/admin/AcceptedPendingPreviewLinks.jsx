import React, { useState } from "react";
import { Copy, Check, ExternalLink, Camera } from "lucide-react";

export default function AcceptedPendingPreviewLinks({ applications }) {
  const [copiedId, setCopiedId] = useState(null);

  const pending = applications.filter(
    (a) => (a.position || "media_specialist") === "media_specialist" && a.status === "accepted_pending"
  );

  if (pending.length === 0) return null;

  const buildUrl = (id) =>
    `${window.location.origin}/ApplicationPreview?id=${id}`;

  const copy = async (app) => {
    try {
      await navigator.clipboard.writeText(buildUrl(app.id));
      setCopiedId(app.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (e) {
      console.error("copy failed", e);
    }
  };

  return (
    <div className="bg-white border-2 border-[#B8956A]/20 rounded-xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Camera className="w-4 h-4 text-[#B8956A]" />
        <h2 className="text-lg font-semibold text-[#1A1A1A]">Accepted - Pending Preview Links</h2>
      </div>
      <p className="text-sm text-[#1A1A1A]/60 mb-4">
        Shareable links show only the applicant's last initial and their uploaded photos.
      </p>
      <div className="space-y-2">
        {pending.map((app) => (
          <div
            key={app.id}
            className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-lg border border-[#B8956A]/15 bg-[#FFFBF5]/50"
          >
            <span className="font-medium text-[#1A1A1A] sm:w-48 truncate">{app.full_name}</span>
            <code className="flex-1 text-xs text-[#1A1A1A]/60 break-all">
              {buildUrl(app.id)}
            </code>
            <div className="flex gap-2">
              <a
                href={buildUrl(app.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#1A1A1A] text-[#FFFBF5] text-xs font-medium hover:bg-[#1A1A1A]/90"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open
              </a>
              <button
                onClick={() => copy(app)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#B8956A] text-[#1A1A1A] text-xs font-medium hover:bg-[#A68559]"
              >
                {copiedId === app.id ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
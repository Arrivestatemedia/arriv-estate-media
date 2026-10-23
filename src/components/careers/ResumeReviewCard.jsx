import React, { useRef } from "react";
import { CheckCircle2, FileText, Loader2, RefreshCw } from "lucide-react";
import ProfileSection from "./ProfileSection";
import { GOLD, MUTED, TEXT_DARK } from "./careersStyles";
import { RESUME_ACCEPT } from "@/lib/resumeImport";

/** The résumé already attached from Indeed, with the option to replace it. */
export default function ResumeReviewCard({ fileName, url, onReplace, replacing }) {
  const inputRef = useRef(null);

  return (
    <ProfileSection title="Your Résumé" subtitle="Attached to your application automatically." icon={FileText}>
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl" style={{ border: "1px solid rgba(184,149,106,0.25)", backgroundColor: "#FFFBF5" }}>
        <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: GOLD }} />
        <div className="flex-1 min-w-[180px]">
          <p className="text-sm font-medium" style={{ color: TEXT_DARK }}>
            {fileName || "Résumé received"}
          </p>
          <p className="text-xs" style={{ color: MUTED }}>
            Received with your Indeed application
          </p>
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium underline underline-offset-4"
            style={{ color: GOLD }}
          >
            Open résumé
          </a>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={RESUME_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onReplace(file);
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={replacing}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        style={{ border: `1px solid ${GOLD}`, color: GOLD, backgroundColor: "transparent" }}
      >
        {replacing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        {replacing ? "Replacing résumé…" : "Replace résumé"}
      </button>
      <p className="text-xs" style={{ color: MUTED }}>
        Only if you have an updated version. We will re-read it and update the details below.
      </p>
    </ProfileSection>
  );
}
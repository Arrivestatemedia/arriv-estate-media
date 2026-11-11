import React, { useState } from "react";
import { Loader2, PhoneOff, Video } from "lucide-react";
import PreferredConciergePresence from "./PreferredConciergePresence";

/**
 * Embeds the live concierge in the floating dock. The room URL is minted server-side for
 * this customer; no credential ever reaches the browser. She joins her frame directly, so
 * the dock never shows a join lobby or a participant counter.
 */
export default function ConciergeVideoPanel({ url, busy, onEnd, displayName, conciergeName }) {
  const [fallback, setFallback] = useState(false);

  return (
    <div className="mx-3 mb-3 overflow-hidden rounded-2xl border border-[#c8a87c]/25 bg-black/50">
      {busy ? (
        <div className="flex h-[190px] flex-col items-center justify-center gap-2 text-[#f6f1e8]/60">
          <Loader2 className="h-5 w-5 animate-spin text-[#d9bd95]" />
          <p className="text-xs">Connecting your concierge…</p>
        </div>
      ) : fallback ? (
        <iframe
          key={url}
          src={url}
          title="Arriv Concierge video representative"
          allow="microphone; autoplay; fullscreen; speaker-selection"
          className="h-[190px] w-full border-0 bg-black"
        />
      ) : (
        <div className="h-[190px] w-full">
          <PreferredConciergePresence
            url={url}
            displayName={displayName}
            conciergeName={conciergeName}
            compact
            onFail={() => setFallback(true)}
          />
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-[#c8a87c]/20 px-3 py-2">
        <p className="flex items-center gap-1.5 text-[11px] text-[#f6f1e8]/50">
          <Video className="h-3.5 w-3.5 text-[#c8a87c]" />
          AI-powered representative
        </p>
        <button
          type="button"
          onClick={onEnd}
          className="preferred-focus flex items-center gap-1.5 rounded-full border border-[#c8a87c]/35 px-3 py-1 text-[11px] text-[#f6f1e8]/80 hover:bg-[#c8a87c]/10"
        >
          <PhoneOff className="h-3.5 w-3.5" />
          Stop
        </button>
      </div>
    </div>
  );
}
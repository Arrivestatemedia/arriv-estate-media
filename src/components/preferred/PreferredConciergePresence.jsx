import React, { useEffect } from "react";
import { Loader2, Mic, MicOff, Volume2 } from "lucide-react";
import useConciergeCall from "./useConciergeCall";

/**
 * The concierge, standing in the room. No join prompt, no participant count, no self view:
 * her video is painted straight into the frame and the only controls are hers and yours.
 */
export default function PreferredConciergePresence({
  url,
  displayName,
  conciergeName,
  conversationId,
  speechRef,
  onStepAway,
  onFail,
  compact = false,
  context,
  onDirective,
  onActivity,
}) {
  const { videoRef, audioRef, status, muted, needsTap, playAudio, toggleMute, speak } = useConciergeCall({
    url,
    displayName,
    conversationId,
    onFail,
    context,
    onDirective,
    onActivity,
  });

  // While she is in the room, anything the member types in the chat is said by her, out
  // loud, in her own voice — one conversation, not two channels.
  useEffect(() => {
    if (!speechRef) return undefined;
    speechRef.current = status === "live" ? speak : null;
    return () => {
      speechRef.current = null;
    };
  }, [speak, speechRef, status]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="h-full w-full object-cover"
        aria-label={conciergeName ? `${conciergeName}, your Arriv concierge` : "Your Arriv concierge"}
      />
      <audio ref={audioRef} autoPlay className="hidden" />

      {/* A soft gold vignette so her frame reads as part of the room, not as a screen. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_18%,transparent_38%,rgba(8,11,12,0.72)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[#080b0c]/90 via-[#080b0c]/35 to-transparent" />
      <div className="pointer-events-none absolute inset-0 rounded-[20px] ring-1 ring-inset ring-[#c8a87c]/25" />

      {status !== "live" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[#f6f1e8]/78">
          <Loader2 className="h-6 w-6 animate-spin text-[#d9bd95]" />
          <p className="text-[12.5px]">
            {conciergeName ? `${conciergeName} is stepping in…` : "Your concierge is stepping in…"}
          </p>
        </div>
      )}

      {/* Her name plate, low and quiet, like a place card. */}
      <div className="absolute bottom-4 left-5 flex items-center gap-2.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#d9bd95]/70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#e6cda6]" />
        </span>
        <p className="text-[11px] uppercase tracking-[0.28em] text-[#f6f1e8]/90">
          {conciergeName || "Your concierge"}
        </p>
      </div>

      <div className={`absolute right-4 flex items-center gap-2 ${compact ? "bottom-2.5" : "bottom-3"}`}>
        {needsTap && (
          <button
            type="button"
            onClick={playAudio}
            className="preferred-focus flex items-center gap-1.5 rounded-full border border-[#c8a87c]/45 bg-black/55 px-3 py-1.5 text-[11px] text-[#f6f1e8]/85"
          >
            <Volume2 className="h-3.5 w-3.5" />
            Hear her
          </button>
        )}
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Unmute your microphone" : "Mute your microphone"}
          className="preferred-focus flex h-9 w-9 items-center justify-center rounded-full border border-[#c8a87c]/35 bg-black/45 text-[#f6f1e8]/90 hover:bg-black/65"
        >
          {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
        {!compact && (
          <button
            type="button"
            onClick={onStepAway}
            className="preferred-focus rounded-full border border-[#c8a87c]/35 bg-black/45 px-3.5 py-1.5 text-[11px] text-[#f6f1e8]/90 hover:bg-black/65"
          >
            Step away
          </button>
        )}
      </div>
    </div>
  );
}
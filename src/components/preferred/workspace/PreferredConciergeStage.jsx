import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Coffee, Crown, Loader2, Mic, PhoneOff } from "lucide-react";
import { endConciergeVideo, startConciergeVideo } from "@/lib/conciergeClient";
import PreferredConciergeChat from "./PreferredConciergeChat";

const STARTED_KEY = "arriv_concierge_stage_started";
const SESSION_SECONDS = 180;

function clock(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/**
 * The concierge representative appears on arrival, stays for three minutes, then steps
 * away with an invitation to bring them back or keep chatting.
 *
 * The video itself is a Tavus conversation minted server-side; the three-minute limit is
 * enforced here and the server conversation is ended with it, so no minutes are spent after.
 */
export default function PreferredConciergeStage({ customer, conciergeName }) {
  const firstName = String(customer?.first_name || customer?.full_name || "").split(" ")[0];
  const chatRef = useRef(null);

  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState("idle");
  const [remaining, setRemaining] = useState(SESSION_SECONDS);
  const [issue, setIssue] = useState("");
  const [checklist, setChecklist] = useState([]);

  const connect = useCallback(async () => {
    setPhase("connecting");
    setIssue("");
    setChecklist([]);
    setRemaining(SESSION_SECONDS);
    try {
      const result = await startConciergeVideo(null);
      if (result?.ok && result?.conversation_url) {
        setUrl(result.conversation_url);
        setPhase("live");
        try {
          sessionStorage.setItem(STARTED_KEY, "1");
        } catch {
          /* storage unavailable: the representative simply appears again next visit */
        }
      } else {
        setUrl("");
        setPhase("unavailable");
        setIssue(result?.message || "The video concierge is unavailable right now.");
        setChecklist(Array.isArray(result?.checklist) ? result.checklist : []);
      }
    } catch (error) {
      // The server's own explanation is behind the error response; show it rather than
      // a blanket message, so a real cause is never hidden from view.
      const payload = error?.response?.data || error?.data || null;
      setUrl("");
      setPhase("unavailable");
      setIssue(payload?.message || "The video concierge is unavailable right now. You can still chat with me below.");
      setChecklist(Array.isArray(payload?.checklist) ? payload.checklist : []);
    }
  }, []);

  const stepAway = useCallback(async () => {
    setUrl("");
    setPhase("break");
    setRemaining(0);
    try {
      await endConciergeVideo(null);
    } catch {
      /* ending the frame is enough; the session expires on its own */
    }
  }, []);

  // Appear immediately on arrival, once per browser session. After that the break note
  // stays up and the customer brings the representative back with one click.
  useEffect(() => {
    let alreadyStarted = false;
    try {
      alreadyStarted = sessionStorage.getItem(STARTED_KEY) === "1";
    } catch {
      alreadyStarted = false;
    }
    if (alreadyStarted) {
      setPhase("break");
      return;
    }
    connect();
  }, [connect]);

  useEffect(() => {
    if (phase !== "live") return undefined;
    const timer = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === "live" && remaining === 0) stepAway();
  }, [phase, remaining, stepAway]);

  const breakLine = `${firstName ? `${firstName}, I am` : "I am"} taking a break — just click Concierge to come back and I'll be right here, or you also have the option to just chat with me.`;

  return (
    <section className="preferred-glass p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.26em] text-[#c8a87c]">
          <Crown className="h-3.5 w-3.5" /> Arriv Concierge
        </p>
        {phase === "live" && (
          <p className="flex items-center gap-1.5 text-[11px] text-[#f6f1e8]/45">
            <span className="h-1.5 w-1.5 rounded-full bg-[#c8a87c]" />
            {clock(remaining)} left in this session
          </p>
        )}
      </div>

      <div className="preferred-stage" style={{ aspectRatio: "16 / 10", minHeight: "300px" }}>
        {phase === "live" && url && (
          <>
            <iframe
              key={url}
              src={url}
              title="Arriv Concierge video representative"
              allow="camera; microphone; autoplay; fullscreen; display-capture; speaker-selection"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-black/75 to-transparent pb-4 pt-12">
              <div className="preferred-wave" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((bar) => (
                  <span key={bar} style={{ animationDelay: `${bar * 90}ms` }} />
                ))}
              </div>
            </div>
          </>
        )}

        {phase === "connecting" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-[#f6f1e8]/60">
            <Loader2 className="h-6 w-6 animate-spin text-[#d9bd95]" />
            <p className="text-[12.5px]">{firstName ? `${firstName}, your` : "Your"} concierge is joining…</p>
          </div>
        )}

        {phase === "break" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[#c8a87c]/40 bg-[#c8a87c]/10">
              <Coffee className="h-5 w-5 text-[#d9bd95]" />
            </span>
            {conciergeName && (
              <p className="text-[10px] uppercase tracking-[0.26em] text-[#c8a87c]">{conciergeName}</p>
            )}
            <p className="max-w-md text-[13.5px] leading-relaxed text-[#f6f1e8]/80">{breakLine}</p>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={connect}
                className="preferred-focus rounded-full bg-[#d3b389] px-5 py-2 text-[12.5px] font-medium text-[#14181a]"
              >
                Click Concierge to come back
              </button>
              <button
                type="button"
                onClick={() => chatRef.current?.focus()}
                className="preferred-focus rounded-full border border-[#c8a87c]/40 px-5 py-2 text-[12.5px] text-[#f6f1e8]/80 hover:bg-[#c8a87c]/10"
              >
                Just chat with me
              </button>
            </div>
          </div>
        )}

        {(phase === "unavailable" || phase === "idle") && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[#c8a87c]/30 bg-[#c8a87c]/8">
              <Crown className="h-5 w-5 text-[#c8a87c]/70" />
            </span>
            <p className="max-w-sm text-[13px] leading-relaxed text-[#f6f1e8]/70">
              {issue || "Your concierge is joining…"}
            </p>
            {checklist.length > 0 && (
              <ul className="mt-1 max-w-md space-y-1 text-left">
                {checklist.map((step) => (
                  <li key={step} className="flex gap-1.5 text-[11px] leading-relaxed text-[#f6f1e8]/45">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-[#c8a87c]" />
                    {step}
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={connect}
              className="preferred-focus mt-1 rounded-full border border-[#c8a87c]/40 px-5 py-2 text-[12.5px] text-[#f6f1e8]/80 hover:bg-[#c8a87c]/10"
            >
              Try the video again
            </button>
          </div>
        )}

        {phase === "live" && (
          <div className="absolute inset-x-0 bottom-2 z-10 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => chatRef.current?.startListening()}
              aria-label="Speak to the concierge"
              className="preferred-focus flex h-10 w-10 items-center justify-center rounded-full border border-[#c8a87c]/35 bg-black/55 text-[#f6f1e8]/85 hover:bg-black/70"
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={stepAway}
              aria-label="End the video session"
              className="preferred-focus flex h-12 w-12 items-center justify-center rounded-full bg-[#c0574a] text-white shadow-[0_10px_30px_-12px_rgba(192,87,74,0.9)] hover:bg-[#cf6456]"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={connect}
              aria-label="Reconnect the video"
              className="preferred-focus flex h-10 w-10 items-center justify-center rounded-full border border-[#c8a87c]/35 bg-black/55 text-[#f6f1e8]/85 hover:bg-black/70"
            >
              <Camera className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <PreferredConciergeChat ref={chatRef} firstName={firstName} />
    </section>
  );
}
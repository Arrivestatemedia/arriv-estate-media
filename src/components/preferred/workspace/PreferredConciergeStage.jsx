import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, Coffee, Crown, Loader2, Maximize2 } from "lucide-react";
import { endConciergeVideo, startConciergeVideo } from "@/lib/conciergeClient";
import { applyConciergeDirective } from "@/lib/conciergeUi";
import { usePreferredSurface } from "@/components/preferred/surface/PreferredSurfaceContext";
import PreferredConciergePresence from "@/components/preferred/PreferredConciergePresence";
import PreferredConciergeChat from "./PreferredConciergeChat";

const SESSION_SECONDS = 180;

// She greets the member once per visit to the portal. Held in memory only, so a reload
// brings her back (she is there when you arrive) while moving around the portal lets
// her rest instead of minting a new video session on every page.
let greetedThisVisit = false;

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
  const navigate = useNavigate();
  const location = useLocation();
  const { active: activeSurface, open: openSurface, close: closeSurface } = usePreferredSurface();
  // A workspace is open beside her: she steps back into a small panel so the member can work.
  const docked = !!activeSurface;

  // What the member is looking at, sent with every spoken instruction so "these photos" or
  // "my listing" means the screen in front of them.
  const pageContext = {
    page: location.pathname,
    listing_id: new URLSearchParams(location.search).get("jobId")
      || new URLSearchParams(location.search).get("listing")
      || "",
    surface: activeSurface?.key || "",
  };

  const handleDirective = useCallback((ui) => {
    applyConciergeDirective(ui, { open: openSurface, navigate });
  }, [navigate, openSurface]);

  useEffect(() => {
    document.body.classList.toggle("preferred-pip-visible", docked);
    return () => document.body.classList.remove("preferred-pip-visible");
  }, [docked]);

  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState("idle");
  const [remaining, setRemaining] = useState(SESSION_SECONDS);
  const [issue, setIssue] = useState("");
  const [checklist, setChecklist] = useState([]);
  // Only if a direct join is refused does the provider's own page step in.
  const [fallback, setFallback] = useState(false);

  const connect = useCallback(async () => {
    setPhase("connecting");
    setIssue("");
    setChecklist([]);
    setFallback(false);
    setRemaining(SESSION_SECONDS);
    try {
      // A fresh conversation every time she is asked for: a conversation left behind by
      // an earlier visit is still "open" at the provider but her video is gone from it,
      // which is what produced an empty frame.
      const result = await startConciergeVideo(null, { fresh: true });
      if (result?.ok && result?.conversation_url) {
        setUrl(result.conversation_url);
        setPhase("live");
        greetedThisVisit = true;
      } else {
        setUrl("");
        setPhase("unavailable");
        setIssue(result?.message || "The video concierge is unavailable right now.");
        setChecklist(Array.isArray(result?.checklist) ? result.checklist : []);
      }
    } catch {
      setUrl("");
      setPhase("unavailable");
      setIssue("The video concierge is unavailable right now. You can still chat with me below.");
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
    if (greetedThisVisit) {
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
    <section className={docked ? "preferred-pip" : "preferred-glass p-3 sm:p-4"}>
      <div className={`flex items-center justify-between gap-2 ${docked ? "mb-2 px-0.5" : "mb-3 px-1"}`}>
        <p className={`flex items-center gap-1.5 uppercase tracking-[0.26em] text-[#d9bd95] ${docked ? "text-[9px]" : "text-[10px]"}`}>
          <Crown className="h-3.5 w-3.5" /> Arriv Concierge
        </p>
        {docked ? (
          <button
            type="button"
            onClick={closeSurface}
            className="preferred-focus flex items-center gap-1 rounded-full border border-[#c8a87c]/45 px-2 py-1 text-[10px] text-[#f6f1e8] hover:bg-[#c8a87c]/15"
            aria-label="Close the workspace and bring the concierge back to full size"
          >
            <Maximize2 className="h-3 w-3" /> Expand
          </button>
        ) : phase === "live" && (
          <p className="flex items-center gap-1.5 text-[11px] text-[#f6f1e8]/70">
            <span className="h-1.5 w-1.5 rounded-full bg-[#d9bd95]" />
            {clock(remaining)} left in this session
          </p>
        )}
      </div>

      <div
        className="preferred-stage"
        style={docked
          ? { aspectRatio: "4 / 3", minHeight: "0", height: "auto" }
          : { aspectRatio: "16 / 10", minHeight: "300px" }}
      >
        {phase === "live" && url && (
          fallback ? (
            <iframe
              key={url}
              src={url}
              title="Arriv Concierge video representative"
              allow="camera; microphone; autoplay; fullscreen; display-capture; speaker-selection"
            />
          ) : (
            <PreferredConciergePresence
              url={url}
              displayName={customer?.full_name || firstName}
              conciergeName={conciergeName}
              onStepAway={stepAway}
              onFail={() => setFallback(true)}
              compact={docked}
              context={pageContext}
              onDirective={handleDirective}
            />
          )
        )}

        {phase === "connecting" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-[#f6f1e8]/78">
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
                  <li key={step} className="flex gap-1.5 text-[11px] leading-relaxed text-[#f6f1e8]/70">
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

      </div>

      {/* Never unmounted: the thread survives every panel the member opens, and stays typeable
          while they work so the next instruction can be written as easily as spoken. */}
      <div className={docked ? "preferred-chat-docked" : ""}>
        <PreferredConciergeChat ref={chatRef} firstName={firstName} />
      </div>
      {docked && (
        <p className="mt-2 px-0.5 text-[10.5px] leading-relaxed text-[#f6f1e8]/85">
          Still here while you work — speak or type your next instruction.
        </p>
      )}
    </section>
  );
}
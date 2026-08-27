import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, CheckCircle2, Video, Mic, MicOff, VideoOff, PhoneOff, Shield, ArrowLeft } from "lucide-react";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const DARK = "#1A1A1A";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

export default function TavusInterviewPanel({ roomName, currentUserName, onClose }) {
  const [conference, setConference] = useState(null);
  const [loadingConference, setLoadingConference] = useState(true);
  const [phase, setPhase] = useState("precall"); // precall | connecting | active | completed | error
  const [conversation, setConversation] = useState(null);
  const [error, setError] = useState(null);
  const [disclosureAck, setDisclosureAck] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [creatingConv, setCreatingConv] = useState(false);
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const pollRef = useRef(null);

  // ─── Load Conference record ──────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await base44.entities.Conference.filter({ room_name: roomName });
        const conf = res?.data?.[0] || res?.[0];
        if (!mounted) return;
        if (!conf) {
          setError("Conference not found");
          setPhase("error");
          setLoadingConference(false);
          return;
        }
        setConference(conf);
        // If already completed, show completed state
        if (conf.tavus_conversation_status === "ended" || conf.status === "completed") {
          setPhase("completed");
        }
        setLoadingConference(false);
      } catch (e) {
        if (!mounted) return;
        setError("Failed to load conference: " + e.message);
        setPhase("error");
        setLoadingConference(false);
      }
    })();
    return () => { mounted = false; };
  }, [roomName]);

  // ─── Camera/mic preview for pre-call check ─────────────────────────────────
  useEffect(() => {
    if (phase !== "precall") return;
    let mounted = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        setCameraReady(true);
        setTimeout(() => {
          if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        }, 50);
      } catch (e) {
        if (mounted) setCameraReady(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [phase]);

  // ─── Start the Tavus interview ─────────────────────────────────────────────
  const handleStartInterview = useCallback(async () => {
    setCreatingConv(true);
    setError(null);
    setPhase("connecting");
    try {
      const res = await base44.functions.invoke("createTavusInterviewConversation", { roomName });
      const data = res?.data || res;
      if (!data?.conversation_url) throw new Error("No conversation URL returned");
      setConversation(data);
      setPhase("active");

      // Stop local preview stream (Tavus iframe will use camera/mic directly)
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    } catch (e) {
      setError(e.message || "Failed to start AI interview");
      setPhase("error");
    } finally {
      setCreatingConv(false);
    }
  }, [roomName]);

  // ─── End the interview ────────────────────────────────────────────────────
  const handleEndInterview = useCallback(async () => {
    try {
      await base44.functions.invoke("endTavusInterview", { roomName });
    } catch (_) {}
    setPhase("completed");
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, [roomName]);

  // ─── Poll for completion (Tavus webhook updates Conference async) ──────────
  useEffect(() => {
    if (phase !== "active") return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await base44.entities.Conference.filter({ room_name: roomName });
        const conf = res?.data?.[0] || res?.[0];
        if (conf && (conf.tavus_conversation_status === "ended" || conf.status === "completed")) {
          setConference(conf);
          setPhase("completed");
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
      } catch (_) {}
    }, 5000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [phase, roomName]);

  // ─── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ─── Build conversation URL with meeting token for private rooms ───────────
  const buildEmbedUrl = () => {
    if (!conversation?.conversation_url) return null;
    let url = conversation.conversation_url;
    if (conversation.meeting_token) {
      const sep = url.includes("?") ? "&" : "?";
      url += `${sep}t=${encodeURIComponent(conversation.meeting_token)}`;
    }
    return url;
  };

  // ─── Loading state ────────────────────────────────────────────────────────
  if (loadingConference) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: CREAM }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
      </div>
    );
  }

  // ─── Error state ──────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: CREAM }}>
        <div className="max-w-md w-full rounded-xl p-6" style={{ backgroundColor: DARK, border: "1px solid rgba(184,149,106,0.2)" }}>
          <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: "#ef4444" }} />
          <p className="text-center mb-4" style={{ color: CREAM }}>{error || "An error occurred"}</p>
          <Button onClick={onClose} variant="outline" className="w-full" style={{ borderColor: GOLD, color: CREAM }}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
          </Button>
        </div>
      </div>
    );
  }

  // ─── Completed state ──────────────────────────────────────────────────────
  if (phase === "completed") {
    const reviewRequired = conference?.tavus_review_required;
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: CREAM }}>
        <div className="max-w-md w-full rounded-xl p-8 text-center" style={{ backgroundColor: DARK, border: "1px solid rgba(184,149,106,0.2)" }}>
          <CheckCircle2 className="w-16 h-16 mx-auto mb-4" style={{ color: GOLD }} />
          <h2 className="text-2xl font-bold mb-2" style={{ ...SERIF, color: CREAM }}>Interview Submitted</h2>
          <p className="mb-4" style={{ color: "rgba(255,251,245,0.6)" }}>
            Thank you for completing your interview. Your responses have been recorded and will be reviewed by our hiring team.
          </p>
          {reviewRequired && (
            <div className="rounded-lg p-3 mb-4" style={{ backgroundColor: "rgba(184,149,106,0.1)", border: "1px solid rgba(184,149,106,0.2)" }}>
              <p className="text-sm" style={{ color: GOLD }}>
                Some responses may require follow-up. Our team will be in touch if needed.
              </p>
            </div>
          )}
          <Button onClick={onClose} style={{ backgroundColor: GOLD, color: DARK, fontWeight: 600 }}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  // ─── Pre-call state: disclosure + camera check + start ────────────────────
  if (phase === "precall") {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: CREAM }}>
        {/* Header */}
        <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(184,149,106,0.2)" }}>
          <div className="flex items-center gap-3">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png"
              alt="Arriv"
              className="h-7"
            />
            <div>
              <h1 className="text-lg font-bold" style={{ ...SERIF, color: DARK }}>{conference?.title || "AI Interview"}</h1>
              <p className="text-xs" style={{ color: "rgba(26,26,26,0.5)" }}>Arriv Estate Media</p>
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full grid md:grid-cols-2 gap-6">
            {/* Camera preview */}
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: DARK, border: "1px solid rgba(184,149,106,0.2)" }}>
              <div className="relative aspect-video bg-black">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
                />
                {!cameraReady && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
                  </div>
                )}
              </div>
              <div className="p-3 flex items-center justify-center gap-3">
                <button
                  onClick={() => {
                    const newMic = !micEnabled;
                    setMicEnabled(newMic);
                    localStreamRef.current?.getAudioTracks().forEach(t => t.enabled = newMic);
                  }}
                  className="p-2 rounded-full transition-all"
                  style={{ backgroundColor: micEnabled ? "rgba(184,149,106,0.15)" : "#ef4444", color: micEnabled ? GOLD : "#fff" }}
                >
                  {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>
                <button
                  onClick={() => {
                    const newVideo = !videoEnabled;
                    setVideoEnabled(newVideo);
                    localStreamRef.current?.getVideoTracks().forEach(t => t.enabled = newVideo);
                  }}
                  className="p-2 rounded-full transition-all"
                  style={{ backgroundColor: videoEnabled ? "rgba(184,149,106,0.15)" : "#ef4444", color: videoEnabled ? GOLD : "#fff" }}
                >
                  {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Disclosure + start */}
            <div className="flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-5 h-5" style={{ color: GOLD }} />
                  <h2 className="text-lg font-bold" style={{ ...SERIF, color: DARK }}>AI Interview Disclosure</h2>
                </div>
                <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: "rgba(184,149,106,0.08)", border: "1px solid rgba(184,149,106,0.2)" }}>
                  <p className="text-sm" style={{ color: DARK }}>
                    This interview is conducted by an <strong>AI interviewer</strong>. Your responses may be transcribed and used as part of the application review process.
                  </p>
                  <p className="text-sm mt-2" style={{ color: "rgba(26,26,26,0.6)" }}>
                    You are not speaking with a human employee. Your answers will be evaluated fairly based on what you say.
                  </p>
                </div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={disclosureAck}
                    onChange={(e) => setDisclosureAck(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded"
                    style={{ accentColor: GOLD }}
                  />
                  <span className="text-sm" style={{ color: DARK }}>
                    I acknowledge this disclosure and consent to the AI interview process.
                  </span>
                </label>
              </div>

              <Button
                onClick={handleStartInterview}
                disabled={!disclosureAck || !cameraReady || creatingConv}
                className="w-full mt-4"
                style={{ backgroundColor: GOLD, color: DARK, fontWeight: 600 }}
              >
                {creatingConv ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting...</>
                ) : (
                  <><Video className="w-4 h-4 mr-2" /> Start Interview</>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Connecting state ─────────────────────────────────────────────────────
  if (phase === "connecting") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: CREAM }}>
        <Loader2 className="w-10 h-10 animate-spin mb-4" style={{ color: GOLD }} />
        <p style={{ color: DARK }} className="font-medium">Connecting to AI interviewer...</p>
      </div>
    );
  }

  // ─── Active interview: Tavus iframe ───────────────────────────────────────
  const embedUrl = buildEmbedUrl();
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: DARK }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(184,149,106,0.2)" }}>
        <div className="flex items-center gap-3">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png"
            alt="Arriv"
            className="h-6"
          />
          <div>
            <p className="text-sm font-semibold" style={{ color: CREAM }}>{conference?.title || "AI Interview"}</p>
            <p className="text-xs" style={{ color: GOLD }}>● AI Interview in Progress</p>
          </div>
        </div>
        <Button
          onClick={handleEndInterview}
          className="bg-red-600 hover:bg-red-700 text-white"
          size="sm"
        >
          <PhoneOff className="w-4 h-4 mr-2" /> End Interview
        </Button>
      </div>

      {/* Tavus conversation iframe */}
      <div className="flex-1 relative">
        {embedUrl && (
          <iframe
            src={embedUrl}
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            style={{ width: "100%", height: "100%", border: "none", minHeight: "500px" }}
            title="Arriv AI Interview"
          />
        )}
      </div>
    </div>
  );
}
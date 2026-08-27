import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, Phone } from "lucide-react";
import { base44 } from "@/api/base44Client";
import DailyIframe from "@daily-co/daily-js";
import VideoControls from "@/components/sales/VideoControls";

/**
 * TavusInterviewPanel — renders the Tavus AI interview inside a shell that
 * visually replicates VideoCallPanelV2 exactly. Uses the Daily JS SDK to
 * join the Tavus conversation and render participant streams within our own
 * UI (no Tavus iframe/branding). The candidate perceives the same Arriv
 * Estate Media video calling experience.
 */
export default function TavusInterviewPanel({
  roomName,
  currentUserName,
  recipientName,
  onClose,
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const callRef = useRef(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [callState, setCallState] = useState("idle");
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);

  // ─── Camera init (same as VideoCallPanelV2) ──────────────────────────────
  useEffect(() => {
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
          if (localVideoRef.current && localStreamRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }
        }, 50);
      } catch (err) {
        if (mounted) setError("Camera error: " + err.message);
      }
    })();
    return () => {
      mounted = false;
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    };
  }, []);

  // ─── Render remote participant video ─────────────────────────────────────
  const renderRemoteVideo = useCallback(() => {
    const call = callRef.current;
    if (!call || !remoteVideoRef.current) return;
    const participants = call.participants();
    const remote = Object.values(participants).find((p) => !p.local);
    if (remote?.videoTrack) {
      const stream = new MediaStream([remote.videoTrack]);
      remoteVideoRef.current.srcObject = stream;
      setHasRemoteVideo(true);
    } else {
      if (remoteVideoRef.current.srcObject) {
        remoteVideoRef.current.srcObject = null;
      }
      setHasRemoteVideo(false);
    }
  }, []);

  // ─── Start call (same flow as VideoCallPanelV2 handleStartCall) ────────────
  const handleStartCall = useCallback(async () => {
    setCallState("calling");
    setIsLoading(true);
    setError(null);
    try {
      // 1. Create/reuse the Tavus conversation via backend
      const res = await base44.functions.invoke("createTavusInterviewConversation", { roomName });
      const data = res?.data || res;
      if (data?.status !== "success" || !data.conversationUrl) {
        throw new Error(data?.error || "Failed to create AI interview conversation");
      }

      // 2. Join the Daily room (Tavus CVI runs on Daily)
      const call = DailyIframe.createCallObject();
      callRef.current = call;

      call.on("participant-joined", renderRemoteVideo);
      call.on("participant-updated", renderRemoteVideo);
      call.on("participant-left", () => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        setHasRemoteVideo(false);
      });
      call.on("left-meeting", () => {
        setCallState("idle");
      });
      call.on("error", (e) => {
        console.error("Daily error:", e);
        setError("Connection error: " + (e?.errorMsg || "Unknown"));
      });

      await call.join({
        url: data.conversationUrl,
        token: data.meetingToken,
        userName: currentUserName || "Guest",
        startVideoOff: false,
        startAudioOff: false,
      });

      setCallState("connected");

      // Render any already-present remote participant
      setTimeout(renderRemoteVideo, 500);
    } catch (err) {
      console.error("Call start error:", err);
      setError("Connection failed: " + err.message);
      setCallState("idle");
    } finally {
      setIsLoading(false);
    }
  }, [roomName, currentUserName, renderRemoteVideo]);

  // ─── Mic / Video toggles (same pattern as VideoCallPanelV2) ───────────────
  const toggleMic = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
    callRef.current?.setLocalAudio(!newMuted);
  }, [isMuted]);

  const toggleVideo = useCallback(() => {
    const newOn = !isVideoOn;
    setIsVideoOn(newOn);
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = newOn; });
    callRef.current?.setLocalVideo(newOn);
  }, [isVideoOn]);

  // ─── End call (same flow as VideoCallPanelV2 handleEndCall) ───────────────
  const handleEndCall = useCallback(() => {
    // End the Tavus conversation server-side (triggers transcript processing)
    if (callRef.current) {
      try { callRef.current.leave(); } catch (_) {}
      try { callRef.current.destroy(); } catch (_) {}
      callRef.current = null;
    }
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;

    // Fire-and-forget: tell backend to end the Tavus conversation
    base44.functions.invoke("endTavusInterview", { roomName }).catch(() => {});

    onClose();
  }, [onClose, roomName]);

  // ─── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (callRef.current) {
        try { callRef.current.leave(); } catch (_) {}
        try { callRef.current.destroy(); } catch (_) {}
        callRef.current = null;
      }
    };
  }, []);

  // ─── Render (identical structure to VideoCallPanelV2) ─────────────────────
  return (
    <div className="fixed inset-0 bg-black flex flex-col z-[99999]">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
            {(recipientName || "U").charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">{recipientName || "Video Call"}</p>
            <p className={`text-xs leading-tight ${
              callState === "connected" ? "text-green-400" :
              callState === "calling"   ? "text-yellow-400" : "text-gray-400"
            }`}>
              {callState === "connected" ? "● Connected" :
               callState === "calling"   ? "● Connecting..." : "● Preview"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleEndCall}
            className="h-10 w-10 p-0 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 flex-shrink-0"
            style={{ minWidth: '40px', minHeight: '40px' }}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Video area */}
      <div className="flex-1 relative bg-black overflow-hidden">
        {/* Remote video — fills the screen (same as VideoCallPanelV2) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            position: "absolute",
            inset: 0,
            background: "#000",
          }}
        />

        {/* Waiting text — only when connected but no remote video */}
        {callState === "connected" && !hasRemoteVideo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1]">
            <p className="text-gray-600 text-sm">Waiting for other participant...</p>
          </div>
        )}

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-[5]">
            <div className="text-center">
              <div className="w-10 h-10 rounded-full border-4 border-blue-500 border-t-transparent animate-spin mx-auto mb-3" />
              <p className="text-white text-sm">Connecting...</p>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-[6] px-8">
            <p className="text-red-400 text-sm font-semibold mb-4 text-center">⚠️ {error}</p>
            <Button onClick={() => setError(null)} variant="outline" size="sm">Dismiss</Button>
          </div>
        )}

        {/* Local video PIP — always rendered, srcObject set after mount */}
        <div className="absolute bottom-4 right-4 w-36 h-28 rounded-lg overflow-hidden border-2 border-blue-500 bg-gray-900 shadow-2xl z-[8]">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              transform: "scaleX(-1)"
            }}
          />
          {!cameraReady && (
            <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
              <div className="w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
            </div>
          )}
          {cameraReady && !isVideoOn && (
            <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
              <span className="text-2xl">📷</span>
            </div>
          )}
          <div className="absolute bottom-1 left-0 right-0 text-center pointer-events-none">
            <span className="text-[10px] text-gray-400 bg-black/50 px-1 rounded">You</span>
          </div>
        </div>

        {/* Connected badge */}
        {callState === "connected" && (
          <div className="absolute top-3 left-3 px-3 py-1 bg-green-600/80 backdrop-blur rounded-full text-white text-xs font-semibold z-[8]">
            ✓ Connected
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="flex-shrink-0 bg-gray-900 border-t border-gray-700 px-4 py-3 flex items-center gap-3">
        {callState === "idle" && (
          <Button
            onClick={handleStartCall}
            disabled={isLoading || !cameraReady}
            className="bg-green-600 hover:bg-green-700 text-white gap-2 flex-shrink-0 h-10"
          >
            <Phone className="w-4 h-4" />
            Join Call
          </Button>
        )}

        <div className="flex-1 flex items-center justify-center gap-3">
          <VideoControls
            isMuted={isMuted}
            isVideoOn={isVideoOn}
            isScreenSharing={false}
            canScreenShare={false}
            onToggleMic={toggleMic}
            onToggleVideo={toggleVideo}
            onToggleScreenShare={() => {}}
            onEndCall={handleEndCall}
            onSettings={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, Phone, MessageCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import VideoControls from "./VideoControls";
import VideoChat from "./VideoChat";
import VideoSettingsPanel from "./VideoSettingsPanel";

export default function VideoCallPanelV2({
  recipientName,
  recipientExtension,
  callerToken,
  roomName,
  onClose,
  currentUserName,
  isIncoming = false,
  autoStart = false
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const twilioRoomRef = useRef(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const [callState, setCallState] = useState("idle");
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  // ─── Camera init ────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true
        });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }

        localStreamRef.current = stream;

        // Attach to video element — it's always mounted in the DOM
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setCameraReady(true);
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

  // ─── Track attachment helpers (use refs so they're always current) ──────────
  const attachTrack = useCallback((track) => {
    if (!track) return;
    if (track.kind === "video" && remoteVideoRef.current) {
      const el = track.attach();
      el.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
      remoteVideoRef.current.innerHTML = "";
      remoteVideoRef.current.appendChild(el);
    } else if (track.kind === "audio") {
      const el = track.attach();
      el.autoplay = true;
      el.style.display = "none";
      document.body.appendChild(el);
    }
  }, []);

  const detachTrack = useCallback((track) => {
    if (!track) return;
    track.detach().forEach(el => el.remove());
  }, []);

  const attachParticipant = useCallback((participant) => {
    // Handle already-subscribed tracks
    participant.tracks.forEach((publication) => {
      if (publication.isSubscribed && publication.track) {
        attachTrack(publication.track);
      }
    });
    // Handle future track subscriptions
    // Twilio fires: trackSubscribed(track, publication, participant)
    participant.on("trackSubscribed", (track) => attachTrack(track));
    participant.on("trackUnsubscribed", (track) => detachTrack(track));
  }, [attachTrack, detachTrack]);

  const detachParticipant = useCallback((_participant) => {
    if (remoteVideoRef.current) remoteVideoRef.current.innerHTML = "";
  }, []);

  // ─── Room connection ─────────────────────────────────────────────────────────
  const connectToRoom = useCallback(async (token, room) => {
    try {
      if (!window.Twilio?.Video) await loadTwilioSDK();
      if (!window.Twilio?.Video) throw new Error("Twilio Video SDK unavailable");

      const videoRoom = await window.Twilio.Video.connect(token, {
        name: room,
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { width: 640, height: 480 }
      });

      twilioRoomRef.current = videoRoom;

      // Existing participants
      videoRoom.participants.forEach(p => attachParticipant(p));
      // Future participants
      videoRoom.on("participantConnected", p => attachParticipant(p));
      videoRoom.on("participantDisconnected", p => detachParticipant(p));
      videoRoom.on("disconnected", () => setCallState("idle"));
      videoRoom.on("error", err => setError("Room error: " + err.message));

      setCallState("connected");
    } catch (err) {
      console.error("Room connection error:", err);
      setError("Connection failed: " + err.message);
      setCallState("idle");
    }
  }, [attachParticipant, detachParticipant]);

  // ─── Start call ──────────────────────────────────────────────────────────────
  const handleStartCall = useCallback(async () => {
    setCallState("calling");
    setIsLoading(true);
    setError(null);
    try {
      if (callerToken && roomName) {
        await connectToRoom(callerToken, roomName);
      } else if (roomName) {
        const response = await base44.functions.invoke("generateDirectVideoToken", {
          roomName,
          participantName: currentUserName || "Guest"
        });
        if (!response?.data?.token) throw new Error("Failed to generate video token");
        await connectToRoom(response.data.token, roomName);
      } else {
        throw new Error("No room name provided");
      }
    } catch (err) {
      console.error("Call start error:", err);
      setError("Connection failed: " + err.message);
      setCallState("idle");
    } finally {
      setIsLoading(false);
    }
  }, [callerToken, roomName, currentUserName, connectToRoom]);

  // ─── Auto-start ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoStart && roomName && !recipientExtension && callState === "idle" && cameraReady) {
      const t = setTimeout(handleStartCall, 300);
      return () => clearTimeout(t);
    }
  }, [autoStart, roomName, recipientExtension, callState, cameraReady, handleStartCall]);

  // ─── Mic / Video toggles ──────────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    setIsMuted(prev => {
      const newMuted = !prev;
      localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
      twilioRoomRef.current?.localParticipant?.audioTracks.forEach(pub => {
        newMuted ? pub.track?.disable() : pub.track?.enable();
      });
      return newMuted;
    });
  }, []);

  const toggleVideo = useCallback(() => {
    setIsVideoOn(prev => {
      const newOn = !prev;
      localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = newOn; });
      twilioRoomRef.current?.localParticipant?.videoTracks.forEach(pub => {
        newOn ? pub.track?.enable() : pub.track?.disable();
      });
      return newOn;
    });
  }, []);

  // ─── Screen share ─────────────────────────────────────────────────────────────
  const toggleScreenShare = useCallback(async () => {
    if (!twilioRoomRef.current?.localParticipant) {
      setError("Not in a call");
      return;
    }

    if (isScreenSharing) {
      // Stop screen share → switch back to camera
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;

      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      if (camTrack?.readyState === "live") {
        const pub = Array.from(twilioRoomRef.current.localParticipant.videoTracks.values())[0];
        if (pub?.track) await pub.track.replaceTrack(camTrack).catch(console.error);
      }
      setIsScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const screenTrack = screenStream.getVideoTracks()[0];
        if (!screenTrack) throw new Error("No screen track obtained");

        const pub = Array.from(twilioRoomRef.current.localParticipant.videoTracks.values())[0];
        if (!pub?.track) throw new Error("No local video publication found");

        screenStreamRef.current = screenStream;
        await pub.track.replaceTrack(screenTrack);
        setIsScreenSharing(true);

        // When user stops sharing via browser UI
        screenTrack.onended = async () => {
          const camTrack = localStreamRef.current?.getVideoTracks()[0];
          if (camTrack?.readyState === "live") {
            const p2 = Array.from(twilioRoomRef.current?.localParticipant?.videoTracks.values() || [])[0];
            if (p2?.track) await p2.track.replaceTrack(camTrack).catch(console.error);
          }
          screenStreamRef.current = null;
          setIsScreenSharing(false);
        };
      } catch (err) {
        if (err.name !== "NotAllowedError") setError("Screen share failed: " + err.message);
        screenStreamRef.current?.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
    }
  }, [isScreenSharing]);

  // ─── End call ────────────────────────────────────────────────────────────────
  const handleEndCall = useCallback(() => {
    try { twilioRoomRef.current?.disconnect(); } catch (_) {}
    twilioRoomRef.current = null;

    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;

    if (remoteVideoRef.current) remoteVideoRef.current.innerHTML = "";
    if (localVideoRef.current) localVideoRef.current.srcObject = null;

    onClose();
  }, [onClose]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50">

      {/* ── Header ── */}
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
        <Button variant="ghost" size="icon" onClick={handleEndCall}
          className="text-gray-400 hover:text-white hover:bg-gray-700">
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* ── Video area ── */}
      <div className="flex-1 relative bg-black overflow-hidden">

        {/* Remote video */}
        <div ref={remoteVideoRef} className="absolute inset-0 w-full h-full bg-black" />

        {/* "Waiting" text when connected but no remote yet */}
        {callState === "connected" && (
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
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-[6]">
            <p className="text-red-400 text-sm font-semibold mb-4 px-8 text-center">⚠️ {error}</p>
            <Button onClick={() => setError(null)} variant="outline" size="sm">Dismiss</Button>
          </div>
        )}

        {/* Local video PIP — always shown */}
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
              transform: "scaleX(-1)",
              filter: isBlurred ? "blur(12px)" : "none"
            }}
          />
          {/* Camera loading */}
          {!cameraReady && (
            <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
              <div className="w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
            </div>
          )}
          {/* Video off overlay */}
          {cameraReady && !isVideoOn && (
            <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
              <span className="text-2xl">📷</span>
            </div>
          )}
          {/* Screen sharing overlay */}
          {isScreenSharing && (
            <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
              <span className="text-xs text-gray-300">Sharing</span>
            </div>
          )}
          <div className="absolute bottom-1 left-0 right-0 text-center">
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

      {/* ── Controls bar ── */}
      <div className="flex-shrink-0 bg-gray-900 border-t border-gray-700 px-4 py-3 flex items-center gap-3">

        {/* Start / Join */}
        {callState === "idle" && (
          <Button
            onClick={handleStartCall}
            disabled={isLoading || !cameraReady}
            className="bg-green-600 hover:bg-green-700 text-white gap-2 flex-shrink-0 h-10"
          >
            <Phone className="w-4 h-4" />
            {isIncoming ? "Join Call" : "Start Call"}
          </Button>
        )}

        {/* Mic / Video / Screen / Settings / End */}
        <div className="flex-1 flex items-center justify-center gap-2">
          <VideoControls
            isMuted={isMuted}
            isVideoOn={isVideoOn}
            isScreenSharing={isScreenSharing}
            canScreenShare={callState === "connected"}
            onToggleMic={toggleMic}
            onToggleVideo={toggleVideo}
            onToggleScreenShare={toggleScreenShare}
            onEndCall={handleEndCall}
            onSettings={() => setIsSettingsOpen(true)}
          />
        </div>

        {/* Chat */}
        <Button
          size="icon"
          onClick={() => setIsChatOpen(v => !v)}
          className={`h-10 w-10 rounded-full flex-shrink-0 ${
            isChatOpen ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-700 hover:bg-gray-600"
          }`}
          title="Chat"
        >
          <MessageCircle className="w-5 h-5 text-white" />
        </Button>
      </div>

      {/* ── Chat sidebar (fixed, on top of everything) ── */}
      {isChatOpen && (
        <VideoChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      )}

      {/* ── Settings modal (fixed, highest z) ── */}
      <VideoSettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onBlurChange={setIsBlurred}
        isBlurred={isBlurred}
      />
    </div>
  );
}

// ─── Twilio SDK loader ────────────────────────────────────────────────────────
async function loadTwilioSDK() {
  return new Promise((resolve, reject) => {
    if (window.Twilio?.Video) return resolve(window.Twilio.Video);

    // If already injecting, wait for it
    const existing = document.querySelector('script[src*="twilio-video"]');
    if (existing) {
      const poll = setInterval(() => {
        if (window.Twilio?.Video) { clearInterval(poll); resolve(window.Twilio.Video); }
      }, 100);
      setTimeout(() => { clearInterval(poll); reject(new Error("Twilio SDK load timeout")); }, 15000);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://sdk.twilio.com/js/video/releases/2.28.0/twilio-video.min.js";
    script.onload = () => {
      const poll = setInterval(() => {
        if (window.Twilio?.Video) { clearInterval(poll); resolve(window.Twilio.Video); }
      }, 100);
      setTimeout(() => { clearInterval(poll); reject(new Error("Twilio.Video not available after load")); }, 8000);
    };
    script.onerror = () => reject(new Error("Failed to load Twilio SDK"));
    document.head.appendChild(script);
  });
}
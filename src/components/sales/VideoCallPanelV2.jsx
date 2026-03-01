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

  // Initialize camera on mount — always show local preview
  useEffect(() => {
    let mounted = true;

    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true
        });

        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        localStreamRef.current = stream;
        setCameraReady(true);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.error("Camera init error:", err);
        if (mounted) setError("Cannot access camera: " + err.message);
      }
    };

    initCamera();

    return () => {
      mounted = false;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
    };
  }, []);

  // connectToRoom defined before handleStartCall so autoStart can use it
  const connectToRoom = useCallback(async (token, room) => {
    try {
      if (!window.Twilio?.Video) {
        await loadTwilioSDK();
      }
      if (!window.Twilio?.Video) throw new Error("Twilio Video SDK not available");

      const videoRoom = await window.Twilio.Video.connect(token, {
        name: room,
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { width: 640, height: 480 },
        networkQuality: { local: 1, remote: 1 }
      });

      twilioRoomRef.current = videoRoom;

      // Existing participants
      videoRoom.participants.forEach(p => attachParticipant(p));

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
  }, []);

  const handleStartCall = useCallback(async () => {
    try {
      setCallState("calling");
      setIsLoading(true);
      setError(null);

      if (callerToken && roomName) {
        await connectToRoom(callerToken, roomName);
      } else if (roomName) {
        const response = await base44.functions.invoke("generateDirectVideoToken", {
          roomName,
          participantName: currentUserName || "Guest"
        });
        if (!response?.data?.token) throw new Error("Failed to generate token");
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

  // Auto-start
  useEffect(() => {
    if (autoStart && roomName && !recipientExtension && callState === "idle" && cameraReady) {
      const t = setTimeout(handleStartCall, 300);
      return () => clearTimeout(t);
    }
  }, [autoStart, roomName, recipientExtension, callState, cameraReady, handleStartCall]);

  const attachParticipant = (participant) => {
    const onTrack = (publication) => {
      if (!publication?.track) return;
      const track = publication.track;
      if (track.kind === "video") {
        if (remoteVideoRef.current) {
          const el = track.attach();
          el.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
          remoteVideoRef.current.innerHTML = "";
          remoteVideoRef.current.appendChild(el);
        }
      } else if (track.kind === "audio") {
        const el = track.attach();
        el.autoplay = true;
        el.style.display = "none";
        document.body.appendChild(el);
      }
    };

    const onUntrack = (publication) => {
      if (!publication?.track) return;
      publication.track.detach().forEach(el => el.remove());
    };

    // Already subscribed tracks
    participant.tracks.forEach(pub => {
      if (pub.isSubscribed) onTrack(pub);
    });

    participant.on("trackSubscribed", track => onTrack({ track }));
    participant.on("trackUnsubscribed", track => onUntrack({ track }));
  };

  const detachParticipant = (_participant) => {
    if (remoteVideoRef.current) remoteVideoRef.current.innerHTML = "";
  };

  const toggleMic = () => {
    const newMuted = !isMuted;
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
    twilioRoomRef.current?.localParticipant?.audioTracks.forEach(pub => {
      newMuted ? pub.track?.disable() : pub.track?.enable();
    });
    setIsMuted(newMuted);
  };

  const toggleVideo = () => {
    const newVideoOn = !isVideoOn;
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = newVideoOn; });
    twilioRoomRef.current?.localParticipant?.videoTracks.forEach(pub => {
      newVideoOn ? pub.track?.enable() : pub.track?.disable();
    });
    setIsVideoOn(newVideoOn);
  };

  const toggleScreenShare = async () => {
    if (!twilioRoomRef.current?.localParticipant) {
      setError("Not in a call");
      return;
    }

    if (isScreenSharing) {
      // Stop screen share, switch back to camera
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;

      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      if (cameraTrack?.readyState === "live") {
        const pub = Array.from(twilioRoomRef.current.localParticipant.videoTracks.values())[0];
        if (pub?.track) await pub.track.replaceTrack(cameraTrack).catch(console.error);
      }
      setIsScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        if (!screenTrack) throw new Error("No screen track");

        const pub = Array.from(twilioRoomRef.current.localParticipant.videoTracks.values())[0];
        if (!pub?.track) throw new Error("No local video publication");

        await pub.track.replaceTrack(screenTrack);
        setIsScreenSharing(true);

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
        setIsScreenSharing(false);
      }
    }
  };

  const handleEndCall = () => {
    try { twilioRoomRef.current?.disconnect(); } catch (_) {}
    twilioRoomRef.current = null;

    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;

    if (remoteVideoRef.current) remoteVideoRef.current.innerHTML = "";
    if (localVideoRef.current) localVideoRef.current.srcObject = null;

    setCallState("idle");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <span className="text-white font-semibold text-sm">
              {(recipientName || "U").charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">{recipientName || "Video Call"}</h3>
            {callState === "connected" && <p className="text-green-400 text-xs">● Connected</p>}
            {callState === "calling" && <p className="text-yellow-400 text-xs">● Connecting...</p>}
            {callState === "idle" && <p className="text-gray-400 text-xs">● Preview</p>}
            {recipientExtension && <p className="text-gray-400 text-xs">Ext. {recipientExtension}</p>}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleEndCall}
          className="text-gray-400 hover:text-white hover:bg-gray-700"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Video Area */}
      <div className="flex-1 relative bg-black overflow-hidden">
        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
            <p className="text-red-400 text-base font-semibold mb-4">⚠️ {error}</p>
            <Button onClick={() => setError(null)} variant="outline" size="sm" className="mr-2">
              Dismiss
            </Button>
          </div>
        )}

        {/* Loading overlay */}
        {isLoading && callState === "calling" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20">
            <div className="text-center">
              <div className="w-10 h-10 rounded-full border-4 border-blue-500 border-t-transparent animate-spin mx-auto mb-3" />
              <p className="text-white text-sm">Connecting...</p>
            </div>
          </div>
        )}

        {/* Remote video (full screen) */}
        <div ref={remoteVideoRef} className="absolute inset-0 w-full h-full bg-black" />

        {/* Waiting for remote placeholder */}
        {callState === "connected" && (
          <div
            id="remote-placeholder"
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ display: remoteVideoRef.current?.children?.length ? "none" : "flex" }}
          >
            <p className="text-gray-500 text-sm">Waiting for other participant...</p>
          </div>
        )}

        {/* Local video — always visible as PIP */}
        <div className="absolute bottom-4 right-4 w-36 h-28 rounded-lg overflow-hidden border-2 border-blue-500 bg-black shadow-2xl z-10">
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
              filter: isBlurred ? "blur(15px)" : "none"
            }}
          />
          {!isVideoOn && (
            <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
              <span className="text-2xl">📷</span>
            </div>
          )}
          {isScreenSharing && (
            <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
              <span className="text-xs text-gray-300">Sharing</span>
            </div>
          )}
          {!cameraReady && (
            <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
              <div className="w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
            </div>
          )}
        </div>

        {/* Connected badge */}
        {callState === "connected" && (
          <div className="absolute top-3 left-3 px-3 py-1 bg-green-600/80 backdrop-blur rounded-full text-white text-xs font-semibold z-10">
            ✓ Connected
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="flex-shrink-0 bg-gray-900 border-t border-gray-700 px-4 py-3 flex items-center gap-3">
        {/* Start / Join button */}
        {callState === "idle" && (
          <Button
            onClick={handleStartCall}
            disabled={isLoading || !cameraReady}
            className="bg-green-600 hover:bg-green-700 text-white gap-2 flex-shrink-0"
          >
            <Phone className="w-4 h-4" />
            {isIncoming ? "Join Call" : "Start Call"}
          </Button>
        )}

        {/* Main controls (mic, video, screen, settings, end) */}
        <div className="flex-1">
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

        {/* Chat toggle */}
        <Button
          size="icon"
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`h-10 w-10 rounded-full flex-shrink-0 ${
            isChatOpen ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-700 hover:bg-gray-600"
          }`}
          title="Chat"
        >
          <MessageCircle className="w-5 h-5 text-white" />
        </Button>
      </div>

      {/* Chat panel — fixed overlay */}
      {isChatOpen && (
        <VideoChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      )}

      {/* Settings panel — fixed overlay */}
      <VideoSettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onBlurChange={setIsBlurred}
        isBlurred={isBlurred}
      />
    </div>
  );
}

async function loadTwilioSDK() {
  return new Promise((resolve, reject) => {
    if (window.Twilio?.Video) return resolve(window.Twilio.Video);
    const existing = document.querySelector('script[src*="twilio-video"]');
    if (existing) {
      const wait = setInterval(() => {
        if (window.Twilio?.Video) { clearInterval(wait); resolve(window.Twilio.Video); }
      }, 100);
      setTimeout(() => { clearInterval(wait); reject(new Error("Twilio SDK timeout")); }, 10000);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://sdk.twilio.com/js/video/releases/2.28.0/twilio-video.min.js";
    script.onload = () => {
      const wait = setInterval(() => {
        if (window.Twilio?.Video) { clearInterval(wait); resolve(window.Twilio.Video); }
      }, 100);
      setTimeout(() => { clearInterval(wait); reject(new Error("Twilio.Video not available after load")); }, 5000);
    };
    script.onerror = () => reject(new Error("Failed to load Twilio SDK script"));
    document.head.appendChild(script);
  });
}
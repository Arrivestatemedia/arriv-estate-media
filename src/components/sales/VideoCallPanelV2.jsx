import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, Phone, MessageCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import VideoControls from "./VideoControls";
import VideoChat from "./VideoChat";
import VideoSettingsPanel from "./VideoSettingsPanel";
import RecordingsPanel from "./RecordingsPanel";
import { useBackgroundBlur } from "./useBackgroundBlur";
import { useCallStatus } from "../CallStatusContext";

export default function VideoCallPanelV2({
  recipientName,
  recipientExtension,
  callerToken,
  roomName,
  onClose,
  currentUserName,
  currentUserId,
  isIncoming = false,
  autoStart = false,
  onMinimize,
  onRestore,
  isVideoWindowOpen,
  onChatOpenRequest
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const twilioRoomRef = useRef(null);
  // Use a ref for isScreenSharing so async callbacks always see latest value
  const isScreenSharingRef = useRef(false);
  const blurStreamRef = useRef(null); // canvas stream when blur is on
  const isBlurredRef = useRef(false);

  const { startBlur, stopBlur } = useBackgroundBlur();
  const { setRemoteCallLive, setCallStatus, setIsCallInitiator } = useCallStatus();

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
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordings, setRecordings] = useState([]);
  const [isRecordingsOpen, setIsRecordingsOpen] = useState(false);

  const mediaRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const remoteVideoTrackRef = useRef(null);
  const remoteAudioTrackRef = useRef(null);
  const audioContextRef = useRef(null);
  const recordingStartTimeRef = useRef(null);
  const recordingTimerRef = useRef(null);

  // Keep ref in sync with state
  const setScreenSharing = (val) => {
    isScreenSharingRef.current = val;
    setIsScreenSharing(val);
  };

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
        setCameraReady(true);

        // Use a small timeout to ensure the video element is fully in DOM
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

  // ─── Track attachment helpers ────────────────────────────────────────────────
  const updateRemoteVideoFit = useCallback((fit = "cover") => {
    if (remoteVideoRef.current) {
      const el = remoteVideoRef.current.querySelector("video");
      if (el) el.style.objectFit = fit;
    }
  }, []);

  const attachTrack = useCallback((track) => {
    if (!track) return;
    if (track.kind === "video" && remoteVideoRef.current) {
      setHasRemoteVideo(true);
      remoteVideoTrackRef.current = track.mediaStreamTrack;
      const el = track.attach();
      // Use contain if it looks like a screen share (name hint or wide dimensions)
      const isScreen = track.name?.includes("screen") || track.mediaStreamTrack?.label?.toLowerCase().includes("screen");
      el.style.cssText = `width:100%;height:100%;object-fit:${isScreen ? "contain" : "cover"};display:block;position:absolute;inset:0;background:#000;`;
      remoteVideoRef.current.innerHTML = "";
      remoteVideoRef.current.appendChild(el);
      // Also detect via dimensions once metadata loads
      el.addEventListener("loadedmetadata", () => {
        if (el.videoWidth > 0 && el.videoHeight > 0) {
          const ratio = el.videoWidth / el.videoHeight;
          el.style.objectFit = ratio > 2 || (el.videoWidth > 1000) ? "contain" : "cover";
        }
      });
    } else if (track.kind === "audio") {
      remoteAudioTrackRef.current = track.mediaStreamTrack;
      const el = track.attach();
      el.autoplay = true;
      el.style.display = "none";
      document.body.appendChild(el);
    }
  }, []);

  const detachTrack = useCallback((track) => {
    if (!track) return;
    if (track.kind === "video") remoteVideoTrackRef.current = null;
    else if (track.kind === "audio") remoteAudioTrackRef.current = null;
    track.detach().forEach(el => el.remove());
  }, []);

  const attachParticipant = useCallback((participant) => {
    // Already-subscribed tracks
    participant.tracks.forEach((publication) => {
      if (publication.isSubscribed && publication.track) {
        attachTrack(publication.track);
      }
    });
    // Twilio fires trackSubscribed(track, publication, participant) — first arg is the Track
    participant.on("trackSubscribed", attachTrack);
    participant.on("trackUnsubscribed", detachTrack);
  }, [attachTrack, detachTrack]);

  const detachParticipant = useCallback(() => {
    setHasRemoteVideo(false);
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
      videoRoom.participants.forEach(p => attachParticipant(p));
      videoRoom.on("participantConnected", p => attachParticipant(p));
      videoRoom.on("participantDisconnected", p => detachParticipant(p));
      
      // Attach room event listeners exactly once, non-destructively
      videoRoom.once("connected", () => {
        // Broadcast to OTHER side that THIS side is live
        localStorage.setItem('remoteCallLive', 'true');
      });
      
      videoRoom.on("disconnected", () => {
        setCallState("idle");
        setRemoteCallLive(false);
        localStorage.removeItem('remoteCallLive');
      });
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
    setCallStatus("calling");
    setIsCallInitiator(true);
    setIsLoading(true);
    setError(null);
    console.log('[VideoCallPanelV2] handleStartCall invoked');
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
      setCallStatus("connected");
    } catch (err) {
      console.error("Call start error:", err);
      setError("Connection failed: " + err.message);
      setCallState("idle");
      setCallStatus("idle");
      setIsCallInitiator(false);
    } finally {
      setIsLoading(false);
    }
  }, [callerToken, roomName, currentUserName, connectToRoom, setCallStatus, setIsCallInitiator]);

  // ─── Auto-start ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoStart && roomName && !recipientExtension && callState === "idle" && cameraReady) {
      const t = setTimeout(handleStartCall, 300);
      return () => clearTimeout(t);
    }
  }, [autoStart, roomName, recipientExtension, callState, cameraReady, handleStartCall]);

  // ─── Mic / Video toggles (functional setState avoids stale closures) ──────────
  const toggleMic = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);

    // Disable raw audio track immediately
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !newMuted; });

    // Tell Twilio to mute/unmute so remote side hears nothing
    twilioRoomRef.current?.localParticipant?.audioTracks.forEach(pub => {
      newMuted ? pub.track?.disable() : pub.track?.enable();
    });
  }, [isMuted]);

  const toggleVideo = useCallback(async () => {
    const participant = twilioRoomRef.current?.localParticipant;
    const newOn = !isVideoOn;
    setIsVideoOn(newOn);

    // Always disable/enable the raw local track so PIP reflects state
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = newOn; });

    if (!participant) return;

    if (!newOn) {
      // Unpublish all video tracks so remote side sees nothing
      const pubs = [...participant.videoTracks.values()];
      pubs.forEach(pub => {
        try { participant.unpublishTrack(pub.track); } catch (_) {}
      });
    } else {
      // Republish camera track
      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      if (camTrack && window.Twilio?.Video) {
        try {
          const twilioTrack = new window.Twilio.Video.LocalVideoTrack(camTrack);
          await participant.publishTrack(twilioTrack);
        } catch (err) {
          console.error("Failed to republish camera:", err);
        }
      }
    }
  }, [isVideoOn]);

  // ─── Screen share (uses ref to avoid stale closure in onended) ───────────────


  const toggleScreenShare = useCallback(async () => {
    if (!twilioRoomRef.current?.localParticipant) {
      setError("Not in a call — cannot share screen");
      return;
    }

    const participant = twilioRoomRef.current.localParticipant;

    if (isScreenSharingRef.current) {
      // Stop screen share → back to camera
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      setScreenSharing(false);
      updateRemoteVideoFit("cover");

      // Unpublish screen track, republish camera track
      participant.videoTracks.forEach(pub => {
        participant.unpublishTrack(pub.track);
        pub.track.stop();
      });

      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      if (camTrack && window.Twilio?.Video) {
        const twilioTrack = new window.Twilio.Video.LocalVideoTrack(camTrack);
        await participant.publishTrack(twilioTrack);
        // Update local preview
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const screenTrack = screenStream.getVideoTracks()[0];
        if (!screenTrack) throw new Error("No screen track obtained");

        screenStreamRef.current = screenStream;

        // Unpublish existing camera track, publish screen track
        participant.videoTracks.forEach(pub => {
          participant.unpublishTrack(pub.track);
        });

        const twilioScreenTrack = new window.Twilio.Video.LocalVideoTrack(screenTrack);
        await participant.publishTrack(twilioScreenTrack);
        setScreenSharing(true);
        // Remote side: switch to contain so full screen is visible
        updateRemoteVideoFit("contain");

        // When user stops via browser's built-in "Stop sharing" button
        screenTrack.onended = () => {
          screenStreamRef.current?.getTracks().forEach(t => t.stop());
          screenStreamRef.current = null;
          setScreenSharing(false);
          updateRemoteVideoFit("cover");

          // Republish camera
          const camTrack = localStreamRef.current?.getVideoTracks()[0];
          if (camTrack && window.Twilio?.Video) {
            participant.videoTracks.forEach(pub => {
              participant.unpublishTrack(pub.track);
            });
            const twilioTrack = new window.Twilio.Video.LocalVideoTrack(camTrack);
            participant.publishTrack(twilioTrack).catch(console.error);
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = localStreamRef.current;
            }
          }
        };
      } catch (err) {
        if (err.name !== "NotAllowedError") setError("Screen share failed: " + err.message);
        screenStreamRef.current?.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
    }
  }, []);

  // ─── Background blur toggle (Zoom-style via MediaPipe canvas) ───────────────
  const handleBlurChange = useCallback(async (enabled) => {
    setIsBlurred(enabled);
    isBlurredRef.current = enabled;

    const participant = twilioRoomRef.current?.localParticipant;

    if (enabled) {
      const videoEl = localVideoRef.current;
      if (!videoEl) return;

      // Wait for video to have dimensions
      const waitForVideo = () => new Promise(resolve => {
        if (videoEl.videoWidth > 0) return resolve();
        videoEl.addEventListener("loadedmetadata", resolve, { once: true });
        setTimeout(resolve, 2000);
      });
      await waitForVideo();

      const canvasStream = await startBlur(videoEl, 18);
      blurStreamRef.current = canvasStream;

      // Show blurred canvas in local PIP
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = canvasStream;
      }

      // Replace Twilio published track with canvas stream track
      if (participant && window.Twilio?.Video) {
        const canvasTrack = canvasStream.getVideoTracks()[0];
        if (canvasTrack) {
          participant.videoTracks.forEach(pub => {
            try { participant.unpublishTrack(pub.track); } catch (_) {}
          });
          const twilioTrack = new window.Twilio.Video.LocalVideoTrack(canvasTrack);
          await participant.publishTrack(twilioTrack).catch(console.error);
        }
      }
    } else {
      stopBlur();
      blurStreamRef.current?.getTracks().forEach(t => t.stop());
      blurStreamRef.current = null;

      // Restore raw camera to local PIP
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      // Re-publish raw camera track to Twilio
      if (participant && window.Twilio?.Video) {
        const camTrack = localStreamRef.current?.getVideoTracks()[0];
        if (camTrack) {
          participant.videoTracks.forEach(pub => {
            try { participant.unpublishTrack(pub.track); } catch (_) {}
          });
          const twilioTrack = new window.Twilio.Video.LocalVideoTrack(camTrack);
          await participant.publishTrack(twilioTrack).catch(console.error);
        }
      }
    }
  }, [startBlur, stopBlur]);

  // ─── Recording ──────────────────────────────────────────────────────────────
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    const tracks = [];
    if (remoteVideoTrackRef.current) tracks.push(remoteVideoTrackRef.current);

    const audioTracks = [];
    if (remoteAudioTrackRef.current) audioTracks.push(remoteAudioTrackRef.current);
    const localAudio = localStreamRef.current?.getAudioTracks()[0];
    if (localAudio) audioTracks.push(localAudio);

    if (audioTracks.length > 0) {
      try {
        const ctx = new AudioContext();
        audioContextRef.current = ctx;
        const destination = ctx.createMediaStreamDestination();
        for (const t of audioTracks) {
          try { ctx.createMediaStreamSource(new MediaStream([t])).connect(destination); } catch (_) {}
        }
        const mixed = destination.stream.getAudioTracks()[0];
        if (mixed) tracks.push(mixed);
      } catch (_) {}
    }

    if (tracks.length === 0) { setError("No media to record"); return; }

    const stream = new MediaStream(tracks);
    let mimeType = "video/webm;codecs=vp8,opus";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    recordingChunksRef.current = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) recordingChunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(recordingChunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const secs = Math.round((Date.now() - recordingStartTimeRef.current) / 1000);
      const now = new Date();
      setRecordings(prev => [{
        id: `rec-${Date.now()}`,
        url,
        label: now.toLocaleString(),
        duration: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`,
        size: blob.size,
      }, ...prev]);
      setIsRecordingsOpen(true);
      if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
      mediaRecorderRef.current = null;
      recordingChunksRef.current = [];
      if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
      setRecordingTime(0);
      setIsRecording(false);
    };

    recorder.start(1000);
    mediaRecorderRef.current = recorder;
    recordingStartTimeRef.current = Date.now();
    setIsRecording(true);
    setRecordingTime(0);
    recordingTimerRef.current = setInterval(() => {
      setRecordingTime(Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));
    }, 1000);
  }, [isRecording]);

  const deleteRecording = useCallback((id) => {
    setRecordings(prev => {
      const rec = prev.find(r => r.id === id);
      if (rec) URL.revokeObjectURL(rec.url);
      return prev.filter(r => r.id !== id);
    });
  }, []);

  // ─── End call ────────────────────────────────────────────────────────────────
  const handleEndCall = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch (_) {}
    }
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    stopBlur();
    blurStreamRef.current?.getTracks().forEach(t => t.stop());
    blurStreamRef.current = null;

    try { twilioRoomRef.current?.disconnect(); } catch (_) {}
    twilioRoomRef.current = null;

    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;

    if (remoteVideoRef.current) remoteVideoRef.current.innerHTML = "";
    if (localVideoRef.current) localVideoRef.current.srcObject = null;

    setRemoteCallLive(false);
    setCallStatus("idle");
    setIsCallInitiator(false);
    localStorage.removeItem('remoteCallLive');
    onClose();
  }, [onClose, stopBlur, setRemoteCallLive, setCallStatus, setIsCallInitiator]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  // When minimized, hide but keep mounted to maintain Twilio connection
  if (!isVideoWindowOpen) return null;

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
            {isRecording && (
              <span className="text-xs text-red-400 flex items-center gap-1 ml-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                REC {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, "0")}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => {
              if (onMinimize) onMinimize();
            }}
            className="h-10 w-10 p-0 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 flex-shrink-0" 
            title="Minimize"
            style={{ minWidth: '40px', minHeight: '40px' }}
          >
            <span className="text-lg leading-none">−</span>
          </Button>
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

        {/* Remote video container */}
        <div ref={remoteVideoRef} className="absolute inset-0 w-full h-full bg-black" />

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
          {isScreenSharing && (
            <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
              <span className="text-xs text-gray-300">Sharing screen</span>
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

        {/* Chat sidebar — overlays video area */}
        <VideoChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} currentUserName={currentUserName} roomName={roomName} currentUserId={currentUserId} />

        {/* Recordings sidebar — overlays video area */}
        <RecordingsPanel
          isOpen={isRecordingsOpen}
          onClose={() => setIsRecordingsOpen(false)}
          recordings={recordings}
          onDelete={deleteRecording}
        />
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
            {isIncoming ? "Join Call" : "Start Call"}
          </Button>
        )}

        <div className="flex-1 flex items-center justify-center gap-3">
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
             onToggleChat={() => setIsChatOpen(prev => !prev)}
             isChatOpen={isChatOpen}
             isRecording={isRecording}
             onToggleRecord={toggleRecording}
             onToggleRecordings={() => setIsRecordingsOpen(prev => !prev)}
             isRecordingsOpen={isRecordingsOpen}
             recordingCount={recordings.length}
           />
         </div>
      </div>

      {/* Chat sidebar — overlays video area, inside video container */}

      {/* Settings modal — fixed z-[70] */}
      <VideoSettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onBlurChange={handleBlurChange}
        isBlurred={isBlurred}
      />
    </div>
  );
}

// ─── Twilio SDK loader ────────────────────────────────────────────────────────
async function loadTwilioSDK() {
  return new Promise((resolve, reject) => {
    if (window.Twilio?.Video) return resolve(window.Twilio.Video);

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
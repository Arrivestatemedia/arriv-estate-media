import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, Phone, Video, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import DailyIframe from "@daily-co/daily-js";
import VideoControls from "@/components/sales/VideoControls";

/**
 * TavusInterviewPanel — renders the Tavus AI interview inside a shell that
 * visually replicates VideoCallPanelV2 exactly. Uses the Daily JS SDK to
 * join the Tavus conversation and render participant streams within our own
 * UI (no Tavus iframe/branding).
 *
 * Recording: starts automatically when the AI participant joins. The combined
 * stream (remote video + mixed audio) is captured via MediaRecorder, uploaded
 * to our storage, and saved to the Conference + HireCandidate profile.
 * A visible red recording indicator is shown at all times during the call.
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

  // Recording refs
  const mediaRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingStartTimeRef = useRef(0);
  const audioContextRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const recordingStartedRef = useRef(false);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [callState, setCallState] = useState("idle");
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingNoticeDismissed, setRecordingNoticeDismissed] = useState(false);
  const [uploadingRecording, setUploadingRecording] = useState(false);

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

  // ─── Start recording (auto, when remote video arrives) ────────────────────
  const startRecording = useCallback((remoteVideoTrack, remoteAudioTrack) => {
    const tracks = [];
    if (remoteVideoTrack) tracks.push(remoteVideoTrack);

    // Mix remote + local audio
    const audioTracks = [];
    if (remoteAudioTrack) audioTracks.push(remoteAudioTrack);
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

    if (tracks.length === 0) { console.warn("No media tracks to record"); return; }

    const stream = new MediaStream(tracks);
    let mimeType = "video/webm;codecs=vp8,opus";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    recordingChunksRef.current = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) recordingChunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      const blob = new Blob(recordingChunksRef.current, { type: "video/webm" });
      const secs = Math.round((Date.now() - recordingStartTimeRef.current) / 1000);
      if (audioContextRef.current) { try { audioContextRef.current.close(); } catch (_) {} audioContextRef.current = null; }
      mediaRecorderRef.current = null;
      recordingChunksRef.current = [];
      setIsRecording(false);
      if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
      setRecordingTime(0);

      if (blob.size === 0) { console.warn("Recording was empty"); return; }

      // Upload recording to our storage
      setUploadingRecording(true);
      try {
        const MAX_CLOUD_SIZE = 50 * 1024 * 1024;
        if (blob.size > MAX_CLOUD_SIZE) {
          console.warn("Recording too large for cloud upload, skipping");
          return;
        }
        const file = new File([blob], `ai-interview-${roomName}-${Date.now()}.webm`, { type: "video/webm" });
        const uploadWithTimeout = (f) => new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Upload timed out")), 60000);
          base44.integrations.Core.UploadFile({ file: f })
            .then(res => { clearTimeout(timer); resolve(res); })
            .catch(err => { clearTimeout(timer); reject(err); });
        });
        const { file_url } = await uploadWithTimeout(file);
        // Save to Conference + HireCandidate via backend
        await base44.functions.invoke("saveInterviewRecording", {
          roomName,
          recordingUrl: file_url,
          durationSeconds: secs,
          fileSize: blob.size,
        });
      } catch (err) {
        console.error("Recording upload failed:", err);
      } finally {
        setUploadingRecording(false);
      }
    };

    recorder.start(1000);
    mediaRecorderRef.current = recorder;
    recordingStartTimeRef.current = Date.now();
    setIsRecording(true);
    setRecordingTime(0);
    recordingTimerRef.current = setInterval(() => {
      setRecordingTime(Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));
    }, 1000);
  }, [roomName]);

  // ─── Stop recording ──────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch (_) {}
    }
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
  }, []);

  // ─── Render remote participant video + start recording ───────────────────
  const renderRemoteVideo = useCallback(() => {
    const call = callRef.current;
    if (!call || !remoteVideoRef.current) return;
    const participants = call.participants();
    const remote = Object.values(participants).find((p) => !p.local);
    if (remote?.videoTrack) {
      const stream = new MediaStream([remote.videoTrack]);
      remoteVideoRef.current.srcObject = stream;
      setHasRemoteVideo(true);
      // Auto-start recording when remote video first arrives
      if (!recordingStartedRef.current && callState === "connected") {
        recordingStartedRef.current = true;
        startRecording(remote.videoTrack, remote.audioTrack);
      }
    } else {
      if (remoteVideoRef.current.srcObject) {
        remoteVideoRef.current.srcObject = null;
      }
      setHasRemoteVideo(false);
    }
  }, [callState, startRecording]);

  // ─── Start call ──────────────────────────────────────────────────────────
  const handleStartCall = useCallback(async () => {
    setCallState("calling");
    setIsLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("createTavusInterviewConversation", { roomName });
      const data = res?.data || res;
      if (data?.status !== "success" || !data.conversationUrl) {
        throw new Error(data?.error || "Failed to create AI interview conversation");
      }

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
      setTimeout(renderRemoteVideo, 500);
    } catch (err) {
      console.error("Call start error:", err);
      setError("Connection failed: " + err.message);
      setCallState("idle");
    } finally {
      setIsLoading(false);
    }
  }, [roomName, currentUserName, renderRemoteVideo]);

  // ─── Mic / Video toggles ──────────────────────────────────────────────────
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

  // ─── End call ────────────────────────────────────────────────────────────
  const handleEndCall = useCallback(() => {
    // Stop recording first (triggers upload in onstop handler)
    stopRecording();
    // Give the recorder a moment to flush before tearing down
    setTimeout(() => {
      if (callRef.current) {
        try { callRef.current.leave(); } catch (_) {}
        try { callRef.current.destroy(); } catch (_) {}
        callRef.current = null;
      }
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      recordingStartedRef.current = false;
      // End the Tavus conversation server-side
      base44.functions.invoke("endTavusInterview", { roomName }).catch(() => {});
      onClose();
    }, 300);
  }, [onClose, roomName, stopRecording]);

  // ─── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopRecording();
      if (callRef.current) {
        try { callRef.current.leave(); } catch (_) {}
        try { callRef.current.destroy(); } catch (_) {}
        callRef.current = null;
      }
    };
  }, [stopRecording]);

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ─── Render ───────────────────────────────────────────────────────────────
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
          {uploadingRecording && (
            <span className="text-xs text-yellow-400 mr-2">Uploading recording…</span>
          )}
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
        {/* Remote video */}
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

        {/* Waiting text */}
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

        {/* Pre-call recording notice — shown before joining */}
        {callState === "idle" && !recordingNoticeDismissed && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85 z-[7] px-6">
            <div className="max-w-md text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <Video className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-white text-lg font-semibold mb-2">This interview will be recorded</h3>
              <p className="text-gray-400 text-sm mb-6">
                By joining this interview, you consent to being recorded. The recording will be saved
                to your applicant profile for review by the hiring team.
              </p>
              <Button
                onClick={() => setRecordingNoticeDismissed(true)}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                I Understand — Continue
              </Button>
            </div>
          </div>
        )}

        {/* Local video PIP */}
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

        {/* Recording indicator — red pulsing dot + timer (always visible during call) */}
        {isRecording && (
          <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 bg-red-600/90 backdrop-blur rounded-full z-[9]">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
            </span>
            <span className="text-white text-xs font-semibold tracking-wide">REC {formatTime(recordingTime)}</span>
          </div>
        )}
        {/* Connected badge — shown when connected but recording hasn't started yet */}
        {callState === "connected" && !isRecording && (
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
            disabled={isLoading || !cameraReady || !recordingNoticeDismissed}
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
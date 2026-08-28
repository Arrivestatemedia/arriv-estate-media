import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, Phone, Video, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import DailyIframe from "@daily-co/daily-js";
import VideoControls from "@/components/sales/VideoControls";
import { savePendingSegment, clearPendingSegment, listPendingSegments } from "@/lib/recordingRecovery";

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
  const recordingStartTimeRef = useRef(0);
  const audioContextRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const recordingStartedRef = useRef(false);
  // Composite canvas refs — used to blend the AI interviewer (full frame) with
  // the candidate's local camera (PIP) so the recording shows the interviewee.
  const compositeCanvasRef = useRef(null);
  const compositeStreamRef = useRef(null);
  const drawLoopRef = useRef(null);
  const recRemoteVideoRef = useRef(null);
  const recLocalVideoRef = useRef(null);
  // Chunked recording: segments upload during the call so no single file is
  // too large and partial recordings survive a call drop.
  const SEGMENT_DURATION_MS = 3 * 60 * 1000; // 3 minutes per segment
  const segmentNumberRef = useRef(0);
  const segmentUrlsRef = useRef([]);
  const segmentTimeoutRef = useRef(null);
  const recordingTracksRef = useRef(null);
  const isEndingRef = useRef(false);
  // Promise that resolves when the final segment upload finishes — used by
  // handleEndCall to wait for the recording to be saved before navigating away.
  // Without this, onClose() unloads the page and the browser cancels the upload.
  const finalUploadPromiseRef = useRef(Promise.resolve());
  const stopResolveRef = useRef(null);
  // Auto-reconnect: if the Daily call drops unexpectedly, we attempt to
  // rejoin (reusing or creating a new Tavus conversation) instead of giving
  // up and ending the interview.
  // Auto-reconnect: if the Daily call drops unexpectedly, we attempt to
  // rejoin (reusing or creating a new Tavus conversation) instead of giving
  // up and ending the interview. Retries are effectively unlimited so a
  // candidate on a flaky connection is never abandoned mid-interview.
  const MAX_RECONNECT_ATTEMPTS = 999;
  const reconnectAttemptsRef = useRef(0);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [callState, setCallState] = useState("idle");
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);

  // Ref mirror of callState so Daily event listeners (registered once) never
  // read a stale closure value. Without this, the recording-start check
  // `callState === "connected"` can fail because the listener captured the
  // state from when handleStartCall was created (e.g. "calling").
  const callStateRef = useRef("idle");
  const updateCallState = useCallback((next) => {
    callStateRef.current = next;
    setCallState(next);
  }, []);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingNoticeDismissed, setRecordingNoticeDismissed] = useState(false);
  const [uploadingRecording, setUploadingRecording] = useState(false);
  const [isSavingRecording, setIsSavingRecording] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

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

  // ─── Recover segments orphaned by a previous tab close ───────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pending = await listPendingSegments(roomName);
        if (cancelled || pending.length === 0) return;
        console.info(`Recovering ${pending.length} interrupted recording segment(s) for ${roomName}`);
        for (const rec of pending) {
          if (cancelled) break;
          await uploadSegment(rec.blob, rec.segmentNum, rec.durationSecs || 0, rec.id);
        }
      } catch (e) { console.warn("Recovery scan failed:", e); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName]);

  // ─── Upload a single segment ──────────────────────────────────────────────
  const uploadSegment = useCallback(async (blob, segmentNum, durationSecs, pendingId) => {
    if (blob.size === 0) { console.warn(`Segment ${segmentNum} was empty`); return; }
    setUploadingRecording(true);
    try {
      const file = new File(
        [blob],
        `ai-interview-${roomName}-part${segmentNum}-${Date.now()}.webm`,
        { type: "video/webm" }
      );
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      segmentUrlsRef.current.push(file_url);
      await base44.functions.invoke("saveInterviewRecording", {
        roomName,
        recordingUrl: file_url,
        durationSeconds: durationSecs,
        fileSize: blob.size,
        segment: segmentNum,
      });
      // Upload succeeded — safe to remove from recovery store
      if (pendingId) await clearPendingSegment(pendingId).catch(() => {});
    } catch (err) {
      console.error(`Segment ${segmentNum} upload failed:`, err);
      // Mark the conference so the admin knows a segment failed
      base44.functions.invoke("saveInterviewRecording", { roomName, failed: true }).catch(() => {});
      // Leave the blob in IndexedDB so it can be retried on next visit
    } finally {
      setUploadingRecording(false);
    }
  }, [roomName]);

  // ─── Start one recording segment ──────────────────────────────────────────
  const startSegment = useCallback((segmentNum) => {
    const tracks = recordingTracksRef.current;
    if (!tracks || tracks.length === 0 || isEndingRef.current) return;

    let mimeType = "video/webm;codecs=vp8,opus";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm";

    let recorder;
    try {
      recorder = new MediaRecorder(new MediaStream(tracks), { mimeType });
    } catch (err) {
      console.error("Failed to create MediaRecorder:", err);
      return;
    }

    const chunks = [];
    const segStartTime = Date.now();
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const segDuration = Math.round((Date.now() - segStartTime) / 1000);
      // Persist to IndexedDB FIRST so the segment survives a tab close
      // during the upload. Cleared after a successful upload.
      let pendingId = null;
      try {
        pendingId = await savePendingSegment({ roomName, segmentNum, blob, durationSecs: segDuration, recordedAt: Date.now() });
      } catch (e) { console.warn("Could not persist segment for recovery:", e); }
      await uploadSegment(blob, segmentNum, segDuration, pendingId);
      // Start the next segment unless the call is ending
      if (!isEndingRef.current) {
        startSegment(segmentNum + 1);
      }
      // Resolve the stop promise so handleEndCall can proceed after the upload
      if (stopResolveRef.current) {
        const resolve = stopResolveRef.current;
        stopResolveRef.current = null;
        resolve();
      }
    };

    recorder.start(1000);
    mediaRecorderRef.current = recorder;
    segmentNumberRef.current = segmentNum;

    // Stop this segment after SEGMENT_DURATION_MS — onstop will start the next one
    if (segmentTimeoutRef.current) clearTimeout(segmentTimeoutRef.current);
    segmentTimeoutRef.current = setTimeout(() => {
      if (recorder.state === "recording") {
        try { recorder.stop(); } catch (_) {}
      }
    }, SEGMENT_DURATION_MS);
  }, [uploadSegment]);

  // ─── Start recording (auto, when remote video arrives) ────────────────────
  const startRecording = useCallback((remoteVideoTrack, remoteAudioTrack) => {
    // Build a composite canvas: AI interviewer full-frame + candidate PIP.
    // This ensures the recording shows the interviewee, not just the AI.
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    compositeCanvasRef.current = canvas;

    // Hidden video elements for drawing to canvas (no mirroring on local)
    const remoteEl = document.createElement("video");
    remoteEl.autoplay = true;
    remoteEl.playsInline = true;
    remoteEl.muted = true;
    remoteEl.srcObject = new MediaStream([remoteVideoTrack]);
    recRemoteVideoRef.current = remoteEl;

    const localEl = document.createElement("video");
    localEl.autoplay = true;
    localEl.playsInline = true;
    localEl.muted = true;
    if (localStreamRef.current) {
      localEl.srcObject = localStreamRef.current;
    }
    recLocalVideoRef.current = localEl;

    // PIP dimensions (bottom-right, ~22% width)
    const pipW = 280;
    const pipH = 210;
    const pipX = canvas.width - pipW - 24;
    const pipY = canvas.height - pipH - 24;

    const draw = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Main: remote (AI interviewer) full-frame, cover-fit
      const rv = recRemoteVideoRef.current;
      if (rv && rv.videoWidth > 0) {
        const vw = rv.videoWidth, vh = rv.videoHeight;
        const scale = Math.max(canvas.width / vw, canvas.height / vh);
        const dw = vw * scale, dh = vh * scale;
        const dx = (canvas.width - dw) / 2, dy = (canvas.height - dh) / 2;
        ctx.drawImage(rv, dx, dy, dw, dh);
      }

      // PIP: local (candidate) with border
      const lv = recLocalVideoRef.current;
      if (lv && lv.videoWidth > 0) {
        const vw = lv.videoWidth, vh = lv.videoHeight;
        const scale = Math.max(pipW / vw, pipH / vh);
        const dw = vw * scale, dh = vh * scale;
        const dx = pipX + (pipW - dw) / 2, dy = pipY + (pipH - dh) / 2;
        // Crop to PIP box
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(pipX, pipY, pipW, pipH, 8);
        ctx.clip();
        ctx.drawImage(lv, dx, dy, dw, dh);
        ctx.restore();
        // Border
        ctx.strokeStyle = "rgba(184,149,106,0.9)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(pipX, pipY, pipW, pipH, 8);
        ctx.stroke();
      }

      drawLoopRef.current = requestAnimationFrame(draw);
    };
    draw();

    const canvasStream = canvas.captureStream(30);
    compositeStreamRef.current = canvasStream;
    const tracks = [canvasStream.getVideoTracks()[0]];

    // Mix remote + local audio
    const audioTracks = [];
    if (remoteAudioTrack) audioTracks.push(remoteAudioTrack);
    const localAudio = localStreamRef.current?.getAudioTracks()[0];
    if (localAudio) audioTracks.push(localAudio);

    if (audioTracks.length > 0) {
      try {
        const actx = new AudioContext();
        audioContextRef.current = actx;
        const destination = actx.createMediaStreamDestination();
        for (const t of audioTracks) {
          try { actx.createMediaStreamSource(new MediaStream([t])).connect(destination); } catch (_) {}
        }
        const mixed = destination.stream.getAudioTracks()[0];
        if (mixed) tracks.push(mixed);
      } catch (_) {}
    }

    if (tracks.length === 0) { console.warn("No media tracks to record"); return; }

    recordingTracksRef.current = tracks;
    isEndingRef.current = false;
    segmentUrlsRef.current = [];
    recordingStartTimeRef.current = Date.now();
    setIsRecording(true);
    setRecordingTime(0);
    recordingTimerRef.current = setInterval(() => {
      setRecordingTime(Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));
    }, 1000);

    startSegment(1);
  }, [startSegment]);

  // ─── Stop recording ──────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    isEndingRef.current = true;
    if (segmentTimeoutRef.current) { clearTimeout(segmentTimeoutRef.current); segmentTimeoutRef.current = null; }
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    if (drawLoopRef.current) { cancelAnimationFrame(drawLoopRef.current); drawLoopRef.current = null; }
    // Stop hidden recording video elements
    for (const ref of [recRemoteVideoRef, recLocalVideoRef]) {
      if (ref.current) {
        try { ref.current.srcObject = null; ref.current.remove(); } catch (_) {}
        ref.current = null;
      }
    }
    if (compositeStreamRef.current) {
      compositeStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
      compositeStreamRef.current = null;
    }
    compositeCanvasRef.current = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      // Create a promise that resolves when onstop finishes the upload.
      // handleEndCall awaits this so the page doesn't unload mid-upload.
      finalUploadPromiseRef.current = new Promise((resolve) => {
        stopResolveRef.current = resolve;
      });
      try { mediaRecorderRef.current.stop(); } catch (_) {}
    }
    // If recorder is already inactive, keep the existing promise — a previous
    // stopRecording call may still be uploading.
    setIsRecording(false);
    setRecordingTime(0);
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch (_) {}
      audioContextRef.current = null;
    }
  }, []);

  // ─── Render remote participant video + start recording ───────────────────
  const renderRemoteVideo = useCallback(() => {
    const call = callRef.current;
    if (!call || !remoteVideoRef.current) return;
    const participants = call.participants();
    const remote = Object.values(participants).find((p) => !p.local);
    if (remote?.videoTrack) {
      // Include BOTH video and audio tracks so the AI's audio plays back
      const streamTracks = [remote.videoTrack];
      if (remote.audioTrack) streamTracks.push(remote.audioTrack);
      const stream = new MediaStream(streamTracks);
      remoteVideoRef.current.srcObject = stream;
      // Ensure the video element is not muted so remote audio plays
      remoteVideoRef.current.muted = false;
      setHasRemoteVideo(true);
      // Auto-start recording when remote video first arrives
      if (!recordingStartedRef.current && callStateRef.current === "connected") {
        recordingStartedRef.current = true;
        startRecording(remote.videoTrack, remote.audioTrack);
      }
    } else {
      if (remoteVideoRef.current.srcObject) {
        remoteVideoRef.current.srcObject = null;
      }
      setHasRemoteVideo(false);
    }
  }, [startRecording]);

  // Auto-reconnect ref — lets setupCallListeners reference attemptReconnect
  // without a circular useCallback dependency.
  const attemptReconnectRef = useRef(null);

  // Wire Daily event listeners on a call object. Shared by the initial join
  // and auto-reconnect so both behave identically.
  const setupCallListeners = useCallback((call) => {
    call.on("participant-joined", renderRemoteVideo);
    call.on("participant-updated", renderRemoteVideo);
    call.on("participant-left", () => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      setHasRemoteVideo(false);
    });
    call.on("left-meeting", () => {
      // Explicit end (user hung up) — isEndingRef is set before leave()
      if (isEndingRef.current) { updateCallState("idle"); return; }
      // Unexpected drop while connected — auto-reconnect instead of giving up.
      // Flush the current recording segment so partial footage survives, then
      // rejoin. The recording restarts when the new remote video arrives.
      if (callStateRef.current === "connected" || callStateRef.current === "reconnecting") {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        setHasRemoteVideo(false);
        recordingStartedRef.current = false;
        stopRecording();
        if (callRef.current) {
          try { callRef.current.destroy(); } catch (_) {}
          callRef.current = null;
        }
        attemptReconnectRef.current?.();
      } else {
        updateCallState("idle");
      }
    });
    call.on("error", (e) => {
      console.error("Daily error:", e);
      setError("Connection error: " + (e?.errorMsg || "Unknown"));
    });
  }, [renderRemoteVideo, stopRecording, updateCallState]);

  // Auto-reconnect after an unexpected call drop. Reuses the active Tavus
  // conversation if still live, otherwise creates a new one — automating the
  // recovery that previously had to be done manually (the incident: first
  // conversation ended mid-question, a new one was created 3 min later,
  // leaving an unrecoverable gap). This resumes the interview within seconds.
  const attemptReconnect = useCallback(async () => {
    if (isEndingRef.current) return;
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setIsReconnecting(false);
      stopRecording();
      base44.functions.invoke("endTavusInterview", { roomName }).catch(() => {});
      updateCallState("ended");
      return;
    }
    reconnectAttemptsRef.current += 1;
    const attempt = reconnectAttemptsRef.current;
    setIsReconnecting(true);
    updateCallState("reconnecting");
    try {
      const res = await base44.functions.invoke("createTavusInterviewConversation", { roomName });
      const data = res?.data || res;
      if (data?.status !== "success" || !data.conversationUrl) {
        throw new Error(data?.error || "Reconnect failed");
      }
      const call = DailyIframe.createCallObject();
      callRef.current = call;
      setupCallListeners(call);
      await call.join({
        url: data.conversationUrl,
        token: data.meetingToken,
        userName: currentUserName || "Guest",
        startVideoOff: false,
        startAudioOff: false,
      });
      updateCallState("connected");
      reconnectAttemptsRef.current = 0;
      setIsReconnecting(false);
      setTimeout(renderRemoteVideo, 500);
    } catch (err) {
      console.error(`Reconnect attempt ${attempt} failed:`, err);
      // Fast backoff capped at 10s so we keep trying aggressively without
      // hammering the server: 1s, 2s, 4s, 8s, 10s, 10s, ...
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      setTimeout(() => attemptReconnectRef.current?.(), delay);
    }
  }, [roomName, currentUserName, renderRemoteVideo, setupCallListeners, stopRecording, updateCallState]);

  // Keep the ref current so setupCallListeners can call the latest reconnect
  useEffect(() => { attemptReconnectRef.current = attemptReconnect; }, [attemptReconnect]);

  // Network online/offline monitor: when the browser reports the network is
  // back online after a drop, fire an immediate reconnect instead of waiting
  // for the next exponential-backoff timer. This covers the common case where
  // the candidate's WiFi flickers or they switch networks mid-interview.
  useEffect(() => {
    const handleOnline = () => {
      if (isEndingRef.current) return;
      if (callStateRef.current === "reconnecting" || callStateRef.current === "idle") {
        console.info("Network back online — triggering immediate reconnect");
        attemptReconnectRef.current?.();
      }
    };
    const handleOffline = () => {
      if (isEndingRef.current) return;
      console.warn("Network went offline during interview");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Tab visibility monitor: on mobile, backgrounding the browser can silently
  // kill the WebRTC connection. When the candidate returns to the tab, check
  // if the call is still alive and reconnect if it dropped while hidden.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden || isEndingRef.current) return;
      // Tab just became visible — give it a moment, then check the call.
      setTimeout(() => {
        const call = callRef.current;
        if (!call && (callStateRef.current === "connected" || callStateRef.current === "reconnecting")) {
          console.info("Tab visible but call object missing — reconnecting");
          attemptReconnectRef.current?.();
        }
      }, 1000);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // ─── Start call ──────────────────────────────────────────────────────────
  const handleStartCall = useCallback(async () => {
    updateCallState("calling");
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

      setupCallListeners(call);

      await call.join({
        url: data.conversationUrl,
        token: data.meetingToken,
        userName: currentUserName || "Guest",
        startVideoOff: false,
        startAudioOff: false,
      });

      updateCallState("connected");
      reconnectAttemptsRef.current = 0;
      setTimeout(renderRemoteVideo, 500);
    } catch (err) {
      console.error("Call start error:", err);
      setError("Connection failed: " + err.message);
      updateCallState("idle");
    } finally {
      setIsLoading(false);
    }
  }, [roomName, currentUserName, renderRemoteVideo, setupCallListeners, updateCallState]);

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
  const handleEndCall = useCallback(async () => {
    // Stop recording first (triggers upload in onstop handler)
    stopRecording();
    // Cancel any in-flight auto-reconnect
    setIsReconnecting(false);
    reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS;
    // Wait for the final segment upload to finish before closing — otherwise
    // onClose() unloads the page and the browser cancels the in-flight upload,
    // so no recording is ever saved.
    setIsSavingRecording(true);
    try { await finalUploadPromiseRef.current; } catch (_) {}
    setIsSavingRecording(false);
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
              callState === "calling"   ? "text-yellow-400" :
              callState === "reconnecting" ? "text-yellow-400" : "text-gray-400"
            }`}>
              {callState === "connected" ? "● Connected" :
               callState === "calling"   ? "● Connecting..." :
               callState === "reconnecting" ? "● Reconnecting..." : "● Preview"}
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

        {/* Call-ended overlay — shown when the meeting ends unexpectedly */}
        {callState === "ended" && !isSavingRecording && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-[10] px-6">
            <div className="max-w-md text-center">
              <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center mx-auto mb-4">
                <Phone className="w-6 h-6 text-gray-300" />
              </div>
              <h3 className="text-white text-lg font-semibold mb-2">Call Ended</h3>
              <p className="text-gray-400 text-sm mb-6">
                The interview connection has ended. Your recording has been saved.
              </p>
              <Button onClick={handleEndCall} className="bg-gray-700 hover:bg-gray-600 text-white">
                Close
              </Button>
            </div>
          </div>
        )}

        {/* Saving recording overlay — shown while the final upload completes */}
        {isSavingRecording && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-[11] px-6">
            <div className="max-w-md text-center">
              <div className="w-12 h-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin mx-auto mb-4" />
              <h3 className="text-white text-lg font-semibold mb-2">Saving recording…</h3>
              <p className="text-gray-400 text-sm">
                Please wait while your interview recording is uploaded. Closing now will lose the recording.
              </p>
            </div>
          </div>
        )}

        {/* Reconnecting overlay — shown during auto-reconnect after a drop */}
        {isReconnecting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 z-[12] px-6">
            <div className="max-w-md text-center">
              <div className="w-12 h-12 rounded-full border-4 border-yellow-500 border-t-transparent animate-spin mx-auto mb-4" />
              <h3 className="text-white text-lg font-semibold mb-2">Reconnecting…</h3>
              <p className="text-gray-400 text-sm">
                The connection dropped. Rejoining the interview automatically — please wait.
              </p>
            </div>
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

        {/* Join Call button — centered on screen when idle */}
        {callState === "idle" && recordingNoticeDismissed && (
          <div className="absolute inset-0 flex items-center justify-center z-[7] pointer-events-none">
            <Button
              onClick={handleStartCall}
              disabled={isLoading || !cameraReady}
              className="bg-green-600 hover:bg-green-700 text-white gap-2 h-12 px-8 text-base pointer-events-auto"
            >
              <Phone className="w-5 h-5" />
              Join Call
            </Button>
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="flex-shrink-0 bg-gray-900 border-t border-gray-700 px-4 py-3 flex items-center gap-3">
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
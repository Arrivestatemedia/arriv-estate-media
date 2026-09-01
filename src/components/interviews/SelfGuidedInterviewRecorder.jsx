import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Camera, Mic, MicOff, Video, VideoOff, RefreshCw, Check, AlertCircle } from "lucide-react";
import {
  PREP_COUNTDOWN_SECONDS,
  QUESTION_RESPONSE_LIMITS,
  DEFAULT_RESPONSE_LIMIT_SECONDS,
  MAX_INTENTIONAL_RERECORDS,
} from "@/lib/asyncInterviewConfig";

/**
 * SelfGuidedInterviewRecorder
 * Candidate-facing self-guided video interview. Each question is displayed,
 * a prep countdown runs, then the candidate records a verbal response.
 * One intentional re-record per question; technical retries are unlimited.
 * Responses are persisted individually (resume support).
 */
export default function SelfGuidedInterviewRecorder({ token, questions, candidateName, savedResponses, onComplete, submitting }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordStartRef = useRef(0);
  const timerRef = useRef(null);

  const [phase, setPhase] = useState("equipment"); // equipment | prep | recording | review | done
  const [camReady, setCamReady] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [setupError, setSetupError] = useState(null);

  // Determine starting question from saved responses (resume support)
  const answeredIds = new Set((savedResponses || []).map(r => r.question_id));
  const startIndex = questions.findIndex((_, i) => !answeredIds.has(`Q${i + 1}`));
  const [qIndex, setQIndex] = useState(Math.max(0, startIndex));

  const [prepCount, setPrepCount] = useState(PREP_COUNTDOWN_SECONDS);
  const [recSeconds, setRecSeconds] = useState(0);
  const [responseLimit, setResponseLimit] = useState(DEFAULT_RESPONSE_LIMIT_SECONDS);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [rerecordUsed, setRerecordUsed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [completedCount, setCompletedCount] = useState(answeredIds.size);

  const question = questions[qIndex];
  const questionId = `Q${qIndex + 1}`;
  const isLast = qIndex === questions.length - 1;

  // ── Camera/mic init ──
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        setCamReady(true);
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        setSetupError("Camera/microphone access failed: " + err.message + ". Please allow camera and microphone permissions and refresh.");
      }
    })();
    return () => {
      mounted = false;
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Set response limit for current question
  useEffect(() => {
    setResponseLimit(QUESTION_RESPONSE_LIMITS[questionId] || DEFAULT_RESPONSE_LIMIT_SECONDS);
  }, [questionId]);

  // Re-attach the live camera stream to the <video> element whenever the
  // phase changes — each phase renders its own <video> element, so the
  // srcObject set during equipment check is lost on re-mount.
  useEffect(() => {
    if (streamRef.current && videoRef.current && (phase === "equipment" || phase === "prep" || phase === "recording")) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [phase, camReady]);

  // ── Toggle mic/video ──
  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = next; });
  };
  const toggleVideo = () => {
    const next = !videoOn;
    setVideoOn(next);
    streamRef.current?.getVideoTracks().forEach(t => { t.enabled = next; });
  };

  // ── Prep countdown ──
  const startPrep = () => {
    setPhase("prep");
    setPrepCount(PREP_COUNTDOWN_SECONDS);
  };
  useEffect(() => {
    if (phase !== "prep") return;
    if (prepCount <= 0) { startRecording(); return; }
    const t = setTimeout(() => setPrepCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, prepCount]);

  // ── Recording ──
  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    let mimeType = "video/webm;codecs=vp8,opus";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm";
    try {
      const rec = new MediaRecorder(streamRef.current, { mimeType });
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(url);
        setRecordedDuration(Math.round((Date.now() - recordStartRef.current) / 1000));
        setPhase("review");
      };
      rec.start(500);
      recorderRef.current = rec;
      recordStartRef.current = Date.now();
      setRecSeconds(0);
      setPhase("recording");
      timerRef.current = setInterval(() => {
        setRecSeconds(Math.floor((Date.now() - recordStartRef.current) / 1000));
      }, 250);
    } catch (err) {
      setSaveError("Failed to start recording: " + err.message);
    }
  }, []);

  // Auto-stop at limit
  useEffect(() => {
    if (phase === "recording" && recSeconds >= responseLimit) {
      finishAnswer();
    }
  }, [phase, recSeconds, responseLimit]);

  const finishAnswer = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // ── Save response ──
  const handleUseResponse = async () => {
    if (!recordedBlob) return;
    setSaving(true);
    setSaveError(null);
    try {
      const file = new File([recordedBlob], `interview-${questionId}-${Date.now()}.webm`, { type: "video/webm" });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.functions.invoke("saveSelfGuidedResponse", {
        token,
        questionId,
        questionIndex: qIndex,
        questionText: question.question,
        recordingUrl: file_url,
        durationSeconds: recordedDuration,
        fileSize: recordedBlob.size,
        isRerecord: rerecordUsed,
      });
      setCompletedCount(c => c + 1);
      // Clean up local recording
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      setRecordedBlob(null);
      setRecordedUrl(null);
      setRerecordUsed(false);

      if (isLast) {
        onComplete();
      } else {
        setQIndex(i => i + 1);
        setPhase("prep");
        setPrepCount(PREP_COUNTDOWN_SECONDS);
      }
    } catch (err) {
      setSaveError("Failed to save response: " + err.message + ". Please try again — this is a technical retry and does not use your re-record.");
    } finally {
      setSaving(false);
    }
  };

  // ── Re-record ──
  const handleRerecord = () => {
    if (rerecordUsed) return; // only one intentional re-record
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRerecordUsed(true);
    startPrep();
  };

  // ── Technical retry (failed recording/upload — does NOT consume re-record) ──
  const handleTechnicalRetry = () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setSaveError(null);
    startPrep();
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ── Equipment check phase ──
  if (phase === "equipment") {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex flex-col items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-2xl border border-[#B8956A]/20 p-6">
          <h2 className="text-xl font-semibold text-[#1A1A1A] mb-2">Equipment Check</h2>
          <p className="text-sm text-[#1A1A1A]/60 mb-4">Let's make sure your camera and microphone are working before you begin.</p>

          <div className="relative rounded-xl overflow-hidden bg-black aspect-video mb-4">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
            {!camReady && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" />
              </div>
            )}
          </div>

          {setupError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{setupError}</p>
            </div>
          )}

          <div className="flex gap-2 mb-4">
            <button onClick={toggleMic} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[#B8956A]/20 text-sm font-medium text-[#1A1A1A] hover:bg-[#FFFBF5]">
              {micOn ? <Mic className="w-4 h-4 text-green-600" /> : <MicOff className="w-4 h-4 text-red-500" />}
              {micOn ? "Mic On" : "Mic Off"}
            </button>
            <button onClick={toggleVideo} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[#B8956A]/20 text-sm font-medium text-[#1A1A1A] hover:bg-[#FFFBF5]">
              {videoOn ? <Video className="w-4 h-4 text-green-600" /> : <VideoOff className="w-4 h-4 text-red-500" />}
              {videoOn ? "Camera On" : "Camera Off"}
            </button>
          </div>

          <div className="bg-[#FFFBF5] border border-[#B8956A]/15 rounded-lg p-3 mb-4">
            <p className="text-xs text-[#1A1A1A]/60 leading-relaxed">
              <strong>Recording disclosure:</strong> Your responses will be recorded and reviewed by our recruiting team.
              You'll have one chance to re-record each answer. Technical failures (camera, mic, upload) do not use your re-record.
            </p>
          </div>

          <button
            onClick={startPrep}
            disabled={!camReady || !!setupError}
            className="w-full py-3.5 rounded-lg bg-[#B8956A] text-[#1A1A1A] font-semibold hover:bg-[#A68559] transition-colors disabled:opacity-50"
          >
            Start Interview
          </button>
          {completedCount > 0 && (
            <p className="text-center text-xs text-[#B8956A] mt-3">
              Resuming — {completedCount} of {questions.length} questions completed
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Prep countdown ──
  if (phase === "prep") {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex flex-col items-center justify-center p-4">
        <div className="max-w-lg w-full">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#B8956A] text-center mb-2">
            Question {qIndex + 1} of {questions.length}
          </p>
          <div className="bg-white rounded-2xl border border-[#B8956A]/20 p-6 mb-6">
            <p className="text-lg text-[#1A1A1A] leading-relaxed text-center">{question.question}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-[#1A1A1A]/50 mb-2">Prepare your answer — recording starts in</p>
            <div className="text-6xl font-bold text-[#B8956A] mb-4">{prepCount}</div>
            <div className="relative rounded-xl overflow-hidden bg-black aspect-video max-w-sm mx-auto">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Recording ──
  if (phase === "recording") {
    const remaining = responseLimit - recSeconds;
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="max-w-lg w-full">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <span className="text-white font-semibold tracking-wide">REC</span>
            <span className="text-white/70 text-sm ml-2">{formatTime(recSeconds)}</span>
          </div>
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video mb-4">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
          </div>
          <div className="text-center">
            <p className="text-white/70 text-sm mb-1">{formatTime(remaining)} remaining</p>
            <div className="w-full max-w-xs mx-auto bg-white/10 rounded-full h-1.5 mb-6">
              <div className="bg-[#B8956A] h-1.5 rounded-full transition-all" style={{ width: `${(recSeconds / responseLimit) * 100}%` }} />
            </div>
            <button
              onClick={finishAnswer}
              className="px-8 py-3 rounded-lg bg-[#B8956A] text-[#1A1A1A] font-semibold hover:bg-[#A68559] transition-colors"
            >
              Finish Answer
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Review ──
  if (phase === "review") {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex flex-col items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-2xl border border-[#B8956A]/20 p-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#B8956A] text-center mb-2">
            Question {qIndex + 1} of {questions.length}
          </p>
          <p className="text-sm text-[#1A1A1A]/60 text-center mb-4">Review your response</p>

          <div className="relative rounded-xl overflow-hidden bg-black aspect-video mb-4">
            {recordedUrl && <video src={recordedUrl} controls className="w-full h-full object-contain" />}
          </div>
          <p className="text-xs text-center text-[#1A1A1A]/50 mb-4">Recorded: {formatTime(recordedDuration)}</p>

          {saveError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-700">{saveError}</p>
                <button onClick={handleTechnicalRetry} className="text-xs text-red-600 font-medium mt-1 underline">
                  Technical retry (does not use re-record)
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <button
              onClick={handleUseResponse}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg bg-[#B8956A] text-[#1A1A1A] font-semibold hover:bg-[#A68559] transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              {saving ? "Saving..." : isLast ? "Submit Interview" : "Use This Response"}
            </button>
            {!rerecordUsed && !saveError && (
              <button
                onClick={handleRerecord}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-[#B8956A]/30 text-[#1A1A1A]/70 font-medium hover:bg-[#FFFBF5] transition-colors disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" />
                Re-record {rerecordUsed ? "(used)" : "(1 allowed)"}
              </button>
            )}
            {rerecordUsed && (
              <p className="text-xs text-center text-[#1A1A1A]/40">Re-record used for this question</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Submitting ──
  if (submitting) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#B8956A] mx-auto mb-4" />
          <p className="text-[#1A1A1A]/70">Submitting your interview...</p>
        </div>
      </div>
    );
  }

  return null;
}
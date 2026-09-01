import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, AlertCircle, Video, Brain, User, Clock, ShieldCheck, Camera, Mic } from "lucide-react";
import SelfGuidedInterviewRecorder from "@/components/interviews/SelfGuidedInterviewRecorder";
import TavusInterviewPanel from "@/components/interviews/TavusInterviewPanel";
import { ROUND1_ALL_QUESTIONS } from "@/lib/round1Questions";
import { ESTIMATED_DURATION_MINUTES } from "@/lib/asyncInterviewConfig";

export default function AsyncInterview() {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);
  const [savedResponses, setSavedResponses] = useState([]);
  const [phase, setPhase] = useState("landing"); // landing | choice | equipment | conversational | selfguided | complete | expired
  const [selectedFormat, setSelectedFormat] = useState(null);
  const [submittingFormat, setSubmittingFormat] = useState(false);
  const [conferenceId, setConferenceId] = useState(null);
  const [roomName, setRoomName] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (!t) { setError("No interview token provided"); setLoading(false); return; }
    setToken(t);
    loadSession(t);
  }, []);

  const loadSession = async (t) => {
    try {
      const res = await base44.functions.invoke("getInterviewSession", { token: t });
      const data = res?.data ?? res;
      if (data?.status === "expired") {
        setPhase("expired");
        setSession(data);
        setLoading(false);
        return;
      }
      if (data?.status === "not_found" || data?.error) {
        setError(data?.error || "Interview not found");
        setLoading(false);
        return;
      }
      setSession(data.session);
      setSavedResponses(data.saved_responses || []);
      // If already completed, show complete screen
      if (data.session?.status === "COMPLETED") {
        setPhase("complete");
      } else if (data.session?.delivery_mode === "SELF_GUIDED_VIDEO" && data.session?.status !== "INVITED" && data.session?.status !== "OPENED") {
        setSelectedFormat("SELF_GUIDED_VIDEO");
        setPhase("selfguided");
      } else if (data.session?.delivery_mode === "CONVERSATIONAL_AI" && data.session?.conference_id) {
        setSelectedFormat("CONVERSATIONAL_AI");
        setConferenceId(data.session.conference_id);
        setPhase("conversational");
      } else {
        setPhase("landing");
      }
      setLoading(false);
    } catch (err) {
      setError(err.message || "Failed to load interview");
      setLoading(false);
    }
  };

  const handleChooseFormat = async (mode) => {
    setSubmittingFormat(true);
    try {
      const res = await base44.functions.invoke("selectInterviewFormat", { token, deliveryMode: mode });
      const data = res?.data ?? res;
      if (data?.error) throw new Error(data.error);
      setSelectedFormat(mode);
      if (mode === "CONVERSATIONAL_AI") {
        setConferenceId(data.conference_id);
        setRoomName(data.room_name);
        setPhase("conversational");
      } else {
        setPhase("selfguided");
      }
    } catch (err) {
      setError(err.message || "Failed to select format");
    } finally {
      setSubmittingFormat(false);
    }
  };

  const handleSelfGuidedComplete = async () => {
    setPhase("submitting");
    try {
      await base44.functions.invoke("completeSelfGuidedInterview", { token });
      setPhase("complete");
    } catch (err) {
      setError(err.message || "Failed to submit interview");
      setPhase("selfguided");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBF5]">
        <Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBF5] p-4">
        <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200 max-w-md">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  // ── Expired ──
  if (phase === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBF5] p-4">
        <div className="max-w-md text-center bg-white rounded-2xl border border-[#B8956A]/20 p-8">
          <Clock className="w-12 h-12 text-[#B8956A] mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-[#1A1A1A] mb-2">Interview Invitation Expired</h1>
          <p className="text-[#1A1A1A]/60">Your 48-hour interview window has passed. Please contact Arriv Estate Media recruiting if you believe this is an error.</p>
        </div>
      </div>
    );
  }

  // ── Complete ──
  if (phase === "complete") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBF5] p-4">
        <div className="max-w-md text-center bg-white rounded-2xl border border-[#B8956A]/20 p-8">
          <ShieldCheck className="w-12 h-12 text-[#B8956A] mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-[#1A1A1A] mb-3">Interview Complete</h1>
          <p className="text-[#1A1A1A]/70 leading-relaxed">
            Thank you for completing your first-round interview with Arriv Estate Media.
            Our recruiting team will review your interview. Candidates selected to move forward
            will be contacted regarding the next step.
          </p>
        </div>
      </div>
    );
  }

  // ── Conversational (Ashley) ──
  if (phase === "conversational" && roomName) {
    return (
      <TavusInterviewPanel
        roomName={roomName}
        currentUserName={session?.candidate_name || "Candidate"}
        recipientName="Ashley — Arriv Interview"
        onClose={() => setPhase("complete")}
      />
    );
  }

  // ── Self-Guided ──
  if (phase === "selfguided" || phase === "submitting") {
    return (
      <SelfGuidedInterviewRecorder
        token={token}
        questions={ROUND1_ALL_QUESTIONS}
        candidateName={session?.candidate_name}
        savedResponses={savedResponses}
        onComplete={handleSelfGuidedComplete}
        submitting={phase === "submitting"}
      />
    );
  }

  // ── Landing / Format Choice ──
  const firstName = (session?.candidate_name || "").split(" ")[0] || "there";
  const deadlineDisplay = session?.expires_at
    ? new Date(session.expires_at).toLocaleString("en-US", {
        weekday: "long", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short",
        timeZone: "America/New_York",
      })
    : "";

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      {/* Header */}
      <div className="bg-[#1A1A1A] py-6 px-4 text-center">
        <img
          src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png"
          alt="Arriv Estate Media"
          className="h-10 mx-auto"
        />
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {phase === "landing" ? (
          <div className="bg-white rounded-2xl border border-[#B8956A]/20 p-8 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wider text-[#B8956A] mb-2">First-Round Interview</p>
            <h1 className="text-2xl font-semibold text-[#1A1A1A] mb-1">Hi {firstName},</h1>
            <h2 className="text-lg text-[#1A1A1A]/70 mb-6">{session?.position_title} — Arriv Estate Media</h2>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 text-[#1A1A1A]/70">
                <Clock className="w-5 h-5 text-[#B8956A] shrink-0" />
                <span>Approximately {ESTIMATED_DURATION_MINUTES} minutes</span>
              </div>
              <div className="flex items-start gap-3 text-[#1A1A1A]/70">
                <ShieldCheck className="w-5 h-5 text-[#B8956A] shrink-0 mt-0.5" />
                <div>
                  <p>Complete by:</p>
                  <p className="font-semibold text-[#B8956A]">{deadlineDisplay}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[#1A1A1A]/70">
                <Camera className="w-5 h-5 text-[#B8956A] shrink-0" />
                <span>Camera and microphone required</span>
              </div>
            </div>

            <div className="bg-[#FFFBF5] border border-[#B8956A]/15 rounded-lg p-4 mb-6">
              <p className="text-sm text-[#1A1A1A]/70 leading-relaxed">
                You'll be able to choose between two interview experiences. Both contain the same
                interview questions and are evaluated using the same criteria. Your choice will
                not affect your candidacy.
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
              <p className="text-xs text-amber-800">
                <strong>Recording disclosure:</strong> This interview will be recorded for review
                by our recruiting team. One format involves an AI-powered virtual interviewer.
              </p>
            </div>

            <button
              onClick={() => setPhase("choice")}
              className="w-full py-3.5 rounded-lg bg-[#B8956A] text-[#1A1A1A] font-semibold hover:bg-[#A68559] transition-colors"
            >
              Begin Interview
            </button>
          </div>
        ) : phase === "choice" ? (
          <div>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-semibold text-[#1A1A1A] mb-2">Choose Your Interview Experience</h1>
              <p className="text-[#1A1A1A]/60 max-w-lg mx-auto">
                Choose whichever interview experience you prefer. Both formats contain the same
                interview questions and are evaluated using the same criteria. Your choice will
                not affect your candidacy.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Conversational */}
              <button
                onClick={() => handleChooseFormat("CONVERSATIONAL_AI")}
                disabled={submittingFormat}
                className="text-left bg-white rounded-2xl border border-[#B8956A]/20 p-6 hover:border-[#B8956A] hover:shadow-md transition-all disabled:opacity-50"
              >
                <div className="w-12 h-12 rounded-full bg-[#B8956A]/10 flex items-center justify-center mb-4">
                  <Brain className="w-6 h-6 text-[#B8956A]" />
                </div>
                <h3 className="text-lg font-semibold text-[#1A1A1A] mb-2">Conversational Interview</h3>
                <p className="text-sm text-[#1A1A1A]/60 leading-relaxed mb-3">
                  Have a conversational video interview with Ashley, our AI-powered virtual
                  recruiting assistant. Ashley will guide you through each interview question
                  and listen to your responses.
                </p>
                <p className="text-xs text-[#B8956A] font-medium">~{ESTIMATED_DURATION_MINUTES} minutes</p>
              </button>

              {/* Self-Guided */}
              <button
                onClick={() => handleChooseFormat("SELF_GUIDED_VIDEO")}
                disabled={submittingFormat}
                className="text-left bg-white rounded-2xl border border-[#B8956A]/20 p-6 hover:border-[#B8956A] hover:shadow-md transition-all disabled:opacity-50"
              >
                <div className="w-12 h-12 rounded-full bg-[#B8956A]/10 flex items-center justify-center mb-4">
                  <Video className="w-6 h-6 text-[#B8956A]" />
                </div>
                <h3 className="text-lg font-semibold text-[#1A1A1A] mb-2">Self-Guided Video Interview</h3>
                <p className="text-sm text-[#1A1A1A]/60 leading-relaxed mb-3">
                  Complete the interview independently. Each question will appear on screen,
                  you'll have a brief moment to prepare, and then you'll record your response.
                </p>
                <p className="text-xs text-[#B8956A] font-medium">~{ESTIMATED_DURATION_MINUTES} minutes</p>
              </button>
            </div>

            {submittingFormat && (
              <div className="text-center mt-6">
                <Loader2 className="w-6 h-6 animate-spin text-[#B8956A] mx-auto" />
              </div>
            )}

            <button
              onClick={() => setPhase("landing")}
              disabled={submittingFormat}
              className="mt-6 text-sm text-[#1A1A1A]/50 hover:text-[#1A1A1A] mx-auto block"
            >
              ← Back
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
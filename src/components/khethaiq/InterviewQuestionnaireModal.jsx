import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";
import ScorecardEditor from "@/components/hireiq/ScorecardEditor";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED_DARK = "rgba(26,26,26,0.6)";

export default function InterviewQuestionnaireModal({ conference, onClose, onCompleted }) {
  const [loading, setLoading] = useState(true);
  const [candidate, setCandidate] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        // The first participant is the applicant (JobApplication id)
        const participant = conference?.participants?.[0];
        if (!participant?.id) {
          setError("No applicant linked to this interview.");
          setLoading(false);
          return;
        }

        // Load the JobApplication to get the KhethaIQ links
        const app = await base44.entities.JobApplication.get(participant.id);
        if (!app) {
          setError("Application not found.");
          setLoading(false);
          return;
        }

        if (!app.hire_candidate_id || !app.job_id) {
          setError("This applicant hasn't been synced to Khetha IQ yet. Run a sync from the Jobs or Applications tab first.");
          setLoading(false);
          return;
        }

        // Load the HireCandidate and HireJob in parallel
        const [cand, jb] = await Promise.all([
          base44.entities.HireCandidate.get(app.hire_candidate_id),
          base44.entities.HireJob.get(app.job_id),
        ]);
        setCandidate(cand);
        setJob(jb);
      } catch (err) {
        setError(err?.message || "Failed to load interview data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [conference]);

  const handleComplete = async (result) => {
    try {
      await base44.entities.HireInterview.create({
        candidate_id: candidate.id,
        job_id: job.id,
        interviewer_name: result.interviewer_name,
        interview_date: result.interview_date,
        interview_type: "live",
        questions: result.questions,
        ai_summary: result.ai_summary,
        overall_score: result.overall_score,
        status: "completed",
      });
      if (onCompleted) onCompleted();
      onClose();
    } catch (err) {
      setError(err?.message || "Failed to save scorecard.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" style={{ backdropFilter: "blur(4px)" }}>
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" style={{ border: "1px solid rgba(184,149,106,0.2)" }}>
        <div className="flex items-center justify-between px-5 py-4 sticky top-0 bg-white border-b" style={{ borderColor: "rgba(184,149,106,0.15)" }}>
          <h2 className="text-lg font-semibold" style={{ color: TEXT_DARK }}>Interview Questionnaire / Scorecard</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>
              <Button variant="outline" onClick={onClose} className="mt-4">Close</Button>
            </div>
          ) : candidate && job ? (
            <ScorecardEditor
              candidate={candidate}
              job={job}
              roleProfile={job?.role_success_profile}
              onComplete={handleComplete}
              onCancel={onClose}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
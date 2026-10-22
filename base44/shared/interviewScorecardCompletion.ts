// base44/shared/interviewScorecardCompletion.ts
// One pipeline for "a first-round interview just finished": attach the round-1
// scorecard to the candidate it belongs to, recalculate the AI success score
// with that scorecard included, and alert the admin.
// Server-side only (uses Deno secrets and Brevo).

import { evaluateCandidateWithInterviews } from "./hireiqEvaluation.ts";
import { sendBrevoEmail } from "./brevoClient.ts";

const getRecord = (res: any) => res?.data ?? res;

/**
 * Finds the HireCandidate an interview session belongs to.
 * The application's hire_candidate_id link is authoritative; the candidate
 * email is the fallback for applications synced before the link existed.
 */
export async function resolveInterviewCandidate(base44: any, { applicationId, candidateEmail }: any) {
  let application: any = null;
  if (applicationId) {
    try { application = getRecord(await base44.asServiceRole.entities.JobApplication.get(applicationId)); } catch (_) {}
  }

  let candidate: any = null;
  if (application?.hire_candidate_id) {
    try { candidate = getRecord(await base44.asServiceRole.entities.HireCandidate.get(application.hire_candidate_id)); } catch (_) {}
  }

  const email = candidateEmail || application?.email;
  if (!candidate && email) {
    try {
      const list = getRecord(await base44.asServiceRole.entities.HireCandidate.filter({ email }, "-created_date", 5));
      candidate = Array.isArray(list) ? list[0] : null;
    } catch (_) {}
  }

  return { application, candidate };
}

/**
 * Attaches the round-1 scorecard to the candidate so it shows in ranking,
 * on the candidate profile, and in the success score inputs.
 */
export async function attachRound1Scorecard(base44: any, candidate: any, scorecard: any) {
  if (!candidate?.id || !scorecard) return null;
  const updated = getRecord(await base44.asServiceRole.entities.HireCandidate.update(candidate.id, {
    round1_scorecard: scorecard,
    status: "interviewing",
  }));
  return { ...candidate, ...(updated || {}), round1_scorecard: scorecard, status: "interviewing" };
}

/**
 * Recalculates the success score with the newly attached scorecard included.
 * Returns the stored evaluation, or null when the evaluation could not run.
 */
export async function recalculateSuccessScore(base44: any, candidate: any) {
  if (!candidate?.id || !candidate.round1_scorecard) return null;

  let job: any = null;
  if (candidate.job_id) {
    try { job = getRecord(await base44.asServiceRole.entities.HireJob.get(candidate.job_id)); } catch (_) {}
  }

  const interviews = [{ ...candidate.round1_scorecard, type: "Round 1 — General Competency" }];
  if (candidate.round2_scorecard) interviews.push({ ...candidate.round2_scorecard, type: "Round 2 — Role-Specific" });

  const evaluation = await evaluateCandidateWithInterviews(
    base44.asServiceRole, candidate, job, job?.role_success_profile, interviews, candidate.resume_analysis,
  );
  if (!evaluation) return null;

  await base44.asServiceRole.entities.HireCandidate.update(candidate.id, { evaluation });
  return evaluation;
}

/** Emails the admin that an interview finished, with the recalculated score. */
export async function notifyAdminOfInterviewCompletion(_base44: any, {
  candidateName, positionTitle, source, reviewRequired, scorecard, evaluation,
}: any) {
  const adminEmail = Deno.env.get("ADMIN_EMAIL");
  if (!adminEmail) {
    console.warn("ADMIN_EMAIL not configured — interview completion notification skipped");
    return false;
  }

  const domain = Deno.env.get("BASE44_APP_DOMAIN") || "arrivestatemedia.base44.app";
  const appUrl = domain.startsWith("http") ? domain : `https://${domain}`;
  const successScore = evaluation?.estimated_success_score;
  const completionTime = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });

  const lines = [
    `${candidateName || "A candidate"} completed a ${source || "first-round"} interview.`,
    "",
    `Candidate: ${candidateName || "Unknown"}`,
    positionTitle ? `Position: ${positionTitle}` : "",
    `Completed: ${completionTime} ET`,
    scorecard?.total_score != null ? `Round 1 scorecard: ${scorecard.total_score}/100` : "",
    successScore != null ? `Success score recalculated: ${Math.round(successScore)}` : "",
    evaluation?.proceed_recommendation ? `Recommendation: ${evaluation.proceed_recommendation}` : "",
    reviewRequired ? "Flagged for review: the scorecard evidence was incomplete or low confidence." : "",
    "",
    `Review the candidate in Khetha IQ: ${appUrl}/KhethaIQ`,
  ].filter(line => line !== "");

  await sendBrevoEmail({
    to: adminEmail,
    subject: `Interview completed: ${candidateName || "Candidate"}`,
    textContent: lines.join("\n"),
  });
  return true;
}
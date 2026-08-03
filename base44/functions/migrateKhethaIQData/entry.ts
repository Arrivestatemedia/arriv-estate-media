// migrateKhethaIQData/entry.ts
// Admin-only function to migrate existing local KhethaIQ recruiting records
// (HireJob, HireCandidate, HireInterview) to the main KhethaIQ application.
// Sends data to the KHETHAIQ_IMPORT_ENDPOINT with the shared API key.
//
// The main KhethaIQ app creates its own records and uses shared_person_id
// for cross-system candidate linking. Local records are preserved (not
// deleted) so the old and new experiences can run in parallel during
// validation.
//
// Supports dry_run mode to preview counts without sending.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";
import { generateSharedPersonId } from "../../shared/hireHandoffShared.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const importEndpoint = secrets.get("KHETHAIQ_IMPORT_ENDPOINT");
    const apiKey = secrets.get("KHETHAIQ_API_KEY");

    if (!importEndpoint) {
      return Response.json({ error: "KHETHAIQ_IMPORT_ENDPOINT is not set" }, { status: 400 });
    }

    let body: any = {};
    try { body = await req.json(); } catch (_) {}
    const dryRun = body.dry_run === true;

    // Collect local records
    const jobsRes = await base44.asServiceRole.entities.HireJob.list(null, 500);
    const jobs = jobsRes?.data ?? jobsRes ?? [];

    const candidatesRes = await base44.asServiceRole.entities.HireCandidate.list(null, 500);
    const candidates = candidatesRes?.data ?? candidatesRes ?? [];

    const interviewsRes = await base44.asServiceRole.entities.HireInterview.list(null, 500);
    const interviews = interviewsRes?.data ?? interviewsRes ?? [];

    if (dryRun) {
      return Response.json({
        dry_run: true,
        jobs: jobs.length,
        candidates: candidates.length,
        interviews: interviews.length,
      });
    }

    // Build migration payload
    const migrationPayload = {
      calling_application: "ARRIV_ESTATE_MEDIA",
      tenant_id: "arriv_estate_media",
      jobs: jobs.map(j => ({
        local_id: j.id,
        title: j.title,
        department: j.department,
        description: j.description,
        responsibilities: j.responsibilities,
        required_qualifications: j.required_qualifications,
        preferred_qualifications: j.preferred_qualifications,
        skills: j.skills,
        experience_requirements: j.experience_requirements,
        compensation: j.compensation,
        work_schedule: j.work_schedule,
        source_type: j.source_type,
        source_url: j.source_url,
        source_application_position: j.source_application_position,
        role_success_profile: j.role_success_profile,
        status: j.status,
      })),
      candidates: candidates.map(c => ({
        local_id: c.id,
        job_local_id: c.job_id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        target_role: c.target_role,
        shared_person_id: c.shared_person_id || generateSharedPersonId(c.email || c.name),
        resume_text: c.resume_text,
        resume_analysis: c.resume_analysis,
        evaluation: c.evaluation,
        status: c.status,
        decision: c.decision,
        interview_notes: c.interview_notes,
        round1_scorecard: c.round1_scorecard,
        round2_scorecard: c.round2_scorecard,
        handoff_status: c.handoff_status,
        estate_media_specialist_id: c.estate_media_specialist_id,
        estate_employee_id: c.estate_employee_id,
      })),
      interviews: interviews.map(iv => ({
        local_id: iv.id,
        candidate_local_id: iv.candidate_id,
        job_local_id: iv.job_id,
        interviewer_name: iv.interviewer_name,
        interview_date: iv.interview_date,
        interview_type: iv.interview_type,
        questions: iv.questions,
        ai_summary: iv.ai_summary,
        overall_score: iv.overall_score,
        status: iv.status,
      })),
    };

    // Send to main KhethaIQ app import endpoint
    const response = await fetch(importEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-KhethaIQ-API-Key": apiKey || "",
        "X-Calling-Application": "ARRIV_ESTATE_MEDIA",
      },
      body: JSON.stringify(migrationPayload),
    });

    if (!response.ok) {
      const errText = await response.text();
      return Response.json({
        error: "Import endpoint returned an error",
        status: response.status,
        details: errText.slice(0, 500),
      }, { status: 502 });
    }

    const result = await response.json();

    return Response.json({
      success: true,
      sent: {
        jobs: jobs.length,
        candidates: candidates.length,
        interviews: interviews.length,
      },
      import_response: result,
    });
  } catch (error) {
    console.error("migrateKhethaIQData error:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
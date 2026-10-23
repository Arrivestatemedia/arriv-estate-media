// completeCareersProfile/entry.ts
// Submits a personalized Careers Profile.
//
// This does NOT create a second application: it updates the same JobApplication
// record the résumé import created, preserves the imported résumé and source
// attribution, and then continues the existing recruiting workflow:
//   1. the existing Khetha IQ candidate is refreshed (same sync function),
//   2. the existing admin new-application SMS is sent — once, and only after
//      the applicant actually submits.
//
// Repeat submissions, refreshes and retries are refused: an already completed
// profile returns the same confirmation and never notifies again.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { waitUntil } from 'base44:runtime';
import { sendAdminNewApplicationSms } from '../../shared/applicationAdminSms.ts';
import { loadApplicantByToken, linkStateFor } from '../../shared/careersProfileLink.ts';

const clean = (value: any): string => (typeof value === 'string' ? value.trim() : '');
const asList = (value: any): string[] =>
  Array.isArray(value) ? value.map((v) => clean(v)).filter(Boolean) : [];

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body: any = await req.json().catch(() => ({}));
    const token = clean(body.token);
    const fields = body.fields || {};

    const record: any = await loadApplicantByToken(base44, token);
    if (!record) return Response.json({ error_code: 'invalid_link' }, { status: 404 });

    const state = linkStateFor(record);
    if (state === 'revoked' || state === 'expired') {
      return Response.json({ error_code: state }, { status: 410 });
    }

    const firstName = (record.full_name || '').split(' ')[0] || 'there';

    // Idempotent: a completed profile is never written or notified again.
    if (record.profile_completion_status === 'completed') {
      return Response.json({ success: true, already_completed: true, first_name: firstName });
    }

    // ── Validation ────────────────────────────────────────────────────────
    const errors: Record<string, string> = {};
    const fullName = clean(fields.full_name);
    const email = clean(fields.email).toLowerCase();
    const phone = clean(fields.phone);
    const address = clean(fields.address);
    const dob = clean(fields.dob);
    const lastRelatedJob = clean(fields.last_related_job);
    const whyGoodFit = clean(fields.why_good_fit);
    const signature = clean(fields.signature);

    if (!fullName) errors.full_name = 'Your full name is required.';
    if (!email || !email.includes('@')) errors.email = 'A valid email address is required.';
    if (!phone) errors.phone = 'A phone number is required.';
    if (!address) errors.address = 'Your residential address is required.';
    if (!lastRelatedJob) errors.last_related_job = 'Please describe your most recent related experience.';
    if (!whyGoodFit) errors.why_good_fit = 'Please tell us why you are a good fit.';
    if (!fields.eeoc_agreed) errors.eeoc_agreed = 'Please acknowledge the Equal Employment Opportunity notice.';
    if (!signature) errors.signature = 'Your electronic signature is required.';

    if (Object.keys(errors).length) {
      return Response.json({ error_code: 'validation', field_errors: errors }, { status: 400 });
    }

    // ── Save onto the SAME applicant record ───────────────────────────────
    const replacedResumeUrl = clean(fields.resume_url);
    const resumeReplaced = !!replacedResumeUrl && replacedResumeUrl !== record.portfolio_link;

    const extractInput = body.resume_extract;
    const resumeExtract = extractInput
      ? {
          summary: clean(extractInput.summary),
          work_history: asList(extractInput.work_history),
          education: asList(extractInput.education),
          certifications: asList(extractInput.certifications),
          skills: asList(extractInput.skills),
          uncertain_fields: asList(extractInput.uncertain_fields),
          extracted_at: record.resume_extract?.extracted_at || new Date().toISOString(),
        }
      : record.resume_extract || {};

    const now = new Date().toISOString();
    const update: any = {
      full_name: fullName,
      email,
      phone,
      address,
      dob,
      linkedin: clean(fields.linkedin),
      last_related_job: lastRelatedJob,
      why_good_fit: whyGoodFit,
      race: clean(fields.race),
      eeoc_agreed: true,
      signature,
      resume_extract: resumeExtract,
      profile_completion_status: 'completed',
      profile_completed_at: now,
      application_submitted_at: now,
      application_started_at: record.application_started_at || now,
      application_source: 'indeed',
      status: record.status || 'received',
      portal_viewed_at: now,
      portal_view_count: (record.portal_view_count || 0) + 1,
    };

    if (replacedResumeUrl) {
      update.portfolio_link = replacedResumeUrl;
      update.documents = [replacedResumeUrl];
      update.resume_file_name = clean(fields.resume_file_name) || record.resume_file_name || '';
    }

    await base44.asServiceRole.entities.JobApplication.update(record.id, update);

    // ── Existing Khetha IQ pipeline, on the same record ───────────────────
    waitUntil(
      base44.asServiceRole.functions
        .invoke('syncApplicationToKhethaIQ', { application_id: record.id })
        .catch(() => {}),
    );

    // If the applicant replaced their résumé, re-run the existing evaluation on
    // the new résumé so Khetha IQ never ranks them on the superseded one.
    if (resumeReplaced && record.hire_candidate_id) {
      waitUntil(refreshCandidateResume(base44, record.id, replacedResumeUrl, resumeExtract));
    }

    // ── The existing admin SMS: once, after submission only ───────────────
    if (!record.admin_sms_notified_at) {
      const sent = await sendAdminNewApplicationSms({
        positionLabel: 'Sales Growth Advisor',
        fullName,
        email,
      });
      if (sent) {
        await base44.asServiceRole.entities.JobApplication.update(record.id, {
          admin_sms_notified_at: new Date().toISOString(),
        }).catch(() => {});
      }
    }

    return Response.json({ success: true, first_name: firstName });
  } catch (error: any) {
    console.error('completeCareersProfile error:', error?.message || error);
    return Response.json({ error: 'We could not save your Careers Profile. Please try again.' }, { status: 500 });
  }
}

/**
 * Refreshes the Khetha IQ candidate's résumé reference and clears the previous
 * evaluation so the existing re-evaluation rules produce a fresh one.
 */
async function refreshCandidateResume(base44: any, applicationId: string, resumeUrl: string, extract: any): Promise<void> {
  try {
    const app = await base44.asServiceRole.entities.JobApplication.get(applicationId).catch(() => null);
    const candidateId = app?.hire_candidate_id;
    if (!candidateId) return;

    const resumeText = [
      `Name: ${app.full_name || ''}`,
      `Email: ${app.email || ''}`,
      `Phone: ${app.phone || ''}`,
      `Address: ${app.address || ''}`,
      `LinkedIn: ${app.linkedin || ''}`,
      `Résumé: ${resumeUrl}`,
      extract?.summary ? `Professional summary: ${extract.summary}` : '',
      (extract?.work_history || []).length ? `Work history:\n${extract.work_history.join('\n')}` : '',
      (extract?.education || []).length ? `Education:\n${extract.education.join('\n')}` : '',
      (extract?.certifications || []).length ? `Certifications:\n${extract.certifications.join('\n')}` : '',
      (extract?.skills || []).length ? `Skills: ${extract.skills.join(', ')}` : '',
      app.last_related_job ? `Most recent related experience: ${app.last_related_job}` : '',
      app.why_good_fit ? `Why a good fit: ${app.why_good_fit}` : '',
    ].filter(Boolean).join('\n');

    await base44.asServiceRole.entities.HireCandidate.update(candidateId, {
      resume_url: resumeUrl,
      resume_text: resumeText,
      resume_analysis: null,
      evaluation: null,
      documents: [{ url: resumeUrl, type: 'application_document' }],
    });
  } catch (error: any) {
    console.error('refreshCandidateResume error:', error?.message || error);
  }
}
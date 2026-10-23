// getCareersProfile/entry.ts
// Public, token-only lookup for the personalized Careers Profile.
// The token is the only key accepted: it resolves to exactly one applicant
// record, and nothing about any other applicant can be reached through it.
// No internal id and no personal detail is ever returned for a token that does
// not resolve, and an expired or revoked link is refused with a plain message.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import {
  loadApplicantByToken,
  linkStateFor,
  missingProfileFields,
} from '../../shared/careersProfileLink.ts';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body: any = await req.json().catch(() => ({}));
    const token = typeof body?.token === 'string' ? body.token.trim() : '';

    const record: any = await loadApplicantByToken(base44, token);
    if (!record) {
      return Response.json({ error_code: 'invalid_link' }, { status: 404 });
    }

    const state = linkStateFor(record);
    if (state === 'revoked' || state === 'expired') {
      return Response.json({ error_code: state }, { status: 410 });
    }

    // The position this applicant is being considered for, so the page can
    // point at the correct public job description.
    let jobTitle = 'Sales Growth Advisor';
    let jobLocation = '';
    let jobSourceUrl = '/SalesGrowthAdvisor';
    if (record.job_opening_id) {
      const jobRows = await base44.asServiceRole.entities.JobOpening.filter({
        job_id: record.job_opening_id,
      });
      const jobList = (jobRows as any)?.data ?? jobRows ?? [];
      const opening = Array.isArray(jobList) ? jobList[0] : null;
      if (opening) {
        jobTitle = opening.title || jobTitle;
        jobLocation = opening.location || '';
        jobSourceUrl = opening.source_url || jobSourceUrl;
      }
    }

    const completed = record.profile_completion_status === 'completed';
    const firstName = (record.full_name || '').split(' ')[0] || 'there';

    if (completed) {
      return Response.json({
        link_state: state,
        completion_status: 'completed',
        first_name: firstName,
        job_title: jobTitle,
      });
    }

    const extract = record.resume_extract || {};

    return Response.json({
      link_state: state,
      completion_status: record.profile_completion_status || 'awaiting_profile_completion',
      first_name: firstName,
      job_title: jobTitle,
      job_location: jobLocation,
      job_details_url: jobSourceUrl,
      missing_fields: missingProfileFields(record),
      fields: {
        full_name: record.full_name || '',
        email: record.email || '',
        phone: record.phone || '',
        address: record.address || '',
        dob: record.dob || '',
        linkedin: record.linkedin || '',
        last_related_job: record.last_related_job || '',
        why_good_fit: record.why_good_fit || '',
        race: record.race || '',
      },
      resume: {
        file_name: record.resume_file_name || '',
        url: record.portfolio_link || (record.documents || [])[0] || '',
      },
      experience: {
        summary: extract.summary || '',
        work_history: extract.work_history || [],
        education: extract.education || [],
        certifications: extract.certifications || [],
        skills: extract.skills || [],
        uncertain_fields: extract.uncertain_fields || [],
      },
    });
  } catch (error: any) {
    console.error('getCareersProfile error:', error?.message || error);
    return Response.json({ error: 'Could not open this Careers Profile.' }, { status: 500 });
  }
}
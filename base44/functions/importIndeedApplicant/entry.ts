// importIndeedApplicant/entry.ts
// Import Indeed Applicant — the administrator side of the Indeed Fast-Track.
//
// Creates or matches ONE applicant record in the existing recruiting pipeline
// (JobApplication), marks it as imported from Indeed and awaiting profile
// completion, and issues a personalized Careers Profile link whose token
// belongs to that record alone.
//
// Actions: import | regenerate_link | revoke_link
// Admin authorization is required for every action.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { waitUntil } from 'base44:runtime';
import { verifyAdmin } from '../../shared/adminAuth.ts';
import {
  generateCareersToken,
  tokenExpiryFrom,
  careersProfileUrl,
  linkStateFor,
  indeedInvitationMessage,
} from '../../shared/careersProfileLink.ts';

const clean = (value: any): string => (typeof value === 'string' ? value.trim() : '');
const asList = (value: any): string[] =>
  Array.isArray(value) ? value.map((v) => clean(v)).filter(Boolean) : [];

function asArray(result: any): any[] {
  const list = result?.data ?? result ?? [];
  return Array.isArray(list) ? list : [];
}

/** Loads an applicant by id, treating an unrecognised id as "not found". */
async function loadApplication(base44: any, applicationId: string): Promise<any | null> {
  const rows = asArray(
    await base44.asServiceRole.entities.JobApplication.filter({ id: applicationId }).catch(() => []),
  );
  return rows[0] || null;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const body: any = await req.json().catch(() => ({}));

    const auth = await verifyAdmin(base44, body, url);
    if (!auth.authorized) {
      return Response.json({ error: auth.error || 'Unauthorized — admin only' }, { status: 403 });
    }

    const action = clean(body.action) || 'import';

    // ── Link lifecycle ────────────────────────────────────────────────────
    if (action === 'get_link' || action === 'regenerate_link' || action === 'revoke_link') {
      const applicationId = clean(body.application_id);
      if (!applicationId) return Response.json({ error: 'application_id is required' }, { status: 400 });

      const existing = await loadApplication(base44, applicationId);
      if (!existing) return Response.json({ error: 'Applicant not found' }, { status: 404 });

      // Reads the current link without changing it, so an administrator can
      // copy the link or the Indeed message that already exists.
      if (action === 'get_link') {
        const currentState = linkStateFor(existing);
        if (currentState !== 'active') {
          return Response.json({ success: true, link_state: currentState, link: '', invitation_message: '' });
        }
        const currentLink = careersProfileUrl(existing.careers_profile_token);
        return Response.json({
          success: true,
          link_state: 'active',
          link: currentLink,
          invitation_message: indeedInvitationMessage({
            firstName: (existing.full_name || '').split(' ')[0] || 'there',
            link: currentLink,
          }),
          token_created_at: existing.careers_profile_token_created_at || '',
          token_expires_at: existing.careers_profile_token_expires_at || '',
        });
      }

      if (action === 'revoke_link') {
        await base44.asServiceRole.entities.JobApplication.update(applicationId, {
          careers_profile_link_revoked_at: new Date().toISOString(),
        });
        return Response.json({ success: true, link_state: 'revoked' });
      }

      // Regenerating replaces the token, so the previous link stops working.
      const token = generateCareersToken();
      const expiresAt = tokenExpiryFrom();
      await base44.asServiceRole.entities.JobApplication.update(applicationId, {
        careers_profile_token: token,
        careers_profile_token_created_at: new Date().toISOString(),
        careers_profile_token_expires_at: expiresAt,
        careers_profile_link_revoked_at: '',
      });

      const link = careersProfileUrl(token);
      return Response.json({
        success: true,
        link,
        invitation_message: indeedInvitationMessage({
          firstName: (existing.full_name || '').split(' ')[0] || 'there',
          link,
        }),
        link_state: 'active',
        token_expires_at: expiresAt,
      });
    }

    // ── Import ────────────────────────────────────────────────────────────
    const jobOpeningId = clean(body.job_opening_id);
    const fullName = clean(body.full_name);
    const email = clean(body.email).toLowerCase();
    const resumeUrl = clean(body.resume_url);

    if (!jobOpeningId) return Response.json({ error: 'Select a Sales Growth Advisor opening' }, { status: 400 });
    if (!fullName) return Response.json({ error: 'Full name is required' }, { status: 400 });
    if (!email || !email.includes('@')) return Response.json({ error: 'A valid email address is required' }, { status: 400 });

    const jobRows = await base44.asServiceRole.entities.JobOpening.filter({ job_id: jobOpeningId });
    const opening = asArray(jobRows)[0];
    if (!opening) return Response.json({ error: 'Job opening not found' }, { status: 404 });

    const extractInput = body.resume_extract || {};
    const resumeExtract = {
      summary: clean(extractInput.summary),
      work_history: asList(extractInput.work_history),
      education: asList(extractInput.education),
      certifications: asList(extractInput.certifications),
      skills: asList(extractInput.skills),
      uncertain_fields: asList(extractInput.uncertain_fields),
      extracted_at: new Date().toISOString(),
    };

    // Duplicate detection on the applicant identifiers already used by the
    // pipeline: email within the same opening.
    const matches = asArray(
      await base44.asServiceRole.entities.JobApplication.filter({
        email,
        job_opening_id: jobOpeningId,
      }),
    );
    const existing = matches[0] || null;

    const alreadyCompleted = !!existing &&
      (existing.profile_completion_status === 'completed' || (!existing.imported_from_indeed && !!existing.application_submitted_at));

    if (alreadyCompleted) {
      // Never overwrite a completed application with an imported one.
      return Response.json(
        {
          error: 'duplicate',
          message: 'This applicant already has a completed application for this position.',
          application_id: existing.id,
          profile_completion_status: 'completed',
        },
        { status: 409 },
      );
    }

    const token = generateCareersToken();
    const tokenCreatedAt = new Date().toISOString();
    const tokenExpiresAt = tokenExpiryFrom();

    const sharedFields: any = {
      tenant_id: 'tnt_estate_media',
      full_name: fullName,
      email,
      phone: clean(body.phone),
      address: clean(body.address),
      dob: clean(body.dob),
      linkedin: clean(body.linkedin),
      portfolio_link: resumeUrl || clean(existing?.portfolio_link),
      documents: resumeUrl ? [resumeUrl] : existing?.documents || [],
      last_related_job: clean(body.last_related_job),
      why_good_fit: '',
      position: 'sales_growth_advisor',
      job_opening_id: jobOpeningId,
      imported_from_indeed: true,
      profile_completion_status: 'awaiting_profile_completion',
      resume_file_name: clean(body.resume_file_name) || existing?.resume_file_name || '',
      resume_extract: resumeExtract,
      careers_profile_token: token,
      careers_profile_token_created_at: tokenCreatedAt,
      careers_profile_token_expires_at: tokenExpiresAt,
      careers_profile_link_revoked_at: '',
      source: 'arriv_estate_media',
      application_source: 'indeed',
      application_source_detail: 'Indeed résumé imported by recruiting admin',
      origin_application: 'arriv_estate_media',
    };

    let applicationId: string;
    if (existing) {
      // Re-import / correction: update the same applicant record and issue a
      // fresh link, which invalidates the previous one.
      const updated = await base44.asServiceRole.entities.JobApplication.update(existing.id, sharedFields);
      applicationId = (updated as any)?.id || existing.id;
    } else {
      const created = await base44.asServiceRole.entities.JobApplication.create({
        ...sharedFields,
        status: 'received',
        application_started_at: '',
        application_submitted_at: '',
      });
      applicationId = (created as any)?.id;
    }

    // Keep the local Khetha IQ candidate in step with this applicant. The
    // function is idempotent — it matches on email and only evaluates a
    // candidate it has not seen before.
    if (applicationId) {
      waitUntil(
        base44.asServiceRole.functions
          .invoke('syncApplicationToKhethaIQ', { application_id: applicationId })
          .catch(() => {}),
      );
    }

    const link = careersProfileUrl(token);

    return Response.json({
      success: true,
      application_id: applicationId,
      matched_existing: !!existing,
      link,
      invitation_message: indeedInvitationMessage({
        firstName: fullName.split(' ')[0] || 'there',
        link,
      }),
      link_state: linkStateFor({ careers_profile_token: token, careers_profile_token_expires_at: tokenExpiresAt }),
      token_expires_at: tokenExpiresAt,
    });
  } catch (error: any) {
    console.error('importIndeedApplicant error:', error?.message || error);
    return Response.json({ error: error?.message || 'Import failed' }, { status: 500 });
  }
}